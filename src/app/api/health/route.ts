import { NextResponse } from "next/server";
import { mockOkxPaymentAdapter } from "@/lib/chain/xlayer";

export async function GET() {
  const reputation = await mockOkxPaymentAdapter.getAspReputation(process.env.OKX_ASP_ID || "taxforge.demo");
  return NextResponse.json({
    status: "ok",
    service: "taxforge",
    version: "0.1.0",
    reputation,
    timestamp: new Date().toISOString(),
  });
}
