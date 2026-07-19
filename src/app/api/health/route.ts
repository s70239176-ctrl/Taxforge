import { NextResponse } from "next/server";
import { mockOkxPaymentAdapter } from "@/lib/chain/xlayer";
import { isRealPaymentConfigured } from "@/lib/x402/okx-real";

export const runtime = "nodejs";

export async function GET() {
  const reputation = await mockOkxPaymentAdapter.getAspReputation(process.env.OKX_ASP_ID || "taxforge");
  const paymentMode = isRealPaymentConfigured() ? "live" : "demo";

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
