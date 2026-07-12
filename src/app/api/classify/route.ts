import { NextRequest, NextResponse } from "next/server";
import { classifyBatch } from "@/lib/ai/classify";
import { getStore } from "@/lib/db";
import type { RawTransaction } from "@/lib/tax/types";
import sampleData from "../../../../data/sample-transactions.json";

export const runtime = "nodejs";

/**
 * GET /api/classify?wallet=0x...
 * Classifies (and caches) the sample multi-chain transaction feed for the
 * given wallet. Backs the Dashboard + Transaction Feed screens.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "0xe8651e5faf1cfeabd196f3f8998d2da8b8b22bc2";
  const store = getStore();

  const cached = await store.getTransactions(wallet);
  if (cached.length > 0) {
    return NextResponse.json({ wallet, transactions: cached, cached: true });
  }

  const raw = sampleData as RawTransaction[];
  const classified = await classifyBatch(raw);
  await store.saveTransactions(wallet, classified);

  return NextResponse.json({ wallet, transactions: classified, cached: false });
}
