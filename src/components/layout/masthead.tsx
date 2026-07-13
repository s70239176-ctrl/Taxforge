import { ThemeToggle } from "./theme-toggle";

const TICKER_ITEMS = [
  "X LAYER  BLOCK #4,812,940  ·  12s",
  "ETHEREUM  BLOCK #21,004,118  ·  11s",
  "ARBITRUM  BLOCK #298,441,220  ·  0.3s",
  "BASE  BLOCK #24,110,553  ·  2s",
  "A2MCP CALLS SERVED  18,204",
  "ASP UPTIME  99.97%",
];

export function Masthead() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-void/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-2.5 md:px-6">
        <div className="flex items-center gap-2">
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            TAX<span className="text-gain">FORGE</span>
          </span>
          <span className="hidden items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 text-2xs font-mono text-ink-muted sm:flex">
            <span className="live-dot animate-blink" />
            AGENT ECONOMY · LIVE
          </span>
        </div>

        <div className="relative hidden h-5 flex-1 overflow-hidden md:block">
          <div className="absolute inset-0 flex items-center">
            <div className="ticker-track flex shrink-0 gap-8 whitespace-nowrap font-mono text-2xs text-ink-muted">
              {items.map((t, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="text-ink-faint">/</span>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-void to-transparent" />
        </div>

        <div className="flex items-center gap-3 text-2xs font-mono text-ink-muted">
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">JURISDICTION</span>
            <span className="rounded-sm border border-line bg-panel-raised px-1.5 py-0.5 text-ink">US</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
