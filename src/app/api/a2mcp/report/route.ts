import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePayment } from "@/lib/x402/middleware";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getStore } from "@/lib/db";
import { buildReport, anchorReport } from "@/lib/reports/generate";
import { computePortfolioImpact } from "@/lib/reports/portfolio-impact";
import { logEvent } from "@/lib/logging";

export const runtime = "nodejs";

const RequestSchema = z.object({
  walletAddress: z.string().min(4),
  jurisdiction: z.enum(["US", "DE", "FR", "EU_GENERIC"]).default("US"),
  method: z.enum(["FIFO", "LIFO", "HIFO"]).default("FIFO"),
  periodStart: z.string(),
  periodEnd: z.string(),
  anchor: z.boolean().default(true),
});

/**
 * POST /api/a2mcp/report — the paid, x402-gated "full report generation"
 * service (2.5 USDT by default via X402_PRICE_REPORT). Builds a report from
 * whatever's already been persisted for the wallet (via /api/tax/simulate
 * or /api/tax/ingest), returns the SHA-256-attested report — anchored on
 * X Layer by default — as structured JSON instantly.
 *
 * This is distinct from GET/POST /api/tax/reports, which stays free and
 * session-based for the human dashboard; this route is the metered
 * agent-to-agent surface.
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  const agentId = req.headers.get("X-Agent-Id") ?? req.headers.get("x-forwarded-for") ?? "anonymous";

  const rl = await checkRateLimitAsync(`a2mcp-report:${agentId}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", resetAtMs: rl.resetAtMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAtMs - Date.now()) / 1000)) } }
    );
  }

  const priceUsd = process.env.X402_PRICE_REPORT ?? "2.50";
  const gate = await requirePayment(req, "/api/a2mcp/report", priceUsd);
  if (!gate.ok) return gate.response!;

  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { walletAddress, jurisdiction, method, periodStart, periodEnd, anchor } = parsed.data;

  try {
    const store = getStore();
    const allTxs = await store.getTransactions(walletAddress);
    const inRange = allTxs.filter((t) => t.timestamp >= periodStart && t.timestamp <= periodEnd);

    if (inRange.length === 0) {
      return NextResponse.json(
        {
          error: "no_transactions",
          message: "No persisted transactions in this period for this wallet. Call /api/tax/simulate or /api/tax/ingest first.",
        },
        { status: 404 }
      );
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

    logEvent({
      level: "info",
      event: "a2mcp_report_generated",
      agentId,
      walletAddress,
      reportId: report.id,
      anchored: anchor,
      settlementTxHash: gate.settlementTxHash,
      latencyMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      agentId,
      settlementTxHash: gate.settlementTxHash,
      report,
      impact,
      pdfUrl: `/api/reports/${report.id}/pdf?wallet=${walletAddress}`,
    });
  } catch (err) {
    logEvent({ level: "error", event: "a2mcp_report_error", agentId, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "internal_error", message: "Failed to generate report." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "TaxForge — /api/a2mcp/report",
    description: "POST to generate a SHA-256-attested, X Layer-anchored tax report from a wallet's persisted transaction history.",
    pricing: { asset: process.env.X402_ASSET ?? "USDT", pricePerCall: process.env.X402_PRICE_REPORT ?? "2.50" },
    docs: "/docs",
  });
}
