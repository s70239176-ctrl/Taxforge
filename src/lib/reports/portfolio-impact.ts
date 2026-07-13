import { matchDisposal, openLot } from "@/lib/tax/cost-basis";
import { computeTaxImpact } from "@/lib/tax/rules-engine";
import type { ClassifiedTransaction, CostBasisMethod, Jurisdiction } from "@/lib/tax/types";

/**
 * Rolls a set of already-classified transactions up into a single portfolio
 * TaxImpact. Shared by the free session-based report route and the paid
 * A2MCP report route so both surfaces are guaranteed to produce identical
 * numbers for the same inputs.
 */
export function computePortfolioImpact(
  txs: ClassifiedTransaction[],
  jurisdiction: Jurisdiction,
  method: CostBasisMethod
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
