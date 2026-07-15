import { NextRequest, NextResponse } from "next/server";
import { mockOkxPaymentAdapter } from "../chain/xlayer";
import { isFacilitatorConfigured, verifyWithFacilitator, settleWithFacilitator } from "./facilitator";
import { toAtomicUnits } from "./units";
import { resolveToken } from "./tokens";
import { logEvent } from "../logging";

/**
 * Implementation of OKX's real Agent Payments Protocol / x402
 * "accepts-based" flow, corrected against the actual spec shipped in
 * okx/onchainos-skills (okx-agent-payments-protocol, v4.2.3) — installed
 * and read directly rather than assumed from the generic public x402 docs.
 *
 * Real corrections found along the way, each verified against either the
 * skill file or OKX's own live compliance checker on ASP #5534:
 *   1. The v2 challenge is a base64-encoded JSON `PAYMENT-REQUIRED`
 *      *response header*, not just a JSON body (JSON body kept as a
 *      v1-legacy/human-debuggable fallback).
 *   2. Amounts are atomic/minimal units, not decimal strings.
 *   3. The client's payment-proof header is `PAYMENT-SIGNATURE` for v2;
 *      `X-PAYMENT` is the v1-legacy name. We accept either.
 *   4. `asset` must be a real ERC-20 contract address, not a bare symbol
 *      like "USDT" — every real x402 implementation does this (Coinbase's
 *      own spec, Base, Avalanche, Exa, CoinMarketCap all confirmed). A
 *      bare symbol is exactly why OKX's checker couldn't resolve decimals.
 *      Resolved via src/lib/x402/tokens.ts; also included directly in
 *      `extra.decimals` so nothing needs an external lookup at all.
 *
 * Two runtime modes, chosen automatically based on env:
 *   - REAL mode: X402_FACILITATOR_URL is set → payments are verified and
 *     settled against a real x402-compliant facilitator (see facilitator.ts).
 *     Required before going live on OKX.AI.
 *   - DEMO mode: no facilitator configured → falls back to the local mock
 *     adapter. Fine for local dev; NEVER acceptable for a listed, callable
 *     ASP. A warning is logged on every call made in this mode.
 */

export interface X402AcceptEntry {
  scheme: "exact";
  network: string;
  asset: string; // real ERC-20 contract address, not a symbol
  payTo: string;
  amount: string; // atomic units — the field real OKX agents parse (option.amount)
  maxAmountRequired: string; // decimal string — kept for v1/back-compat and human debugging
  resource: string;
  description: string;
  extra?: { name: string; symbol: string; decimals: number };
}

export interface X402Requirements {
  x402Version: 1;
  accepts: X402AcceptEntry[];
}

export function buildRequirements(resource: string, priceUsd: string): X402Requirements {
  const network = process.env.X402_NETWORK ?? "x-layer";
  const symbol = process.env.X402_ASSET ?? "USDT";
  const token = resolveToken(network, symbol);

  if (!token) {
    logEvent({
      level: "warn",
      event: "x402_unresolved_token",
      network,
      symbol,
      message: "No verified contract address for this network/asset — falling back to the bare symbol, which is NOT spec-compliant and will fail compliance checks. Add a verified entry to src/lib/x402/tokens.ts.",
    });
  }

  const decimals = token?.decimals ?? Number(process.env.X402_ASSET_DECIMALS ?? 6);

  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network,
        asset: token?.address ?? symbol,
        payTo: process.env.X402_RECEIVING_ADDRESS ?? "0x0000000000000000000000000000000000000000",
        amount: toAtomicUnits(priceUsd, decimals),
        maxAmountRequired: priceUsd,
        resource,
        description: "TaxForge ASP — pay-per-call agent tax intelligence",
        extra: token ? { name: token.name, symbol, decimals: token.decimals } : undefined,
      },
    ],
  };
}

/** Base64-encodes the requirements for the real v2 `PAYMENT-REQUIRED` response header. */
function encodeChallenge(requirements: X402Requirements): string {
  return Buffer.from(JSON.stringify(requirements), "utf8").toString("base64");
}

function jsonWith402Header(body: unknown, requirements: X402Requirements): NextResponse {
  const res = NextResponse.json(body, { status: 402 });
  res.headers.set("PAYMENT-REQUIRED", encodeChallenge(requirements));
  return res;
}

export interface X402VerifyResult {
  ok: boolean;
  settlementTxHash?: string;
  response?: NextResponse;
}

/**
 * Verifies (or demands) payment for a given resource + price. Call this at
 * the top of any paid route handler.
 *
 * Usage:
 *   const gate = await requirePayment(req, "/api/tax/simulate", process.env.X402_PRICE_SIMULATE!);
 *   if (!gate.ok) return gate.response!;
 */
export async function requirePayment(
  req: NextRequest,
  resource: string,
  priceUsd: string
): Promise<X402VerifyResult> {
  // Real OKX agents send the v2 proof as PAYMENT-SIGNATURE; X-PAYMENT is the
  // v1-legacy name. Accept either, preferring the current one.
  const paymentHeader = req.headers.get("PAYMENT-SIGNATURE") ?? req.headers.get("X-PAYMENT");
  const requirements = buildRequirements(resource, priceUsd);
  const accept = requirements.accepts[0]!; // buildRequirements always returns exactly one entry
  const realMode = isFacilitatorConfigured();

  if (!realMode) {
    logEvent({ level: "warn", event: "x402_demo_mode_active", resource, message: "X402_FACILITATOR_URL is not set — payments are NOT being verified against a real facilitator. Do not accept live traffic in this mode." });
  }

  if (!paymentHeader) {
    return { ok: false, response: jsonWith402Header(requirements, requirements) };
  }

  if (realMode) {
    const verification = await verifyWithFacilitator(paymentHeader, accept);
    if (!verification.valid) {
      return {
        ok: false,
        response: jsonWith402Header(
          { ...requirements, error: "payment_invalid", message: verification.reason ?? "Payment verification failed." },
          requirements
        ),
      };
    }
    const settlement = await settleWithFacilitator(paymentHeader, accept);
    if (!settlement.success) {
      return {
        ok: false,
        response: jsonWith402Header(
          { ...requirements, error: "settlement_failed", message: settlement.error ?? "Payment settlement failed." },
          requirements
        ),
      };
    }
    return { ok: true, settlementTxHash: settlement.txHash };
  }

  // Demo-mode fallback — see module doc above.
  const verification = await mockOkxPaymentAdapter.verifyPayment({
    payload: paymentHeader,
    payTo: accept.payTo as `0x${string}`,
    amount: accept.maxAmountRequired,
    asset: accept.asset,
  });
  if (!verification.valid) {
    return {
      ok: false,
      response: jsonWith402Header(
        { ...requirements, error: "payment_invalid", message: "Payment proof failed verification (demo mode)." },
        requirements
      ),
    };
  }
  return { ok: true, settlementTxHash: verification.settlementTxHash };
}
