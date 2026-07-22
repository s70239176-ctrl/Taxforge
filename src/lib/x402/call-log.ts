import { Redis } from "@upstash/redis";
import { logEvent } from "../logging";

/**
 * Records real, settled A2MCP calls so the dashboard's "Agents Calling
 * TaxForge" panel can show genuine recent activity instead of illustrative
 * fake data. Only called from the real-payment success path in
 * middleware.ts — demo-mode calls never hit this, since they aren't real
 * revenue/traffic and shouldn't be presented as if they were.
 *
 * Best-effort: failures here are logged and swallowed, never allowed to
 * affect the response to whoever just paid — same resilience pattern as
 * every other non-critical write in this app.
 */

export interface RecentCall {
  agentId: string;
  resource: string;
  priceUsd: string;
  settlementTxHash?: string;
  timestamp: string;
}

const LIST_KEY = "taxforge:recent-calls";
const MAX_ENTRIES = 20;

function hasUpstash(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

let client: Redis | null = null;
function getClient(): Redis {
  if (!client) client = Redis.fromEnv();
  return client;
}

export async function recordCall(call: Omit<RecentCall, "timestamp">): Promise<void> {
  if (!hasUpstash()) return; // no persistent store configured — nothing to record into
  try {
    const entry: RecentCall = { ...call, timestamp: new Date().toISOString() };
    await getClient().lpush(LIST_KEY, JSON.stringify(entry));
    await getClient().ltrim(LIST_KEY, 0, MAX_ENTRIES - 1);
  } catch (err) {
    logEvent({ level: "error", event: "call_log_write_error", message: err instanceof Error ? err.message : String(err) });
  }
}

export async function getRecentCalls(limit = 10): Promise<RecentCall[]> {
  if (!hasUpstash()) return [];
  try {
    const raw = await getClient().lrange<string>(LIST_KEY, 0, limit - 1);
    return raw
      .map((r) => {
        try {
          return JSON.parse(r) as RecentCall;
        } catch {
          return null;
        }
      })
      .filter((c): c is RecentCall => c !== null);
  } catch (err) {
    logEvent({ level: "error", event: "call_log_read_error", message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
