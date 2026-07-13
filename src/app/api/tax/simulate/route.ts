import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePayment } from "@/lib/x402/middleware";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { calculateTax } from "@/lib/tax/calculate-tax";
import { getStore } from "@/lib/db";
import { logEvent } from "@/lib/logging";

export const runtime = "nodejs";

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

const RequestSchema = z.object({
  transactions: z.array(TxSchema).min(1).max(500),
  walletAddress: z.string().min(4),
  jurisdiction: z.enum(["US", "DE", "FR", "EU_GENERIC"]).default("US"),
  method: z.enum(["FIFO", "LIFO", "HIFO"]).default("FIFO"),
  /** If true (default), persists the classified batch so /api/tax/reports can build a report from it later. */
  persist: z.boolean().default(true),
});

/**
 * POST /api/tax/simulate — the live, agent-callable A2MCP endpoint.
 *
 * Accepts an array of raw transactions (hash, chain, amount, timestamps,
 * etc.), runs them through the real classifier and FIFO/LIFO/HIFO
 * cost-basis engine, and returns the resulting tax impact plus a SHA-256
 * report hash over the exact classified set — instantly, in one call.
 * Gated by x402: no X-PAYMENT header gets you a 402 with the price; a
 * valid one gets you the real answer.
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  const agentId = req.headers.get("X-Agent-Id") ?? req.headers.get("x-forwarded-for") ?? "anonymous";

  const rl = await checkRateLimitAsync(`tax-simulate:${agentId}`);
  if (!rl.allowed) {
    logEvent({ level: "warn", event: "rate_limited", route: "/api/tax/simulate", agentId });
    return NextResponse.json(
      { error: "rate_limited", message: "Too many calls.", resetAtMs: rl.resetAtMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAtMs - Date.now()) / 1000)) } }
    );
  }

  const priceUsd = process.env.X402_PRICE_SIMULATE ?? "0.15";
  const gate = await requirePayment(req, "/api/tax/simulate", priceUsd);
  if (!gate.ok) return gate.response!;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { transactions, walletAddress, jurisdiction, method, persist } = parsed.data;

  try {
    const result = await calculateTax(transactions, { jurisdiction, method });

    if (persist) {
      const store = getStore();
      const existing = await store.getTransactions(walletAddress);
      const byHash = new Map(existing.map((t) => [t.hash, t]));
      for (const tx of result.classified) byHash.set(tx.hash, tx);
      await store.saveTransactions(walletAddress, Array.from(byHash.values()));
    }

    logEvent({
      level: "info",
      event: "tax_simulate_completed",
      agentId,
      walletAddress,
      transactionCount: result.transactionCount,
      estimatedTax: result.estimatedTax,
      settlementTxHash: gate.settlementTxHash,
      latencyMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      agentId,
      settlementTxHash: gate.settlementTxHash,
      estimatedTax: result.estimatedTax,
      realizedGain: result.realizedGain,
      reportHash: result.reportHash,
      transactionCount: result.transactionCount,
      impact: result.impact,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logEvent({ level: "error", event: "tax_simulate_error", agentId, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "internal_error", message: "Failed to compute tax impact." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "TaxForge — /api/tax/simulate",
    description: "POST an array of transactions to get a real, instant tax-impact readout and report hash.",
    pricing: { asset: process.env.X402_ASSET ?? "USDT", pricePerCall: process.env.X402_PRICE_SIMULATE ?? "0.15" },
    docs: "/docs",
  });
}
