import { x402ResourceServer } from "@okxweb3/x402-core/server";
import type { PaymentPayload, PaymentRequirements } from "@okxweb3/x402-core/types";
import { OKXFacilitatorClient } from "@okxweb3/x402-core/facilitator";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { X_LAYER_CAIP2, resolveToken } from "./tokens";
import { toAtomicUnits } from "./units";
import { logEvent } from "../logging";

/**
 * Real payment verification via OKX's actual Payment SDK
 * (@okxweb3/x402-core + @okxweb3/x402-evm), replacing the earlier
 * hand-rolled facilitator.ts. This is what ASP #5534's rejection Reason #1
 * ("has not passed x402 standard validation... integrate x402 using the
 * OKX Payment SDK") was asking for specifically.
 *
 * OKXFacilitatorClient handles OKX's real signed request authentication
 * (OK-ACCESS-KEY/SIGN/PASSPHRASE/TIMESTAMP - the same HMAC scheme as their
 * exchange API) internally - nothing here hand-rolls signing.
 */

export function isRealPaymentConfigured(): boolean {
  return !!process.env.OKX_API_KEY && !!process.env.OKX_API_SECRET && !!process.env.OKX_API_PASSPHRASE;
}

let cachedServer: x402ResourceServer | null = null;
let initPromise: Promise<x402ResourceServer | null> | null = null;

/**
 * Returns the real, OKX-SDK-backed resource server, lazily initialized and
 * cached per process. initialize() makes a real network call to OKX's
 * facilitator to fetch supported schemes - if that fails (unreachable,
 * bad credentials), this returns null and callers fall back to demo mode,
 * same pattern as every other real/demo split in this app.
 */
export async function getRealResourceServer(): Promise<x402ResourceServer | null> {
  if (!isRealPaymentConfigured()) return null;

  if (!cachedServer) {
    cachedServer = new x402ResourceServer(
      new OKXFacilitatorClient({
        apiKey: process.env.OKX_API_KEY!,
        secretKey: process.env.OKX_API_SECRET!,
        passphrase: process.env.OKX_API_PASSPHRASE!,
      })
    );
    cachedServer.register(X_LAYER_CAIP2, new ExactEvmScheme());
  }

  if (!initPromise) {
    initPromise = cachedServer
      .initialize()
      .then(() => cachedServer)
      .catch((err) => {
        logEvent({ level: "error", event: "okx_resource_server_init_failed", message: err instanceof Error ? err.message : String(err) });
        return null;
      });
  }

  return initPromise;
}

export interface RealChallenge {
  x402Version: number;
  resource: { url: string; description?: string };
  accepts: PaymentRequirements[];
}

/**
 * Builds a real, facilitator-backed payment challenge for the configured
 * asset (default USD₮0 on X Layer). Returns null if real payment isn't
 * configured or the resource server failed to initialize - callers must
 * fall back to demo mode in that case.
 */
export async function buildRealChallenge(resource: string, priceUsd: string): Promise<RealChallenge | null> {
  const server = await getRealResourceServer();
  if (!server) return null;

  const symbol = process.env.X402_ASSET ?? "USD₮0";
  const token = resolveToken(X_LAYER_CAIP2, symbol);
  if (!token) {
    logEvent({ level: "error", event: "x402_unresolved_token", network: X_LAYER_CAIP2, symbol, message: "No verified token entry - cannot build a real payment requirement." });
    return null;
  }

  const payTo = process.env.X402_RECEIVING_ADDRESS;
  if (!payTo || payTo === "0x0000000000000000000000000000000000000000") {
    logEvent({ level: "error", event: "x402_no_receiving_address", message: "X402_RECEIVING_ADDRESS is unset or the null address - payments would go nowhere." });
    return null;
  }

  const accepts = await server.buildPaymentRequirements({
    scheme: "exact",
    payTo,
    network: X_LAYER_CAIP2,
    price: {
      asset: token.address,
      amount: toAtomicUnits(priceUsd, token.decimals),
      extra: { name: token.name, symbol, decimals: token.decimals },
    },
  });

  return {
    x402Version: 1,
    resource: { url: resource, description: "TaxForge ASP — pay-per-call agent tax intelligence" },
    accepts,
  };
}

/** Decodes a PAYMENT-SIGNATURE/X-PAYMENT header into the SDK's PaymentPayload shape. */
function decodePaymentHeader(header: string): PaymentPayload | null {
  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === "object" && "accepted" in parsed) {
      return parsed as PaymentPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyRealPayment(
  paymentHeader: string,
  requirement: PaymentRequirements
): Promise<{ valid: boolean; reason?: string }> {
  const server = await getRealResourceServer();
  if (!server) return { valid: false, reason: "real payment server not available" };

  const payload = decodePaymentHeader(paymentHeader);
  if (!payload) return { valid: false, reason: "malformed payment payload" };

  try {
    const result = await server.verifyPayment(payload, requirement);
    return { valid: result.isValid, reason: result.invalidReason ?? result.invalidMessage };
  } catch (err) {
    logEvent({ level: "error", event: "x402_real_verify_error", message: err instanceof Error ? err.message : String(err) });
    return { valid: false, reason: "verification request failed" };
  }
}

export async function settleRealPayment(
  paymentHeader: string,
  requirement: PaymentRequirements
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const server = await getRealResourceServer();
  if (!server) return { success: false, error: "real payment server not available" };

  const payload = decodePaymentHeader(paymentHeader);
  if (!payload) return { success: false, error: "malformed payment payload" };

  try {
    const result = await server.settlePayment(payload, requirement);
    return { success: result.success, txHash: result.transaction, error: result.errorMessage };
  } catch (err) {
    logEvent({ level: "error", event: "x402_real_settle_error", message: err instanceof Error ? err.message : String(err) });
    return { success: false, error: "settlement request failed" };
  }
}
