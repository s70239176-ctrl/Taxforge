/**
 * Verified ERC-20 contract addresses OKX's own payment facilitator
 * actually supports, keyed by CAIP-2 network id then symbol.
 *
 * This replaces an earlier version that used a real, explorer-verified
 * USDT deployment on X Layer that turned out NOT to be one OKX's
 * facilitator recognizes — verifying a token exists on-chain is not the
 * same as verifying a specific payment system supports it. These entries
 * are sourced directly from OKX's own payment API reference
 * (web3.okx.com/onchainos/dev-docs/payments), which lists exactly three
 * supported stablecoins on X Layer: USDG, USD₮0 (a specific canonical
 * bridged Tether variant - NOT the same contract as generic "USDT"), and
 * USDC.
 *
 * Network keys are CAIP-2 format ("eip155:196" for X Layer), which the
 * real @okxweb3/x402-core SDK's Network type structurally requires
 * (`${string}:${string}`) - a bare "x-layer" string doesn't even
 * type-check against it.
 */
export interface TokenInfo {
  address: string;
  decimals: number;
  name: string;
}

const TOKEN_REGISTRY: Record<string, Record<string, TokenInfo>> = {
  "eip155:196": {
    // Verified against OKX's own payment API reference docs, July 2026.
    "USD₮0": { address: "0x779ded0c9e1022225f8e0630b35a9b54be713736", decimals: 6, name: "USD₮0" },
    USDC: { address: "0x74b7f16337b8972027f6196a17a631ac6de26d22", decimals: 6, name: "USD Coin" },
    USDG: { address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", decimals: 6, name: "Global Dollar" },
  },
};

/** CAIP-2 network id for X Layer, used throughout the x402 payment layer. */
export const X_LAYER_CAIP2 = "eip155:196";

export function resolveToken(network: string, symbol: string): TokenInfo | null {
  return TOKEN_REGISTRY[network]?.[symbol] ?? null;
}
