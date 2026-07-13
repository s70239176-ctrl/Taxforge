import { NextRequest, NextResponse } from "next/server";
import { mockOkxPaymentAdapter } from "../chain/xlayer";
import { isFacilitatorConfigured, verifyWithFacilitator, settleWithFacilitator } from "./facilitator";
import { toAtomicUnits } from "./units";
import { logEvent } from "../logging";

/**
 * Implementation of OKX's real Agent Payments Protocol / x402
 * "accepts-based" flow, corrected against the actual spec shipped in
 * okx/onchainos-skills (okx-agent-payments-protocol, v4.2.3) — installed
 * and read directly rather than assumed from the generic public x402 docs.
 *
 * Two real corrections that came from reading the actual skill file:
 *   1. The v2 challenge is a base64-encoded JSON `PAYMENT-REQUIRED`
 *      *response header*, not just a JSON body (the JSON body remains as a
 *      v1-legacy/human-debuggable fallback — real OKX agents check the
 *      header first, per their own Step A2 priority order).
 *   2. Amounts are atomic/minimal units (e.g. "150000" for 0.15 of a
 *      6-decimal token), not decimal strings — real agents decode
 *      `option.amount` and convert using token decimals for display.
 *   3. The client's payment-proof header is `PAYMENT-SIGNATURE` for this
 *      v2 accepts-based flow; `X-PAYMENT` is the v1-legacy header name.
 *      We accept either, preferring PAYMENT-SIGNATURE.
 *
 * Two runtime modes, chosen automatically based on env:
 *   - REAL mode: X402_FACILITATOR_URL is set → payments are verified and
 *     settled against a real x402-compliant facilitator (see facilitator.ts).
 *     Required before going live on OKX.AI.
 *   - DEMO mode: no facilitator configured → falls back to the local mock
 *     adapter. Fine for local dev; NEVER acceptable for a listed, callable
 *     ASP. A warning is logged on every call made in this mode.
 */

const ASSET_DECIMALS = Number(process.env.X402_ASSET_DECIMALS ?? 6); // 6 is correct for USDT/USDC on most EVM chains

export interface X402AcceptEntry {
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  amount: string; // atomic units — the field real OKX agents parse (option.amount)
  maxAmountRequired: string; // decimal string — kept for v1/back-compat and human debugging
  resource: string;
  description: string;
}

export interface X402Requirements {
  x402Version: 1;
  accepts: X402AcceptEntry[];
}

export function buildRequirements(resource: string, priceUsd: string): X402Requirements {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: process.env.X402_NETWORK ?? "x-layer",
        asset: process.env.X402_ASSET ?? "USDT",
        payTo: process.env.X402_RECEIVING_ADDRESS ?? "0x0000000000000000000000000000000000000000",
        amount: toAtomicUnits(priceUsd, ASSET_DECIMALS),
        maxAmountRequired: priceUsd,
        resource,
        description: "TaxForge ASP — pay-per-call agent tax intelligence",
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
