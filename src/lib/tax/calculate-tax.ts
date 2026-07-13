import { classifyBatch } from "@/lib/ai/classify";
import { computePortfolioImpact } from "@/lib/reports/portfolio-impact";
import { hashReportPayload } from "@/lib/reports/generate";
import type { ClassifiedTransaction, CostBasisMethod, Jurisdiction, RawTransaction, TaxImpact } from "@/lib/tax/types";

export interface CalculateTaxResult {
  estimatedTax: number;
  realizedGain: number;
  reportHash: string;
  transactionCount: number;
  impact: TaxImpact;
  classified: ClassifiedTransaction[];
}

/**
 * Real, minimal entry point matching the "sort by timestamp, track cost
 * basis, calculate gains, return { estimatedTax, reportHash }" shape.
 * Not a toy — this calls the same classifier (`classifyBatch`, live Claude
 * or heuristic fallback) and the same FIFO/LIFO/HIFO engine
 * (`computePortfolioImpact`) that backs every other endpoint in the app, so
 * numbers here are guaranteed consistent with /api/tax/reports and the
 * dashboard. `reportHash` is a SHA-256 over the canonical classified
 * transaction set + totals — the same hashing function reports get
 * attested with (src/lib/reports/generate.ts). Returns the classified
 * transactions too, so callers persisting results don't need to re-run
 * classification (which would double LLM cost per call).
 */
export async function calculateTax(
  transactions: RawTransaction[],
  options: { jurisdiction?: Jurisdiction; method?: CostBasisMethod } = {}
): Promise<CalculateTaxResult> {
  const jurisdiction = options.jurisdiction ?? "US";
  const method = options.method ?? "FIFO";

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const classified = await classifyBatch(sorted);
  const impact = computePortfolioImpact(classified, jurisdiction, method);

  const reportHash = hashReportPayload({
    jurisdiction,
    method,
    transactionCount: classified.length,
    transactions: classified,
    realizedGainUsd: round2(impact.realizedGainUsd),
    estimatedTaxUsd: round2(impact.estimatedTaxUsd),
  });

  return {
    estimatedTax: round2(impact.estimatedTaxUsd),
    realizedGain: round2(impact.realizedGainUsd),
    reportHash,
    transactionCount: classified.length,
    impact,
    classified,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
