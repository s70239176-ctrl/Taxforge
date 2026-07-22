"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "./theme-toggle";

interface HealthData {
  paymentMode: "live" | "demo";
  storageBackend: "upstash-redis" | "json-file";
  reputation: { callsServed: number; disputesRaised: number; uptimePct: number };
}

export function Masthead() {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  const isLive = health?.paymentMode === "live";

  const tickerItems = health
    ? [
        `PAYMENT VERIFICATION  ${health.paymentMode === "live" ? "LIVE VIA OKX PAYMENT SDK" : "DEMO MODE — NOT VERIFYING REAL PAYMENTS"}`,
        `STORAGE  ${health.storageBackend === "upstash-redis" ? "PERSISTENT (UPSTASH REDIS)" : "LOCAL FILE (NOT PRODUCTION-SAFE)"}`,
        `A2MCP CALLS SERVED  ${health.reputation.callsServed.toLocaleString()}`,
        `ASP UPTIME  ${health.reputation.uptimePct}%`,
        `MCP PROTOCOL  /api/mcp — INITIALIZE / TOOLS-LIST / TOOLS-CALL`,
      ]
    : ["CONNECTING TO /health …"];

  const items = [...tickerItems, ...tickerItems];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-void/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-2.5 md:px-6">
        <div className="flex items-center gap-2">
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            TAX<span className="text-gain">FORGE</span>
          </span>
          <span
            className={`hidden items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs font-mono sm:flex ${
              health === null
                ? "border-line text-ink-faint"
                : isLive
                  ? "border-gain/30 text-gain bg-gain-dim"
                  : "border-pending/30 text-pending bg-pending-dim"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${health === null ? "bg-ink-faint" : isLive ? "live-dot animate-blink" : "bg-pending"}`}
            />
            {health === null ? "CONNECTING…" : isLive ? "PAYMENTS · LIVE" : "PAYMENTS · DEMO MODE"}
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
