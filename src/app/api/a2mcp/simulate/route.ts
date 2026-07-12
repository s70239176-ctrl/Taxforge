import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePayment } from "@/lib/x402/middleware";
import { checkRateLimit } from "@/lib/rate-limit";
import { simulateSingleTrade } from "@/lib/agent/orchestrator";
import type { SimulationRequest } from "@/lib/tax/types";

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
 * POST /api/a2mcp/simulate
 *
 * The A2MCP entrypoint: any autonomous agent (trading bot, DAO treasury
 * manager, another ASP) can call this before executing an on-chain action
 * to get a structured tax-impact readout. Gated by x402 pay-per-call and a
 * per-agent rate limit. No account creation, no session — pay, call, get
 * JSON back.
 */
export async function POST(req: NextRequest) {
  const agentId = req.headers.get("X-Agent-Id") ?? req.headers.get("x-forwarded-for") ?? "anonymous";
  const rl = checkRateLimit(`a2mcp:${agentId}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many calls. Slow down or upgrade your ASP tier.", resetAtMs: rl.resetAtMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAtMs - Date.now()) / 1000)) } }
    );
  }

  const priceUsd = process.env.X402_PRICE_SIMULATE ?? "0.02";
  const gate = await requirePayment(req, "/api/a2mcp/simulate", priceUsd);
  if (!gate.ok) return gate.response!;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await simulateSingleTrade(parsed.data as SimulationRequest);
    return NextResponse.json(
      {
        ok: true,
        agentId,
        settlementTxHash: gate.settlementTxHash,
        taxDelta: {
          estimatedTaxUsd: Math.round(result.impact.estimatedTaxUsd * 100) / 100,
          realizedGainUsd: Math.round(result.impact.realizedGainUsd * 100) / 100,
          effectiveRatePct: Math.round(result.impact.effectiveRatePct * 100) / 100,
          netProceedsAfterTaxUsd: Math.round(result.netProceedsAfterTaxUsd * 100) / 100,
        },
        recommendation: result.recommendation,
        alternativeMethods: result.alternativeMethods,
        impact: result.impact,
        generatedAt: result.generatedAt,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "internal_error", message: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: "TaxForge A2MCP",
    description: "POST a proposed trade to get a structured tax-impact readout before you execute it.",
    pricing: { asset: process.env.X402_ASSET ?? "USDC", pricePerCall: process.env.X402_PRICE_SIMULATE ?? "0.02" },
    docs: "/docs",
  });
}
