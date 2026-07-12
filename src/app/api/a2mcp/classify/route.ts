import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePayment } from "@/lib/x402/middleware";
import { checkRateLimit } from "@/lib/rate-limit";
import { classifyTransaction } from "@/lib/ai/classify";

export const runtime = "nodejs";

const TxSchema = z.object({
  hash: z.string(),
  chain: z.enum(["x-layer", "ethereum", "arbitrum", "base", "okx-chain"]),
  blockNumber: z.number().int().nonnegative(),
  confirmations: z.number().int().nonnegative(),
  timestamp: z.string(),
  from: z.string(),
  to: z.string(),
  asset: z.string(),
  amount: z.number(),
  direction: z.enum(["IN", "OUT"]),
  priceUsdAtTx: z.number().nonnegative(),
  gasUsd: z.number().nonnegative(),
  counterpartyAgentId: z.string().optional(),
  memo: z.string().optional(),
});

/**
 * POST /api/a2mcp/classify
 * Pay-per-call classification for a single raw transaction — useful for an
 * agent that wants a tax-category label attached before it logs an action,
 * without paying for a full simulation.
 */
export async function POST(req: NextRequest) {
  const agentId = req.headers.get("X-Agent-Id") ?? "anonymous";
  const rl = checkRateLimit(`a2mcp-classify:${agentId}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAtMs: rl.resetAtMs }, { status: 429 });
  }

  const priceUsd = process.env.X402_PRICE_CLASSIFY ?? "0.01";
  const gate = await requirePayment(req, "/api/a2mcp/classify", priceUsd);
  if (!gate.ok) return gate.response!;

  const json = await req.json().catch(() => null);
  const parsed = TxSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const classified = await classifyTransaction(parsed.data);
  return NextResponse.json({ ok: true, settlementTxHash: gate.settlementTxHash, classified });
}
