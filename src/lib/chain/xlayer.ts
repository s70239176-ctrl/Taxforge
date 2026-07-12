import { createPublicClient, http, defineChain, type Address, type Hash } from "viem";

/**
 * X Layer — OKX's zkEVM L2. Defined explicitly rather than pulled from
 * viem/chains so the RPC + explorer stay swappable via env vars alone.
 */
export const xLayer = defineChain({
  id: Number(process.env.XLAYER_CHAIN_ID ?? 196),
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.XLAYER_RPC_URL ?? "https://xlayerrpc.okx.com"] },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer" },
  },
});

export function getXLayerClient() {
  return createPublicClient({ chain: xLayer, transport: http() });
}

/**
 * Thin adapter over the OKX Payment SDK / Onchain OS agent-payments surface.
 *
 * NOTE FOR REVIEWERS: this repo does not vendor OKX's private SDK package,
 * so this adapter defines the interface TaxForge needs and a local mock
 * implementation behind it. Swapping in the real `@okx/payment-sdk` (or
 * whatever Onchain OS ships at hackathon time) means replacing the body of
 * these three functions only — nothing else in the codebase depends on the
 * implementation detail, by design.
 */
export interface OkxPaymentAdapter {
  /** Verifies an x402 payment proof against the OKX facilitator/settlement layer. */
  verifyPayment(input: { payload: string; payTo: Address; amount: string; asset: string }): Promise<{
    valid: boolean;
    settlementTxHash?: Hash;
  }>;
  /** Anchors a report's attestation hash on X Layer for public verifiability. */
  anchorHash(input: { hashHex: string; reportId: string }): Promise<{ txHash: Hash; blockNumber: number }>;
  /** Reads back an ASP's public reputation counters from the Onchain OS registry. */
  getAspReputation(aspId: string): Promise<{ callsServed: number; disputesRaised: number; uptimePct: number }>;
}

/**
 * Local mock so `npm run dev` and the demo work with zero external
 * credentials. Deterministic-ish (based on input) so repeated demo runs
 * look consistent on camera.
 */
export const mockOkxPaymentAdapter: OkxPaymentAdapter = {
  async verifyPayment({ payload }) {
    // In production this calls the x402 facilitator's /verify + /settle
    // endpoints. Here we accept any non-empty payload as "paid" so the
    // A2MCP flow is fully exercisable offline.
    const valid = typeof payload === "string" && payload.length > 8;
    return {
      valid,
      settlementTxHash: valid
        ? (`0x${hashLike(payload)}` as Hash)
        : undefined,
    };
  },
  async anchorHash({ hashHex }) {
    return {
      txHash: `0x${hashLike(hashHex)}` as Hash,
      blockNumber: 4_800_000 + (parseInt(hashHex.slice(0, 6), 16) % 50_000),
    };
  },
  async getAspReputation(aspId: string) {
    const seed = hashLike(aspId);
    const callsServed = 12_000 + (parseInt(seed.slice(0, 4), 16) % 8000);
    return { callsServed, disputesRaised: 0, uptimePct: 99.97 };
  },
};

function hashLike(input: string): string {
  // Cheap, dependency-free deterministic hex string for mock tx hashes —
  // NOT cryptographic, purely for consistent demo output. Real anchoring
  // uses the actual on-chain tx hash returned by the RPC.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(4).slice(0, 64);
}
