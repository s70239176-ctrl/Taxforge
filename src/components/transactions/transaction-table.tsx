"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, CATEGORY_STYLE } from "@/components/ui/badge";
import { truncateHash, formatUsd } from "@/lib/utils";
import type { ClassifiedTransaction } from "@/lib/tax/types";
import { DEMO_WALLET } from "@/lib/demo-config";

const CHAIN_LABEL: Record<string, string> = {
  "x-layer": "X Layer",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  base: "Base",
  "okx-chain": "OKX Chain",
};

const CATEGORIES = [
  "ALL",
  "TRANSFER",
  "SWAP",
  "DEFI_YIELD",
  "STAKING_REWARD",
  "AIRDROP",
  "AGENT_PAYMENT",
  "MEV",
  "NFT_TRADE",
  "BRIDGE",
  "GAS_REFUND",
] as const;

export function TransactionTable() {
  const [txs, setTxs] = useState<ClassifiedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>("ALL");
  const [chainFilter, setChainFilter] = useState<string>("ALL");

  useEffect(() => {
    fetch(`/api/classify?wallet=${DEMO_WALLET}`)
      .then((r) => r.json())
      .then((data) => {
        const sorted = [...(data.transactions ?? [])].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setTxs(sorted);
      })
      .finally(() => setLoading(false));
  }, []);

  const chains = useMemo(() => ["ALL", ...Array.from(new Set(txs.map((t) => t.chain)))], [txs]);

  const filtered = useMemo(
    () =>
      txs.filter(
        (t) => (filter === "ALL" || t.category === filter) && (chainFilter === "ALL" || t.chain === chainFilter)
      ),
    [txs, filter, chainFilter]
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-eyebrow mr-1">Category</span>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-sm border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors ${
                filter === c
                  ? "border-ink-faint bg-panel-raised text-ink"
                  : "border-line text-ink-faint hover:text-ink-muted"
              }`}
            >
              {c === "ALL" ? "all" : CATEGORY_STYLE[c]?.label ?? c.toLowerCase()}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-eyebrow mr-1">Chain</span>
          {chains.map((c) => (
            <button
              key={c}
              onClick={() => setChainFilter(c)}
              className={`rounded-sm border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors ${
                chainFilter === c
                  ? "border-ink-faint bg-panel-raised text-ink"
                  : "border-line text-ink-faint hover:text-ink-muted"
              }`}
            >
              {c === "ALL" ? "all" : CHAIN_LABEL[c] ?? c}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-2xs text-ink-faint">{filtered.length} rows</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-2 font-normal">Hash</th>
              <th className="px-2 py-2 font-normal">Chain</th>
              <th className="px-2 py-2 font-normal">Time</th>
              <th className="px-2 py-2 font-normal">Category</th>
              <th className="px-2 py-2 text-right font-normal">Amount</th>
              <th className="px-2 py-2 text-right font-normal">USD value</th>
              <th className="px-2 py-2 font-normal">Tax treatment</th>
              <th className="px-4 py-2 text-right font-normal">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center font-mono text-ink-faint">
                  loading transaction feed…
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((tx) => {
                const style = CATEGORY_STYLE[tx.category] ?? CATEGORY_STYLE.UNKNOWN!;
                const usdValue = tx.amount * tx.priceUsdAtTx;
                return (
                  <tr key={tx.hash} className="border-b border-line-soft hover:bg-panel-raised">
                    <td className="px-4 py-2 font-mono text-ink-muted">{truncateHash(tx.hash)}</td>
                    <td className="px-2 py-2 text-ink-muted">{CHAIN_LABEL[tx.chain] ?? tx.chain}</td>
                    <td className="px-2 py-2 font-mono text-ink-faint">
                      {new Date(tx.timestamp).toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant={style.variant}>{style.label}</Badge>
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-tabular text-ink">
                      {tx.direction === "IN" ? "+" : "−"}
                      {tx.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {tx.asset}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-tabular text-ink-muted">
                      {formatUsd(usdValue)}
                    </td>
                    <td className="px-2 py-2 text-ink-faint">{tx.taxable ? "taxable" : "non-taxable"}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-faint">
                      {Math.round(tx.confidence * 100)}%
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
