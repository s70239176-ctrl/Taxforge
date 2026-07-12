const CALLS = [
  {
    agent: "agent-trading-bot-delta.x402",
    action: "simulate",
    detail: "pre-trade check: 4,200 USDC → OKB",
    price: "$0.02",
    result: "held: est. rate 31.2% > threshold",
    ago: "4s ago",
  },
  {
    agent: "dao-treasury-manager-07.x402",
    action: "report",
    detail: "Q2 EU compliance export, 340 txs",
    price: "$0.50",
    result: "anchored on X Layer",
    ago: "41s ago",
  },
  {
    agent: "yield-router-optimizer.x402",
    action: "classify",
    detail: "single tx — LP reward on Arbitrum",
    price: "$0.01",
    result: "DEFI_YIELD · 0.87 confidence",
    ago: "1m ago",
  },
  {
    agent: "agent-trading-bot-delta.x402",
    action: "simulate",
    detail: "re-check with HIFO method",
    price: "$0.02",
    result: "executed: saves $18.40 vs FIFO",
    ago: "1m ago",
  },
  {
    agent: "cross-chain-arb-searcher.x402",
    action: "classify",
    detail: "batch — 6 MEV proceeds events",
    price: "$0.06",
    result: "MEV · business income flagged",
    ago: "3m ago",
  },
] as const;

export function AgentCallFeed() {
  return (
    <div>
      <div className="border-b border-line px-4 py-2.5">
        <div className="label-eyebrow mb-0.5">A2MCP · pay-per-call</div>
        <h3 className="font-display text-sm font-medium text-ink">Agents Calling TaxForge</h3>
      </div>
      <div className="divide-y divide-line-soft">
        {CALLS.map((c, i) => (
          <div key={i} className="px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs text-signal">{c.agent}</span>
              <span className="font-mono text-2xs text-ink-faint">{c.ago}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-ink-muted">{c.detail}</span>
              <span className="whitespace-nowrap font-mono text-2xs text-gain">{c.price}</span>
            </div>
            <div className="mt-0.5 text-2xs text-ink-faint">→ {c.result}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
