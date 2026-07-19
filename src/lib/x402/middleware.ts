import { NextRequest, NextResponse } from "next/server";
import { mockOkxPaymentAdapter } from "../chain/xlayer";
import { isRealPaymentConfigured, buildRealChallenge, verifyRealPayment, settleRealPayment } from "./okx-real";
import { toAtomicUnits } from "./units";
import { resolveToken, X_LAYER_CAIP2 } from "./tokens";
import { logEvent } from "../logging";

/**
 * Payment gate for TaxForge's paid endpoints. Three things this had to get
 * right, each discovered from a real, separate signal rather than assumed:
 *   1. The 402 challenge is a base64-encoded JSON `PAYMENT-REQUIRED`
 *      *response header* (v2), not just a JSON body — confirmed against
 *      okx/onchainos-skills' okx-agent-payments-protocol skill file.
 *   2. The client's payment-proof header is `PAYMENT-SIGNATURE` (v2);
 *      `X-PAYMENT` is the v1-legacy name — same source.
 *   3. Real verification/settlement must go through OKX's actual Payment
 *      SDK (@okxweb3/x402-core + @okxweb3/x402-evm) — confirmed by ASP
 *      #5534's real rejection ("has not passed x402 standard validation...
 *      integrate x402 using the OKX Payment SDK") and OKX's own payment
 *      API docs, which also revealed the token/network format corrections
 *      in src/lib/x402/tokens.ts (real supported tokens, CAIP-2 network).
 *
 * Two runtime modes, chosen automatically based on env:
 *   - REAL mode: OKX_API_KEY/SECRET/PASSPHRASE are set → payments are
 *     verified and settled via OKX's real Payment SDK. Required before
 *     going live on OKX.AI.
 *   - DEMO mode: not configured → falls back to a local mock adapter that
 *     accepts any non-empty proof. Fine for local dev; NEVER acceptable
 *     for a listed, callable ASP. Logged loudly on every call.
 */

export interface X402AcceptEntry {
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  extra?: { name: string; symbol: string; decimals: number };
}

export interface X402Requirements {
  x402Version: 1;
  accepts: X402AcceptEntry[];
}

/** Demo-mode challenge builder — same shape as before, used only when real payment isn't configured. */
function buildDemoRequirements(resource: string, priceUsd: string): X402Requirements {
  const network = X_LAYER_CAIP2;
  const symbol = process.env.X402_ASSET ?? "USD₮0";
  const token = resolveToken(network, symbol);

  if (!token) {
    logEvent({ level: "warn", event: "x402_unresolved_token", network, symbol, message: "No verified contract address for this network/asset — add a verified entry to src/lib/x402/tokens.ts." });
  }
  const decimals = token?.decimals ?? 6;

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
        description: "TaxForge ASP — pay-per-call agent tax intelligence (DEMO MODE — not verified)",
        extra: token ? { name: token.name, symbol, decimals: token.decimals } : undefined,
      },
    ],
  };
}

function encodeChallenge(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function jsonWith402Header(body: unknown, challengePayload: unknown): NextResponse {
  const res = NextResponse.json(body, { status: 402 });
  res.headers.set("PAYMENT-REQUIRED", encodeChallenge(challengePayload));
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
  const paymentHeader = req.headers.get("PAYMENT-SIGNATURE") ?? req.headers.get("X-PAYMENT");
  const realMode = isRealPaymentConfigured();

  if (!realMode) {
    logEvent({ level: "warn", event: "x402_demo_mode_active", resource, message: "OKX_API_KEY/SECRET/PASSPHRASE not set — payments are NOT being verified against OKX's real Payment SDK. Do not accept live traffic in this mode." });
  }

  if (realMode) {
    const challenge = await buildRealChallenge(resource, priceUsd);
    if (!challenge) {
      // Real mode was configured but the resource server failed to
      // initialize or build requirements (bad credentials, unreachable,
      // misconfigured receiving address, etc.) — this must surface as a
      // clear server error, not silently fall back to demo, since a
      // caller in this state believes they're paying for real.
      return {
        ok: false,
        response: NextResponse.json(
          { error: "payment_config_error", message: "Real payment mode is configured but not currently working — check server logs (x402_unresolved_token / x402_no_receiving_address / okx_resource_server_init_failed)." },
          { status: 500 }
        ),
      };
    }
    const requirement = challenge.accepts[0]!;

    if (!paymentHeader) {
      return { ok: false, response: jsonWith402Header(challenge, challenge) };
    }

    const verification = await verifyRealPayment(paymentHeader, requirement);
    if (!verification.valid) {
      return {
        ok: false,
        response: jsonWith402Header(
          { ...challenge, error: "payment_invalid", message: verification.reason ?? "Payment verification failed." },
          challenge
        ),
      };
    }
    const settlement = await settleRealPayment(paymentHeader, requirement);
    if (!settlement.success) {
      return {
        ok: false,
        response: jsonWith402Header(
          { ...challenge, error: "settlement_failed", message: settlement.error ?? "Payment settlement failed." },
          challenge
        ),
      };
    }
    return { ok: true, settlementTxHash: settlement.txHash };
  }

  // Demo-mode fallback — see module doc above.
  const requirements = buildDemoRequirements(resource, priceUsd);
  const accept = requirements.accepts[0]!;

  if (!paymentHeader) {
    return { ok: false, response: jsonWith402Header(requirements, requirements) };
  }

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
