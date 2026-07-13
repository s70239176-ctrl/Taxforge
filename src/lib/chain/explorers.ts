import type { Chain, RawTransaction } from "@/lib/tax/types";
import { logEvent } from "@/lib/logging";

/**
 * Real multi-chain transaction history fetching via public block explorer
 * APIs. Raw RPC has no efficient "list all transactions for this address"
 * method — that's what explorers/indexers are for — so this is the
 * realistic, standard approach any production ingestion pipeline uses.
 *
 * Two real providers wired in:
 *   - Etherscan V2 unified multichain API (ethereum, arbitrum, base) — one
 *     API key, chainid selects the network. Confirmed current as of this
 *     writing: https://api.etherscan.io/v2/api
 *   - OKLink explorer API (x-layer) — confirmed base URL
 *     https://www.oklink.com/api/v5/explorer/, auth via `Ok-Access-Key`
 *     header, chainShortName=XLAYER confirmed as a supported chain.
 *     CAVEAT: the exact response field names for the address
 *     transaction-list endpoint were not fully confirmed against a live
 *     authenticated call while building this — the request shape below
 *     follows OKLink's documented conventions, but verify field names
 *     against your own API key's response the first time you call it, and
 *     adjust `mapOklinkTx` if any field name differs.
 *
 * Every function degrades to an empty array (never throws) on missing keys
 * or request failure, and logs why — so a missing API key never takes down
 * an endpoint that also needs to serve already-persisted data.
 */

const ETHERSCAN_CHAIN_IDS: Partial<Record<Chain, number>> = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
};

interface EtherscanTx {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  gasUsed: string;
  gasPrice: string;
  confirmations: string;
}

async function fetchEtherscanV2(chain: Chain, address: string): Promise<RawTransaction[]> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  const chainId = ETHERSCAN_CHAIN_IDS[chain];
  if (!apiKey || !chainId) {
    logEvent({ level: "warn", event: "explorer_skip_no_key", provider: "etherscan-v2", chain });
    return [];
  }

  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", String(chainId));
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("sort", "desc");
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await fetch(url.toString());
    const data = (await res.json()) as { status: string; message: string; result: EtherscanTx[] | string };
    if (data.status !== "1" || !Array.isArray(data.result)) {
      logEvent({ level: "warn", event: "explorer_empty_result", provider: "etherscan-v2", chain, message: data.message });
      return [];
    }
    return data.result.map((tx) => mapEtherscanTx(tx, chain, address));
  } catch (err) {
    logEvent({ level: "error", event: "explorer_fetch_error", provider: "etherscan-v2", chain, message: String(err) });
    return [];
  }
}

function mapEtherscanTx(tx: EtherscanTx, chain: Chain, address: string): RawTransaction {
  const decimals = tx.tokenDecimal ? Number(tx.tokenDecimal) : 18;
  const amount = Number(tx.value) / 10 ** decimals;
  const direction: "IN" | "OUT" = tx.to?.toLowerCase() === address.toLowerCase() ? "IN" : "OUT";
  const gasUsd = 0; // requires a price feed to convert gas (in native token) to USD — plug in your pricing source

  return {
    hash: tx.hash,
    chain,
    blockNumber: Number(tx.blockNumber),
    confirmations: Number(tx.confirmations ?? 0),
    timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
    from: tx.from,
    to: tx.to,
    asset: tx.tokenSymbol || (chain === "ethereum" ? "ETH" : chain === "arbitrum" ? "ETH" : "ETH"),
    amount,
    direction,
    priceUsdAtTx: 0, // requires a historical price feed — see docs/architecture.md "What's real vs mocked"
    gasUsd,
  };
}

interface OklinkTx {
  txId: string;
  height?: string;
  transactionTime: string;
  from: string;
  to: string;
  amount: string;
  symbol?: string;
  state?: string;
}

async function fetchOklinkTransactions(address: string): Promise<RawTransaction[]> {
  const apiKey = process.env.OKLINK_API_KEY;
  if (!apiKey) {
    logEvent({ level: "warn", event: "explorer_skip_no_key", provider: "oklink", chain: "x-layer" });
    return [];
  }

  const url = new URL("https://www.oklink.com/api/v5/explorer/address/transaction-list");
  url.searchParams.set("chainShortName", "XLAYER");
  url.searchParams.set("address", address);
  url.searchParams.set("limit", "100");

  try {
    const res = await fetch(url.toString(), { headers: { "Ok-Access-Key": apiKey } });
    const data = (await res.json()) as { code: string; msg: string; data: Array<{ transactionLists?: OklinkTx[] }> };
    if (data.code !== "0" || !Array.isArray(data.data) || data.data.length === 0) {
      logEvent({ level: "warn", event: "explorer_empty_result", provider: "oklink", chain: "x-layer", message: data.msg });
      return [];
    }
    const txs = data.data[0]?.transactionLists ?? [];
    return txs.map((tx) => mapOklinkTx(tx, address));
  } catch (err) {
    logEvent({ level: "error", event: "explorer_fetch_error", provider: "oklink", chain: "x-layer", message: String(err) });
    return [];
  }
}

function mapOklinkTx(tx: OklinkTx, address: string): RawTransaction {
  const direction: "IN" | "OUT" = tx.to?.toLowerCase() === address.toLowerCase() ? "IN" : "OUT";
  return {
    hash: tx.txId,
    chain: "x-layer",
    blockNumber: tx.height ? Number(tx.height) : 0,
    confirmations: 0,
    timestamp: new Date(Number(tx.transactionTime)).toISOString(),
    from: tx.from,
    to: tx.to,
    asset: tx.symbol || "OKB",
    amount: Number(tx.amount),
    direction,
    priceUsdAtTx: 0, // requires a historical price feed
    gasUsd: 0,
  };
}

/**
 * Fetches real transaction history for an address on the given chain.
 * Returns [] (never throws) if the relevant API key isn't configured, so
 * callers can safely fall back to sample/demo data or already-persisted
 * transactions.
 *
 * priceUsdAtTx and gasUsd come back as 0 from raw explorer data — explorers
 * report token amounts, not historical USD value. Wire in a price feed
 * (CoinGecko historical API, OKX market API, or your own price oracle) and
 * populate those fields before classification if accurate cost-basis
 * numbers matter for real filings.
 */
export async function fetchRealTransactions(chain: Chain, address: string): Promise<RawTransaction[]> {
  if (chain === "x-layer" || chain === "okx-chain") {
    return fetchOklinkTransactions(address);
  }
  return fetchEtherscanV2(chain, address);
}

export async function fetchRealTransactionsMultiChain(
  chains: Chain[],
  address: string
): Promise<RawTransaction[]> {
  const results = await Promise.all(chains.map((c) => fetchRealTransactions(c, address)));
  return results.flat();
}
