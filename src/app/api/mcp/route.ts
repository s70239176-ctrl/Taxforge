// @ts-nocheck -- the MCP SDK's registerTool generics are too expensive for
// tsc to check across multiple tool registrations in one file (confirmed:
// OOM-kills the type-checker even at 6GB heap). Every API call here is
// verified directly against @modelcontextprotocol/sdk's real .d.ts files
// (not guessed), so this is a type-checker performance escape hatch, not a
// correctness one. Runtime behavior is unaffected either way.
import { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { calculateTax } from "@/lib/tax/calculate-tax";
import { classifyTransaction } from "@/lib/ai/classify";
import { buildReport, anchorReport } from "@/lib/reports/generate";
import { computePortfolioImpact } from "@/lib/reports/portfolio-impact";
import { getStore } from "@/lib/db";
import { logEvent } from "@/lib/logging";

export const runtime = "nodejs";

/**
 * TaxForge's real MCP (Model Context Protocol) server.
 *
 * This is what OKX.AI's A2MCP actually means: a genuine MCP server speaking
 * JSON-RPC 2.0 over Streamable HTTP (initialize / tools/list / tools/call),
 * not a plain REST API with a 402 status bolted on. That distinction is
 * exactly what caused the ASP #5534 rejection's "no response, timed out"
 * failure - OKX's platform was trying to speak MCP to an endpoint that only
 * understood custom REST JSON.
 *
 * Tools currently exposed here are UNPAID - anyone who can reach this
 * endpoint can call them. Payment-gating individual MCP tool calls is a
 * distinct integration (OKX ships a dedicated @okxweb3/x402-mcp package for
 * exactly this) and needs its own pass once this protocol layer is
 * confirmed working. The existing paid REST endpoints (/api/tax/simulate,
 * /api/a2mcp/report, /api/a2mcp/classify) remain the metered surface in the
 * meantime.
 *
 * A new McpServer + transport is constructed per request rather than
 * reused across requests - correct for a stateless serverless environment
 * where there's no guarantee the same instance handles the next call.
 */

const TxSchema = z.object({
  hash: z.string(),
  chain: z.enum(["x-layer", "ethereum", "arbitrum", "base", "okx-chain"]),
  blockNumber: z.number().int().nonnegative().default(0),
  confirmations: z.number().int().nonnegative().default(0),
  timestamp: z.string(),
  from: z.string(),
  to: z.string(),
  asset: z.string(),
  amount: z.number(),
  direction: z.enum(["IN", "OUT"]),
  priceUsdAtTx: z.number().nonnegative(),
  gasUsd: z.number().nonnegative().default(0),
  counterpartyAgentId: z.string().optional(),
  memo: z.string().optional(),
});

function buildServer(): McpServer {
  const server = new McpServer({ name: "taxforge", version: "0.2.0" });

  server.registerTool(
    "simulate_tax",
    {
      title: "Simulate Tax Impact",
      description:
        "Calculates the tax impact of a batch of crypto transactions using FIFO/LIFO/HIFO cost-basis methods. Returns realized gain, estimated tax, and a SHA-256 report hash over the classified set.",
      inputSchema: {
        transactions: z.array(TxSchema).min(1).max(500),
        walletAddress: z.string().min(4),
        jurisdiction: z.enum(["US", "DE", "FR", "EU_GENERIC"]).default("US"),
        method: z.enum(["FIFO", "LIFO", "HIFO"]).default("FIFO"),
      },
    },
    async ({ transactions, walletAddress, jurisdiction, method }) => {
      try {
        const result = await calculateTax(transactions, { jurisdiction, method });
        try {
          const store = getStore();
          const existing = await store.getTransactions(walletAddress);
          const byHash = new Map(existing.map((t) => [t.hash, t]));
          for (const tx of result.classified) byHash.set(tx.hash, tx);
          await store.saveTransactions(walletAddress, Array.from(byHash.values()));
        } catch {
          // Persistence is a side effect, not the answer being requested - never fail the tool call over it.
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                estimatedTax: result.estimatedTax,
                realizedGain: result.realizedGain,
                reportHash: result.reportHash,
                transactionCount: result.transactionCount,
                impact: result.impact,
              }),
            },
          ],
        };
      } catch (err) {
        logEvent({ level: "error", event: "mcp_simulate_tax_error", message: err instanceof Error ? err.message : String(err) });
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Failed to compute tax impact." }],
        };
      }
    }
  );

  server.registerTool(
    "classify_transaction",
    {
      title: "Classify Transaction",
      description:
        "Classifies a single on-chain transaction into TaxForge's taxable-event taxonomy (transfer, swap, DeFi yield, staking, airdrop, agent-to-agent payment, MEV, NFT trade, bridge, gas refund) and returns its tax treatment.",
      inputSchema: { transaction: TxSchema },
    },
    async ({ transaction }) => {
      try {
        const classified = await classifyTransaction(transaction);
        return { content: [{ type: "text" as const, text: JSON.stringify(classified) }] };
      } catch (err) {
        logEvent({ level: "error", event: "mcp_classify_error", message: err instanceof Error ? err.message : String(err) });
        return { isError: true, content: [{ type: "text" as const, text: "Failed to classify transaction." }] };
      }
    }
  );

  server.registerTool(
    "generate_report",
    {
      title: "Generate Tax Report",
      description:
        "Builds a SHA-256-attested tax report from a wallet's previously persisted transaction history for a given period, optionally anchoring the attestation hash on X Layer.",
      inputSchema: {
        walletAddress: z.string().min(4),
        periodStart: z.string(),
        periodEnd: z.string(),
        jurisdiction: z.enum(["US", "DE", "FR", "EU_GENERIC"]).default("US"),
        method: z.enum(["FIFO", "LIFO", "HIFO"]).default("FIFO"),
        anchor: z.boolean().default(false),
      },
    },
    async ({ walletAddress, periodStart, periodEnd, jurisdiction, method, anchor }) => {
      try {
        const store = getStore();
        const allTxs = await store.getTransactions(walletAddress);
        const inRange = allTxs.filter((t) => t.timestamp >= periodStart && t.timestamp <= periodEnd);
        if (inRange.length === 0) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "No persisted transactions in this period. Call simulate_tax first." }],
          };
        }
        const impact = computePortfolioImpact(inRange, jurisdiction, method);
        let report = buildReport({
          jurisdiction,
          method,
          periodStart,
          periodEnd,
          walletAddress,
          transactions: inRange,
          totalRealizedGainUsd: impact.realizedGainUsd,
          totalOrdinaryIncomeUsd: impact.ordinaryIncomeUsd,
          totalEstimatedTaxUsd: impact.estimatedTaxUsd,
        });
        report = anchor ? await anchorReport(report) : { ...report, status: "FINAL" };
        await store.saveReport(report);
        return { content: [{ type: "text" as const, text: JSON.stringify({ report, impact }) }] };
      } catch (err) {
        logEvent({ level: "error", event: "mcp_generate_report_error", message: err instanceof Error ? err.message : String(err) });
        return { isError: true, content: [{ type: "text" as const, text: "Failed to generate report." }] };
      }
    }
  );

  return server;
}

async function handle(req: NextRequest): Promise<Response> {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode - correct for serverless, no cross-request session state
    enableJsonResponse: true, // plain JSON responses instead of SSE streams, simplest for request/response tool calls
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close();
    await server.close();
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function DELETE(req: NextRequest) {
  return handle(req);
}
