import { NextRequest, NextResponse } from "next/server";
import { mockOkxPaymentAdapter } from "../chain/xlayer";
import { isFacilitatorConfigured, verifyWithFacilitator, settleWithFacilitator } from "./facilitator";
import { logEvent } from "../logging";

/**
 * Implementation of the x402 pattern (HTTP 402 "Payment Required" +
 * a machine-readable payment-requirements body) as used for TaxForge's
 * A2MCP endpoint. Any calling agent that omits the X-PAYMENT header gets a
 * 402 back describing exactly how to pay — no account, no API key
 * onboarding flow, just settle the call and retry.
 *
 * Two modes, chosen automatically based on env:
 *   - REAL mode: X402_FACILITATOR_URL is set → payments are verified and
 *     settled against a real x402 facilitator (see src/lib/x402/facilitator.ts).
 *     This is the mode required before going live on OKX.AI.
 *   - DEMO mode: no facilitator configured → falls back to the local mock
 *     adapter. Fine for local dev; NEVER acceptable for a listed, callable
 *     ASP, since it does not actually verify anyone paid you. A warning is
 *     logged on every call made in this mode.
 */
export interface X402Requirements {
  x402Version: 1;
  accepts: Array<{
    scheme: "exact";
    network: string;
    asset: string;
    payTo: string;
    maxAmountRequired: string; // decimal string, e.g. "0.15"
    resource: string;
    description: string;
  }>;
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
        maxAmountRequired: priceUsd,
        resource,
        description: "TaxForge ASP — pay-per-call agent tax intelligence",
      },
    ],
  };
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
  const paymentHeader = req.headers.get("X-PAYMENT");
  const requirements = buildRequirements(resource, priceUsd);
  const accept = requirements.accepts[0]!; // buildRequirements always returns exactly one entry
  const realMode = isFacilitatorConfigured();

  if (!realMode) {
    logEvent({ level: "warn", event: "x402_demo_mode_active", resource, message: "X402_FACILITATOR_URL is not set — payments are NOT being verified against a real facilitator. Do not accept live traffic in this mode." });
  }

  if (!paymentHeader) {
    return {
      ok: false,
      response: NextResponse.json(requirements, { status: 402 }),
    };
  }

  if (realMode) {
    const verification = await verifyWithFacilitator(paymentHeader, accept);
    if (!verification.valid) {
      return {
        ok: false,
        response: NextResponse.json(
          { ...requirements, error: "payment_invalid", message: verification.reason ?? "Payment verification failed." },
          { status: 402 }
        ),
      };
    }
    const settlement = await settleWithFacilitator(paymentHeader, accept);
    if (!settlement.success) {
      return {
        ok: false,
        response: NextResponse.json(
          { ...requirements, error: "settlement_failed", message: settlement.error ?? "Payment settlement failed." },
          { status: 402 }
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
      response: NextResponse.json(
        { ...requirements, error: "payment_invalid", message: "X-PAYMENT proof failed verification (demo mode)." },
        { status: 402 }
      ),
    };
  }
  return { ok: true, settlementTxHash: verification.settlementTxHash };
}
