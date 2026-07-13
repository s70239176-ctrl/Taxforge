const CHAINS = [
  { name: "X Layer", role: "primary settlement", block: "4,812,940", finality: "12s", health: "gain" },
  { name: "Ethereum", role: "treasury / staking", block: "21,004,118", finality: "11s", health: "gain" },
  { name: "Arbitrum", role: "LP yield source", block: "298,441,220", finality: "0.3s", health: "gain" },
  { name: "Base", role: "NFT / airdrops", block: "24,110,553", finality: "2s", health: "pending" },
] as const;

const HEALTH_DOT: Record<string, string> = {
  gain: "bg-gain shadow-[0_0_0_2px_rgb(var(--color-gain-dim))]",
  pending: "bg-pending shadow-[0_0_0_2px_rgb(var(--color-pending-dim))]",
  loss: "bg-loss shadow-[0_0_0_2px_rgb(var(--color-loss-dim))]",
};

export function ChainStatus() {
  return (
    <div>
      <div className="border-b border-line px-4 py-2.5">
        <div className="label-eyebrow mb-0.5">Ingestion</div>
        <h3 className="font-display text-sm font-medium text-ink">Chain Status</h3>
      </div>
      <div className="divide-y divide-line-soft">
        {CHAINS.map((c) => (
          <div key={c.name} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[c.health]}`} />
                <span className="text-sm text-ink">{c.name}</span>
              </div>
              <div className="mt-0.5 text-2xs text-ink-faint">{c.role}</div>
            </div>
            <div className="text-right font-mono text-2xs">
              <div className="text-ink-muted">#{c.block}</div>
              <div className="text-ink-faint">~{c.finality} finality</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
