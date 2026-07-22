"use client";

import { useEffect, useState } from "react";
import { truncateHash, timeAgo } from "@/lib/utils";
import type { RecentCall } from "@/lib/x402/call-log";

export function AgentCallFeed() {
  const [calls, setCalls] = useState<RecentCall[] | null>(null);

  useEffect(() => {
    fetch("/api/calls/recent")
      .then((r) => r.json())
      .then((data) => setCalls(data.calls ?? []))
      .catch(() => setCalls([]));
  }, []);

  return (
    <div>
      <div className="border-b border-line px-4 py-2.5">
        <div className="label-eyebrow mb-0.5">A2MCP · pay-per-call · live</div>
        <h3 className="font-display text-sm font-medium text-ink">Agents Calling TaxForge</h3>
      </div>

      {calls === null && (
        <div className="px-4 py-8 text-center text-xs text-ink-faint">Loading…</div>
      )}

      {calls !== null && calls.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-ink-faint">
          No settled calls yet — this fills in the moment a real agent pays and calls a paid
          endpoint. Nothing fake shown here.
        </div>
      )}

      {calls !== null && calls.length > 0 && (
        <div className="divide-y divide-line-soft">
          {calls.map((c, i) => (
            <div key={i} className="px-4 py-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xs text-signal">{c.agentId}</span>
                <span className="font-mono text-2xs text-ink-faint">{timeAgo(c.timestamp)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs text-ink-muted">{c.resource}</span>
                <span className="whitespace-nowrap font-mono text-2xs text-gain">${c.priceUsd}</span>
              </div>
              {c.settlementTxHash && (
                <div className="mt-0.5 font-mono text-2xs text-ink-faint">
                  settled {truncateHash(c.settlementTxHash, 6, 4)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
