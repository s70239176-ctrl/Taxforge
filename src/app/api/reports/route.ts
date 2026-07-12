import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/db";
import { buildReport, anchorReport } from "@/lib/reports/generate";
import { computeTaxImpact } from "@/lib/tax/rules-engine";
import { matchDisposal, openLot } from "@/lib/tax/cost-basis";
import type { ClassifiedTransaction } from "@/lib/tax/types";

export const runtime = "nodejs";

const GenerateSchema = z.object({
  walletAddress: z.string().min(4),
  jurisdiction: z.enum(["US", "DE", "FR", "EU_GENERIC"]).default("US"),
  method: z.enum(["FIFO", "LIFO", "HIFO"]).default("FIFO"),
  periodStart: z.string(),
  periodEnd: z.string(),
  anchor: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "0xe8651e5faf1cfeabd196f3f8998d2da8b8b22bc2";
  const store = getStore();
  const reports = await store.getReports(wallet);
  return NextResponse.json({ wallet, reports });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = GenerateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { walletAddress, jurisdiction, method, periodStart, periodEnd, anchor } = parsed.data;

  const store = getStore();
  const allTxs = await store.getTransactions(walletAddress);
  const inRange = allTxs.filter(
    (t) => t.timestamp >= periodStart && t.timestamp <= periodEnd
  );

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

  if (anchor) {
    report = await anchorReport(report);
  } else {
    report = { ...report, status: "FINAL" };
  }

  await store.saveReport(report);
  return NextResponse.json({ report, impact });
}

function computePortfolioImpact(
  txs: ClassifiedTransaction[],
  jurisdiction: Parameters<typeof computeTaxImpact>[0]["jurisdiction"],
  method: Parameters<typeof computeTaxImpact>[0]["method"]
) {
  const byAsset = new Map<string, ClassifiedTransaction[]>();
  for (const tx of txs) {
    const list = byAsset.get(tx.asset) ?? [];
    list.push(tx);
    byAsset.set(tx.asset, list);
  }

  const allDisposals: ReturnType<typeof computeTaxImpact>["disposals"] = [];
  let ordinaryIncomeUsd = 0;

  for (const [asset, assetTxs] of byAsset) {
    const lots = assetTxs
      .filter((t) => t.direction === "IN")
      .map((t) =>
        openLot({
          asset,
          amount: t.amount,
          costBasisUsdPerUnit: t.priceUsdAtTx,
          acquiredAt: t.timestamp,
          sourceTxHash: t.hash,
        })
      );

    for (const t of assetTxs) {
      if (t.direction === "OUT" && t.taxable) {
        const { disposals } = matchDisposal(lots, {
          asset,
          amount: t.amount,
          proceedsUsd: t.amount * t.priceUsdAtTx,
          disposedAt: t.timestamp,
          method,
        });
        allDisposals.push(...disposals);
      }
      if (t.direction === "IN" && (t.incomeType === "ORDINARY_INCOME" || t.incomeType === "BUSINESS_INCOME")) {
        ordinaryIncomeUsd += t.amount * t.priceUsdAtTx;
      }
    }
  }

  return computeTaxImpact({ asset: "PORTFOLIO", jurisdiction, method, disposals: allDisposals, ordinaryIncomeUsd });
}
