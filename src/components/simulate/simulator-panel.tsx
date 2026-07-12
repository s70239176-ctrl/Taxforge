"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { DEMO_WALLET } from "@/lib/demo-config";
import type { CostBasisMethod, Jurisdiction, SimulationResult } from "@/lib/tax/types";

const ASSETS = ["OKB", "ETH", "USDC", "ARB"];
const CHAINS = ["x-layer", "ethereum", "arbitrum", "base"] as const;

export function SimulatorPanel() {
  const [chain, setChain] = useState<(typeof CHAINS)[number]>("x-layer");
  const [assetIn, setAssetIn] = useState("OKB");
  const [amountIn, setAmountIn] = useState("500");
  const [priceUsdIn, setPriceUsdIn] = useState("58.40");
  const [assetOut, setAssetOut] = useState("USDC");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("US");
  const [method, setMethod] = useState<CostBasisMethod>("FIFO");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSimulation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain,
          assetIn,
          amountIn: Number(amountIn),
          assetOut,
          expectedAmountOut: Number(amountIn) * Number(priceUsdIn) * 0.997,
          priceUsdIn: Number(priceUsdIn),
          walletAddress: DEMO_WALLET,
          jurisdiction,
          method,
        }),
      });
      if (!res.ok) throw new Error(`Simulation failed (${res.status})`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4 border-b border-line p-4 lg:border-b-0 lg:border-r">
        <Field label="Chain">
          <select value={chain} onChange={(e) => setChain(e.target.value as (typeof CHAINS)[number])} className={selectCls}>
            {CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Asset in">
            <select value={assetIn} onChange={(e) => setAssetIn(e.target.value)} className={selectCls}>
              {ASSETS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Asset out">
            <select value={assetOut} onChange={(e) => setAssetOut(e.target.value)} className={selectCls}>
              {ASSETS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount in">
            <input value={amountIn} onChange={(e) => setAmountIn(e.target.value)} className={inputCls} inputMode="decimal" />
          </Field>
          <Field label="Price / unit (USD)">
            <input value={priceUsdIn} onChange={(e) => setPriceUsdIn(e.target.value)} className={inputCls} inputMode="decimal" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Jurisdiction">
            <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value as Jurisdiction)} className={selectCls}>
              <option value="US">United States</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="EU_GENERIC">EU (generic)</option>
            </select>
          </Field>
          <Field label="Cost-basis method">
            <select value={method} onChange={(e) => setMethod(e.target.value as CostBasisMethod)} className={selectCls}>
              <option value="FIFO">FIFO</option>
              <option value="LIFO">LIFO</option>
              <option value="HIFO">HIFO</option>
            </select>
          </Field>
        </div>

        <Button variant="primary" size="lg" onClick={runSimulation} disabled={loading} className="mt-1">
          {loading ? "Simulating…" : "Simulate tax impact"}
        </Button>
        {error && <p className="text-2xs text-loss">{error}</p>}
        <p className="text-2xs text-ink-faint">
          Same logic an autonomous trading agent runs against{" "}
          <code className="text-ink-muted">/api/a2mcp/simulate</code> before it executes, gated by x402.
        </p>
      </div>

      <div className="p-4">
        {!result && (
          <div className="flex h-full min-h-[280px] items-center justify-center text-center text-sm text-ink-faint">
            Configure a hypothetical trade and run the simulation to see realized gain, holding-period split, and
            estimated tax before you execute anything on-chain.
          </div>
        )}
        {result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Realized gain" value={formatUsd(result.impact.realizedGainUsd)} tone={result.impact.realizedGainUsd >= 0 ? "gain" : "loss"} />
              <Metric label="Est. tax" value={formatUsd(result.impact.estimatedTaxUsd)} tone="pending" />
              <Metric label="Effective rate" value={`${result.impact.effectiveRatePct.toFixed(1)}%`} />
              <Metric label="Net proceeds after tax" value={formatUsd(result.netProceedsAfterTaxUsd)} tone="gain" />
            </div>

            <div className="hairline rounded bg-panel-raised p-3">
              <div className="label-eyebrow mb-1">Agent recommendation</div>
              <p className="text-sm text-ink">{result.recommendation}</p>
            </div>

            <div>
              <div className="label-eyebrow mb-2">Estimated tax by cost-basis method</div>
              <div className="grid grid-cols-3 gap-2">
                {(["FIFO", "LIFO", "HIFO"] as CostBasisMethod[]).map((m) => {
                  const v = result.alternativeMethods[m];
                  const active = m === method;
                  return (
                    <div
                      key={m}
                      className={`hairline rounded px-3 py-2 text-center ${active ? "border-signal/40 bg-signal-dim" : ""}`}
                    >
                      <div className="font-mono text-2xs text-ink-faint">{m}</div>
                      <div className="mt-0.5 font-mono text-sm font-tabular text-ink">
                        {v !== undefined ? formatUsd(v) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="label-eyebrow mb-2">Disposal detail</div>
              <table className="w-full text-left text-2xs">
                <thead className="text-ink-faint">
                  <tr>
                    <th className="py-1 font-normal">Lot</th>
                    <th className="py-1 text-right font-normal">Amount</th>
                    <th className="py-1 text-right font-normal">Cost basis</th>
                    <th className="py-1 text-right font-normal">Proceeds</th>
                    <th className="py-1 text-right font-normal">Gain</th>
                    <th className="py-1 text-right font-normal">Term</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.impact.disposals.map((d) => (
                    <tr key={d.lotId} className="border-t border-line-soft">
                      <td className="py-1 text-ink-faint">{d.lotId.split(":")[0]}</td>
                      <td className="py-1 text-right text-ink-muted">{d.amountUsed.toFixed(4)}</td>
                      <td className="py-1 text-right text-ink-muted">{formatUsd(d.costBasisUsd)}</td>
                      <td className="py-1 text-right text-ink-muted">{formatUsd(d.proceedsUsd)}</td>
                      <td className={`py-1 text-right ${d.gainUsd >= 0 ? "text-gain" : "text-loss"}`}>
                        {formatUsd(d.gainUsd)}
                      </td>
                      <td className="py-1 text-right text-ink-faint">
                        {d.term} · {d.holdingPeriodDays}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const selectCls =
  "h-9 w-full rounded-sm border border-line bg-panel-raised px-2 text-sm text-ink focus:border-signal focus:outline-none";
const inputCls = selectCls + " font-mono";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-eyebrow">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" | "pending" }) {
  const toneClass = tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : tone === "pending" ? "text-pending" : "text-ink";
  return (
    <div className="hairline rounded px-3 py-2">
      <div className="label-eyebrow">{label}</div>
      <div className={`mt-0.5 font-display text-lg font-medium font-tabular ${toneClass}`}>{value}</div>
    </div>
  );
}
