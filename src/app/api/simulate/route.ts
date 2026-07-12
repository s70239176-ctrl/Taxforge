import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { simulateSingleTrade } from "@/lib/agent/orchestrator";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RequestSchema = z.object({
  chain: z.enum(["x-layer", "ethereum", "arbitrum", "base", "okx-chain"]),
  assetIn: z.string().min(1),
  amountIn: z.number().positive(),
  assetOut: z.string().min(1),
  expectedAmountOut: z.number().nonnegative(),
  priceUsdIn: z.number().positive(),
  walletAddress: z.string().min(4),
  jurisdiction: z.enum(["US", "DE", "FR", "EU_GENERIC"]).default("US"),
  method: z.enum(["FIFO", "LIFO", "HIFO"]).default("FIFO"),
});

/**
 * Free, session-authenticated simulate endpoint backing the in-app
 * Simulation Tool. The metered/paid version of this same logic is exposed
 * at /api/a2mcp/simulate for agent-to-agent calls.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`ui-simulate:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAtMs: rl.resetAtMs }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await simulateSingleTrade(parsed.data);
  return NextResponse.json(result);
}
