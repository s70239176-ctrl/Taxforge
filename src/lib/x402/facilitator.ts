import { logEvent } from "@/lib/logging";

/**
 * Real client for the x402 v2 facilitator HTTP API (POST /verify, POST
 * /settle — no auth required, per the open spec: coinbase/x402,
 * x402-foundation/x402). Any x402-compliant facilitator exposes this same
 * contract, including whatever facilitator OKX assigns your ASP during
 * Onchain OS registration — point X402_FACILITATOR_URL at it and this
 * client speaks to the real thing.
 *
 * Falls back to the local mock adapter (src/lib/chain/xlayer.ts) when
 * X402_FACILITATOR_URL is unset, so the app keeps working before you have
 * real facilitator credentials — but this fallback MUST NOT be used once
 * you're live on the OKX.AI marketplace, since it doesn't actually verify
 * anyone paid you. Watch the startup log — it prints which mode is active.
 */

export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: unknown; // signed authorization — opaque to us, defined by the scheme
}

export interface PaymentRequirementsEntry {
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
}

interface FacilitatorVerifyResponse {
  isValid: boolean;
  invalidReason?: string;
}

interface FacilitatorSettleResponse {
  success: boolean;
  transaction?: string; // settlement tx hash
  network?: string;
  error?: string;
}

function facilitatorUrl(): string | null {
  const url = process.env.X402_FACILITATOR_URL;
  return url && url.length > 0 ? url.replace(/\/+$/, "") : null;
}

export function isFacilitatorConfigured(): boolean {
  return facilitatorUrl() !== null;
}

/**
 * Decodes the X-PAYMENT header into a PaymentPayload. Per x402, this header
 * is base64-encoded JSON. Falls back to treating it as a raw opaque token
 * for the mock/demo path.
 */
function decodePaymentHeader(header: string): PaymentPayload | string {
  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === "object" && "scheme" in parsed) {
      return parsed as PaymentPayload;
    }
    return header;
  } catch {
    return header; // not base64 JSON — treat as opaque (mock/demo mode)
  }
}

export async function verifyWithFacilitator(
  paymentHeader: string,
  requirement: PaymentRequirementsEntry
): Promise<{ valid: boolean; reason?: string }> {
  const base = facilitatorUrl();
  if (!base) {
    // No real facilitator configured — this path must only be hit in local/demo mode.
    logEvent({ level: "warn", event: "x402_facilitator_not_configured", resource: requirement.resource });
    return { valid: paymentHeader.length > 8 }; // demo-mode leniency, see module doc
  }

  const paymentPayload = decodePaymentHeader(paymentHeader);
  try {
    const res = await fetch(`${base}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements: requirement }),
    });
    if (!res.ok) {
      logEvent({ level: "error", event: "x402_verify_http_error", status: res.status, resource: requirement.resource });
      return { valid: false, reason: `facilitator returned HTTP ${res.status}` };
    }
    const data = (await res.json()) as FacilitatorVerifyResponse;
    return { valid: data.isValid, reason: data.invalidReason };
  } catch (err) {
    logEvent({ level: "error", event: "x402_verify_network_error", message: String(err), resource: requirement.resource });
    return { valid: false, reason: "facilitator unreachable" };
  }
}

export async function settleWithFacilitator(
  paymentHeader: string,
  requirement: PaymentRequirementsEntry
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const base = facilitatorUrl();
  if (!base) {
    return { success: true, txHash: undefined }; // demo mode — see mockOkxPaymentAdapter for the fake-hash path
  }

  const paymentPayload = decodePaymentHeader(paymentHeader);
  try {
    const res = await fetch(`${base}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements: requirement }),
    });
    const data = (await res.json()) as FacilitatorSettleResponse;
    if (!res.ok || !data.success) {
      logEvent({ level: "error", event: "x402_settle_failed", status: res.status, error: data.error });
      return { success: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { success: true, txHash: data.transaction };
  } catch (err) {
    logEvent({ level: "error", event: "x402_settle_network_error", message: String(err) });
    return { success: false, error: "facilitator unreachable" };
  }
}
