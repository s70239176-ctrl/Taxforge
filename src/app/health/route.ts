import { NextResponse } from "next/server";
import { mockOkxPaymentAdapter } from "@/lib/chain/xlayer";
import { isFacilitatorConfigured } from "@/lib/x402/facilitator";

export const runtime = "nodejs";

/**
 * GET /health — plain top-level health check for OKX's ASP review /
 * uptime monitor, per their listing checklist. Functionally identical to
 * /api/health (kept for backward compatibility with earlier docs), but at
 * the conventional root path some reviewers/monitors expect by default.
 */
export async function GET() {
  const reputation = await mockOkxPaymentAdapter.getAspReputation(process.env.OKX_ASP_ID || "taxforge");
  const paymentMode = isFacilitatorConfigured() ? "live" : "demo";

  return NextResponse.json({
    status: "ok",
    service: "taxforge",
    version: "0.2.0",
    paymentMode,
    storageBackend: process.env.UPSTASH_REDIS_REST_URL ? "upstash-redis" : "json-file",
    reputation,
    timestamp: new Date().toISOString(),
  });
}
