import { NextRequest, NextResponse } from "next/server";
import { mockOkxPaymentAdapter } from "../chain/xlayer";

/**
 * Implementation of the x402 pattern (HTTP 402 "Payment Required" +
 * a machine-readable payment-requirements body) as used for TaxForge's
 * A2MCP endpoint. Any calling agent that omits the X-PAYMENT header gets a
 * 402 back describing exactly how to pay — no account, no API key
 * onboarding flow, just settle the call and retry.
 *
 * Spec shape follows the public x402 scheme (scheme/network/asset/payTo/
 * maxAmountRequired/resource) so any x402-aware agent wallet/SDK can consume
 * this without TaxForge-specific glue code.
 */
export interface X402Requirements {
  x402Version: 1;
  accepts: Array<{
    scheme: "exact";
    network: string;
    asset: string;
    payTo: string;
    maxAmountRequired: string; // decimal string, e.g. "0.02"
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
        asset: process.env.X402_ASSET ?? "USDC",
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
 *   const gate = await requirePayment(req, "/api/a2mcp/simulate", process.env.X402_PRICE_SIMULATE!);
 *   if (!gate.ok) return gate.response!;
 */
export async function requirePayment(
  req: NextRequest,
  resource: string,
  priceUsd: string
): Promise<X402VerifyResult> {
  const paymentHeader = req.headers.get("X-PAYMENT");
  const requirements = buildRequirements(resource, priceUsd);

  if (!paymentHeader) {
    return {
      ok: false,
      response: NextResponse.json(requirements, { status: 402 }),
    };
  }

  const accept = requirements.accepts[0]!; // buildRequirements always returns exactly one entry
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
        { ...requirements, error: "payment_invalid", message: "X-PAYMENT proof failed verification." },
        { status: 402 }
      ),
    };
  }

  return { ok: true, settlementTxHash: verification.settlementTxHash };
}
