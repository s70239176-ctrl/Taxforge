"use client";

import { useEffect, useState } from "react";
import { Badge, CATEGORY_STYLE } from "@/components/ui/badge";
import { truncateHash, timeAgo } from "@/lib/utils";
import type { ClassifiedTransaction } from "@/lib/tax/types";
import { DEMO_WALLET } from "@/lib/demo-config";

const CHAIN_LABEL: Record<string, string> = {
  "x-layer": "XLAYER",
  ethereum: "ETH",
  arbitrum: "ARB",
  base: "BASE",
  "okx-chain": "OKX",
};

export function LedgerTape() {
  const [txs, setTxs] = useState<ClassifiedTransaction[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/classify?wallet=${DEMO_WALLET}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const sorted = [...(data.transactions ?? [])].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setTxs(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (txs.length === 0) return;
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount((c) => {
        if (c >= txs.length) {
          clearInterval(interval);
          return c;
        }
        return c + 1;
      });
    }, 90);
    return () => clearInterval(interval);
  }, [txs]);

  return (
    <div className="flex h-[520px] flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div>
          <div className="label-eyebrow mb-0.5">Live processing</div>
          <h3 className="font-display text-sm font-medium text-ink">Transaction Ledger</h3>
        </div>
        <div className="flex items-center gap-1.5 text-2xs font-mono text-ink-muted">
          <span className="live-dot" />
          {loading ? "connecting…" : `${txs.length} events`}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-2xs leading-relaxed">
        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-faint">
            <span className="animate-pulse">Streaming multi-chain feed…</span>
          </div>
        )}
        {!loading &&
          txs.slice(0, visibleCount).map((tx) => {
            const style = CATEGORY_STYLE[tx.category] ?? CATEGORY_STYLE.UNKNOWN!;
            const sign = tx.direction === "IN" ? "+" : "−";
            const amountColor =
              tx.direction === "IN" ? "text-gain" : tx.category === "TRANSFER" ? "text-ink-muted" : "text-loss";
            return (
              <div
                key={tx.hash}
                className="grid animate-tape-in grid-cols-[64px_60px_1fr_auto_auto] items-center gap-2 border-b border-line-soft py-1.5 hover:bg-panel-raised"
              >
                <span className="text-ink-faint">{truncateHash(tx.hash, 4, 3)}</span>
                <span className="text-ink-muted">{CHAIN_LABEL[tx.chain] ?? tx.chain}</span>
                <Badge variant={style.variant}>{style.label}</Badge>
                <span className={`text-right font-tabular ${amountColor}`}>
                  {sign}
                  {tx.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {tx.asset}
                </span>
                <span className="w-14 text-right text-ink-faint">{timeAgo(tx.timestamp)}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
