import { NextRequest, NextResponse } from "next/server";
import { fetchRealTransactionsMultiChain } from "@/lib/chain/explorers";
import { classifyBatch } from "@/lib/ai/classify";
import { getStore } from "@/lib/db";
import { logEvent } from "@/lib/logging";
import type { Chain } from "@/lib/tax/types";
import sampleData from "../../../../../data/sample-transactions.json";

export const runtime = "nodejs";

const VALID_CHAINS: Chain[] = ["x-layer", "ethereum", "arbitrum", "base"];

/**
 * GET /api/tax/ingest?wallet=0x...&chains=x-layer,ethereum
 *
 * Pulls REAL transaction history for a wallet from live block explorer
 * APIs (see src/lib/chain/explorers.ts), classifies it, and persists it —
 * this is the actual "multi-chain ingestion" step, not sample data.
 *
 * Honesty guard: if none of ETHERSCAN_API_KEY / OKLINK_API_KEY are
 * configured, every explorer call returns empty, and this endpoint falls
 * back to the bundled sample dataset so the rest of the app still has
 * something to show — but the response is explicitly marked
 * `"source": "sample"` so nobody mistakes fixture data for a live feed.
 * Once you set real API keys, `"source"` flips to `"live"` automatically.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "invalid_request", message: "Missing required ?wallet= query param." }, { status: 400 });
  }
  const chainsParam = req.nextUrl.searchParams.get("chains");
  const chains = chainsParam
    ? (chainsParam.split(",").filter((c) => VALID_CHAINS.includes(c as Chain)) as Chain[])
    : VALID_CHAINS;

  const live = await fetchRealTransactionsMultiChain(chains, wallet);

  const usingSample = live.length === 0;
  const raw = usingSample ? (sampleData as typeof live) : live;

  const classified = await classifyBatch(raw);
  const store = getStore();
  await store.saveTransactions(wallet, classified);

  logEvent({
    level: usingSample ? "warn" : "info",
    event: "tax_ingest_completed",
    wallet,
    chains,
    source: usingSample ? "sample" : "live",
    count: classified.length,
  });

  return NextResponse.json({
    wallet,
    chains,
    source: usingSample ? "sample" : "live",
    note: usingSample
      ? "No explorer API keys configured (ETHERSCAN_API_KEY / OKLINK_API_KEY) or no on-chain activity found — showing bundled sample data instead."
      : undefined,
    transactionCount: classified.length,
    transactions: classified,
  });
}
