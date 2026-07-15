/**
 * Verified ERC-20 contract addresses, keyed by network then symbol.
 * Real x402 implementations (Coinbase's own spec, Base, Avalanche, Exa,
 * CoinMarketCap — confirmed by reading their actual 402 responses) always
 * put a contract address in the `asset` field, never a bare symbol like
 * "USDT". A bare symbol is what caused OKX's compliance checker to report
 * "could not determine token decimals" — it had no address to look up.
 *
 * Only include entries here that have been verified against an explorer.
 * resolveToken() returns null for anything not listed, and callers must
 * treat that as a loud warning, not a silent fallback to a bare symbol.
 */
export interface TokenInfo {
  address: string;
  decimals: number;
  name: string;
}

const TOKEN_REGISTRY: Record<string, Record<string, TokenInfo>> = {
  "x-layer": {
    // Verified via OKLink (OKX's own X Layer explorer), July 2026.
    USDT: { address: "0x1e4a5963abfd975d8c9021ce480b42188849d41d", decimals: 6, name: "Tether USD" },
  },
};

export function resolveToken(network: string, symbol: string): TokenInfo | null {
  return TOKEN_REGISTRY[network]?.[symbol] ?? null;
}
