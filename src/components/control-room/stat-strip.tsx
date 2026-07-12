"use client";

import { useEffect, useState } from "react";
import { StatBlock } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import { openLot, matchDisposal } from "@/lib/tax/cost-basis";
import { computeTaxImpact } from "@/lib/tax/rules-engine";
import type { ClassifiedTransaction } from "@/lib/tax/types";
import { DEMO_WALLET } from "@/lib/demo-config";

interface Summary {
  realizedGainUsd: number;
  estimatedTaxUsd: number;
  ordinaryIncomeUsd: number;
  txCount: number;
}

function summarize(txs: ClassifiedTransaction[]): Summary {
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
      .map((t) => openLot({ asset, amount: t.amount, costBasisUsdPerUnit: t.priceUsdAtTx, acquiredAt: t.timestamp, sourceTxHash: t.hash }));
    for (const t of assetTxs) {
      if (t.direction === "OUT" && t.taxable) {
        const { disposals } = matchDisposal(lots, {
          asset,
          amount: t.amount,
          proceedsUsd: t.amount * t.priceUsdAtTx,
          disposedAt: t.timestamp,
          method: "FIFO",
        });
        allDisposals.push(...disposals);
      }
      if (t.direction === "IN" && (t.incomeType === "ORDINARY_INCOME" || t.incomeType === "BUSINESS_INCOME")) {
        ordinaryIncomeUsd += t.amount * t.priceUsdAtTx;
      }
    }
  }

  const impact = computeTaxImpact({ asset: "PORTFOLIO", jurisdiction: "US", method: "FIFO", disposals: allDisposals, ordinaryIncomeUsd });
  return {
    realizedGainUsd: impact.realizedGainUsd,
    estimatedTaxUsd: impact.estimatedTaxUsd,
    ordinaryIncomeUsd,
    txCount: txs.length,
  };
}

export function StatStrip() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch(`/api/classify?wallet=${DEMO_WALLET}`)
      .then((r) => r.json())
      .then((data) => setSummary(summarize(data.transactions ?? [])))
      .catch(() => setSummary(null));
  }, []);

  return (
    <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-4">
      <StatBlock
        label="Realized gain (YTD, FIFO)"
        value={summary ? formatUsd(summary.realizedGainUsd) : "—"}
        delta={summary ? "computed across 4 chains" : undefined}
        deltaTone={summary && summary.realizedGainUsd >= 0 ? "gain" : "loss"}
      />
      <StatBlock
        label="Est. tax liability"
        value={summary ? formatUsd(summary.estimatedTaxUsd) : "—"}
        delta={summary ? "US, current bracket assumption" : undefined}
      />
      <StatBlock
        label="Ordinary + business income"
        value={summary ? formatUsd(summary.ordinaryIncomeUsd) : "—"}
        delta="yield, staking, airdrops, A2A"
      />
      <StatBlock
        label="Events processed"
        value={summary ? summary.txCount.toLocaleString() : "—"}
        delta="18,204 A2MCP calls served"
        deltaTone="neutral"
      />
    </div>
  );
}
