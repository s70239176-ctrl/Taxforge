import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/db";
import { buildReport, anchorReport } from "@/lib/reports/generate";
import { computePortfolioImpact } from "@/lib/reports/portfolio-impact";
import { logEvent } from "@/lib/logging";

export const runtime = "nodejs";

const GenerateSchema = z.object({
  walletAddress: z.string().min(4),
  jurisdiction: z.enum(["US", "DE", "FR", "EU_GENERIC"]).default("US"),
  method: z.enum(["FIFO", "LIFO", "HIFO"]).default("FIFO"),
  periodStart: z.string(),
  periodEnd: z.string(),
  anchor: z.boolean().default(false),
});

/**
 * GET /api/tax/reports?wallet=0x... — lists every report generated for a
 * wallet/agent. This is the canonical path for OKX.AI review and for
 * agents/users listing their own report history; /api/reports (no /tax/
 * prefix) remains as a backward-compatible alias used by the in-app
 * dashboard.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "invalid_request", message: "Missing required ?wallet= query param." }, { status: 400 });
  }
  const store = getStore();
  const reports = await store.getReports(wallet);
  logEvent({ level: "info", event: "tax_reports_listed", wallet, count: reports.length });
  return NextResponse.json({ wallet, reports });
}

/**
 * POST /api/tax/reports — generates (and optionally anchors) a report from
 * whatever's already been persisted for this wallet (via /api/tax/simulate
 * or the dashboard). Free/session-based, matching /api/reports; the
 * x402-metered version for pure agent-to-agent calls lives at
 * /api/a2mcp/report.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = GenerateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { walletAddress, jurisdiction, method, periodStart, periodEnd, anchor } = parsed.data;

  const store = getStore();
  const allTxs = await store.getTransactions(walletAddress);
  const inRange = allTxs.filter((t) => t.timestamp >= periodStart && t.timestamp <= periodEnd);

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

  logEvent({ level: "info", event: "tax_report_generated", walletAddress, reportId: report.id, anchored: anchor });
  return NextResponse.json({ report, impact });
}
