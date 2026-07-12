"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatUsd, truncateHash } from "@/lib/utils";
import { DEMO_WALLET } from "@/lib/demo-config";
import type { CostBasisMethod, Jurisdiction, TaxReport } from "@/lib/tax/types";

const selectCls =
  "h-9 rounded-sm border border-line bg-panel-raised px-2 text-sm text-ink focus:border-signal focus:outline-none";

function daysAgoIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function ReportGenerator() {
  const [reports, setReports] = useState<TaxReport[]>([]);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("US");
  const [method, setMethod] = useState<CostBasisMethod>("FIFO");
  const [periodDays, setPeriodDays] = useState("220");
  const [anchor, setAnchor] = useState(true);
  const [loading, setLoading] = useState(false);

  async function loadReports() {
    const res = await fetch(`/api/reports?wallet=${DEMO_WALLET}`);
    const data = await res.json();
    setReports(data.reports ?? []);
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function generate() {
    setLoading(true);
    try {
      // Ensure the transaction feed is classified/cached before reporting on it.
      await fetch(`/api/classify?wallet=${DEMO_WALLET}`);
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: DEMO_WALLET,
          jurisdiction,
          method,
          periodStart: daysAgoIso(Number(periodDays)),
          periodEnd: new Date().toISOString(),
          anchor,
        }),
      });
      await loadReports();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <label className="flex flex-col gap-1">
          <span className="label-eyebrow">Jurisdiction</span>
          <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value as Jurisdiction)} className={selectCls}>
            <option value="US">United States</option>
            <option value="DE">Germany</option>
            <option value="FR">France</option>
            <option value="EU_GENERIC">EU (generic)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-eyebrow">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as CostBasisMethod)} className={selectCls}>
            <option value="FIFO">FIFO</option>
            <option value="LIFO">LIFO</option>
            <option value="HIFO">HIFO</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-eyebrow">Period (days back)</span>
          <input
            value={periodDays}
            onChange={(e) => setPeriodDays(e.target.value)}
            className={selectCls + " w-24 font-mono"}
            inputMode="numeric"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-2xs text-ink-muted">
          <input type="checkbox" checked={anchor} onChange={(e) => setAnchor(e.target.checked)} className="accent-gain" />
          Anchor attestation hash on X Layer
        </label>
        <Button variant="primary" onClick={generate} disabled={loading} className="ml-auto">
          {loading ? "Generating…" : "Generate report"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        {reports.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-faint">No reports generated yet for this wallet.</p>
        )}
        {[...reports].reverse().map((r) => (
          <div key={r.id} className="hairline flex flex-col gap-2 rounded p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm text-ink">{r.id}</span>
                <StatusPill status={r.status} />
              </div>
              <div className="mt-1 text-2xs text-ink-muted">
                {r.jurisdiction} · {r.method} · {r.periodStart.slice(0, 10)} → {r.periodEnd.slice(0, 10)} ·{" "}
                {r.transactionCount} txs
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
                <span className="text-ink-muted">
                  Gain: <span className={r.totalRealizedGainUsd >= 0 ? "text-gain" : "text-loss"}>{formatUsd(r.totalRealizedGainUsd)}</span>
                </span>
                <span className="text-ink-muted">Tax: {formatUsd(r.totalEstimatedTaxUsd)}</span>
                <span className="font-mono text-ink-faint">hash {truncateHash(r.attestationHash, 8, 6)}</span>
                {r.anchorTxHash && <span className="font-mono text-signal">anchor {truncateHash(r.anchorTxHash, 6, 4)}</span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <a href={`/api/reports/${r.id}/pdf?wallet=${DEMO_WALLET}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  PDF
                </Button>
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${r.id}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                JSON
              </Button>
              <Button size="sm" variant="ghost">
                Share to accountant
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TaxReport["status"] }) {
  const map = {
    DRAFT: "border-line text-ink-muted bg-panel-raised",
    FINAL: "border-signal/30 text-signal bg-signal-dim",
    ANCHORED: "border-gain/30 text-gain bg-gain-dim",
  } as const;
  return (
    <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wide ${map[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}
