import { NextResponse } from "next/server";
import { getRecentCalls } from "@/lib/x402/call-log";

export const runtime = "nodejs";

/**
 * GET /api/calls/recent — backs the dashboard's "Agents Calling TaxForge"
 * panel with genuine settled-call history instead of illustrative data.
 * Returns an empty array (not fake data) if nothing has settled yet, or if
 * Upstash isn't configured — the frontend shows an honest "waiting for
 * first call" state in that case rather than pretending activity exists.
 */
export async function GET() {
  const calls = await getRecentCalls(10);
  return NextResponse.json({ calls });
}
