/**
 * Regenerates data/sample-transactions.json — a realistic multi-chain feed
 * for a single autonomous trading agent's wallet, covering every category
 * in TaxForge's taxable-event taxonomy (transfers, bridges, swaps, DeFi
 * yield, staking, airdrops, agent-to-agent payments, MEV, NFT trades, gas
 * refunds) across X Layer, Ethereum, Arbitrum, and Base.
 *
 * Run with: npm run seed
 */
import { createHash, randomBytes } from "crypto";
import { writeFileSync } from "fs";
import path from "path";
import { DEMO_WALLET } from "../src/lib/demo-config";

function hash(): string {
  return "0x" + randomBytes(32).toString("hex");
}

function addr(seed: string): string {
  return "0x" + createHash("sha256").update(seed).digest("hex").slice(0, 40);
}

function iso(daysAgo: number, hour = 12, minute?: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute ?? Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

interface Row {
  hash: string;
  blockNumber: number;
  confirmations: number;
  gasUsd: number;
  chain: string;
  timestamp: string;
  from: string;
  to: string;
  asset: string;
  amount: number;
  direction: "IN" | "OUT";
  priceUsdAtTx: number;
  counterpartyAgentId?: string;
  memo?: string;
}

const AGENT = DEMO_WALLET;
const agents = {
  yieldOptimizer: addr("agent-yield-optimizer-01"),
  mevSearcher: addr("agent-mev-searcher-07"),
  dataVendor: addr("agent-data-vendor-quant"),
  computeProvider: addr("agent-compute-provider-gpu"),
  tradingBot: addr("agent-trading-bot-delta"),
};

const rows: Row[] = [];
function push(row: Omit<Row, "hash" | "blockNumber" | "confirmations" | "gasUsd"> & Partial<Pick<Row, "gasUsd">>) {
  rows.push({
    hash: hash(),
    blockNumber: 4_812_000 + rows.length * 37,
    confirmations: 128,
    gasUsd: row.gasUsd ?? +(Math.random() * 1.2 + 0.05).toFixed(4),
    ...row,
  });
}

// Treasury funding + bridge to X Layer
push({ chain: "ethereum", timestamp: iso(210, 9), from: addr("cex-hot-wallet"), to: AGENT, asset: "USDC", amount: 50000, direction: "IN", priceUsdAtTx: 1.0, memo: "treasury funding transfer" });
push({ chain: "ethereum", timestamp: iso(205, 10), from: AGENT, to: addr("xlayer-bridge"), asset: "USDC", amount: 30000, direction: "OUT", priceUsdAtTx: 1.0, memo: "bridge to x-layer" });
push({ chain: "x-layer", timestamp: iso(205, 10, 30), from: addr("xlayer-bridge"), to: AGENT, asset: "USDC", amount: 29940, direction: "IN", priceUsdAtTx: 1.0, memo: "bridge receipt from ethereum" });

// Swap series (agent trading OKB/ETH/USDC on X Layer)
const swapDays = [190, 170, 150, 130, 95, 60, 40, 22, 9, 3];
let okbAmt = 0;
swapDays.forEach((d, i) => {
  const priceOkb = 42 + Math.sin(i) * 6 + i * 0.3;
  const usdcIn = 2500 + i * 300;
  const okbOut = +(usdcIn / priceOkb).toFixed(4);
  push({ chain: "x-layer", timestamp: iso(d, 11), from: AGENT, to: addr("okx-dex-router"), asset: "USDC", amount: usdcIn, direction: "OUT", priceUsdAtTx: 1.0, memo: "swap via dex router" });
  push({ chain: "x-layer", timestamp: iso(d, 11, 1), from: addr("okx-dex-router"), to: AGENT, asset: "OKB", amount: okbOut, direction: "IN", priceUsdAtTx: priceOkb, memo: "swap via dex router" });
  okbAmt += okbOut;
});
push({ chain: "x-layer", timestamp: iso(5, 14), from: AGENT, to: addr("okx-dex-router"), asset: "OKB", amount: +(okbAmt * 0.4).toFixed(4), direction: "OUT", priceUsdAtTx: 58.4, memo: "swap via dex router" });
push({ chain: "x-layer", timestamp: iso(5, 14, 1), from: addr("okx-dex-router"), to: AGENT, asset: "USDC", amount: +(okbAmt * 0.4 * 58.4).toFixed(2), direction: "IN", priceUsdAtTx: 1.0, memo: "swap via dex router" });

// DeFi yield — lending interest + LP farm rewards (ordinary income)
[160, 120, 90, 60, 30, 10].forEach((d, i) => {
  push({ chain: "x-layer", timestamp: iso(d, 6), from: addr("okx-lend-pool"), to: AGENT, asset: "USDC", amount: +(45 + i * 8).toFixed(2), direction: "IN", priceUsdAtTx: 1.0, memo: "lend yield distribution" });
});
[140, 80, 20].forEach((d, i) => {
  push({ chain: "arbitrum", timestamp: iso(d, 7), from: addr("lp-farm-contract"), to: AGENT, asset: "ARB", amount: +(120 + i * 15).toFixed(2), direction: "IN", priceUsdAtTx: 0.85 + i * 0.05, memo: "lp farm yield reward" });
});

// Staking rewards
[180, 150, 120, 90, 60, 30].forEach((d) => {
  push({ chain: "ethereum", timestamp: iso(d, 0, 5), from: addr("eth-staking-pool"), to: AGENT, asset: "ETH", amount: 0.012, direction: "IN", priceUsdAtTx: 3100 + Math.random() * 400, memo: "staking reward" });
});

// Airdrops
push({ chain: "base", timestamp: iso(75, 15), from: addr("airdrop-distributor"), to: AGENT, asset: "BASE-GOV", amount: 850, direction: "IN", priceUsdAtTx: 0.42, memo: "governance token airdrop claim" });
push({ chain: "arbitrum", timestamp: iso(45, 15), from: addr("airdrop-distributor-2"), to: AGENT, asset: "ARB", amount: 300, direction: "IN", priceUsdAtTx: 0.95, memo: "retroactive airdrop claim" });

// Agent-to-agent payments — TaxForge's core wedge category
push({ chain: "x-layer", timestamp: iso(50, 13), from: AGENT, to: agents.dataVendor, asset: "USDC", amount: 18, direction: "OUT", priceUsdAtTx: 1.0, counterpartyAgentId: "agent-data-vendor-quant.x402", memo: "a2a payment: market data feed" });
push({ chain: "x-layer", timestamp: iso(37, 13), from: AGENT, to: agents.computeProvider, asset: "USDC", amount: 6.4, direction: "OUT", priceUsdAtTx: 1.0, counterpartyAgentId: "agent-compute-provider-gpu.x402", memo: "a2a payment: inference compute" });
push({ chain: "x-layer", timestamp: iso(25, 13), from: agents.tradingBot, to: AGENT, asset: "USDC", amount: 42, direction: "IN", priceUsdAtTx: 1.0, counterpartyAgentId: "agent-trading-bot-delta.x402", memo: "a2a payment received: signal licensing fee" });
push({ chain: "x-layer", timestamp: iso(11, 9), from: AGENT, to: agents.yieldOptimizer, asset: "USDC", amount: 9.5, direction: "OUT", priceUsdAtTx: 1.0, counterpartyAgentId: "agent-yield-optimizer-01.x402", memo: "a2a payment: yield route optimization query" });

// MEV proceeds
push({ chain: "ethereum", timestamp: iso(64, 2), from: addr("mev-relay"), to: AGENT, asset: "ETH", amount: 0.081, direction: "IN", priceUsdAtTx: 3260, memo: "mev arbitrage backrun proceeds" });
push({ chain: "x-layer", timestamp: iso(19, 3), from: addr("mev-relay-xlayer"), to: AGENT, asset: "USDC", amount: 61.2, direction: "IN", priceUsdAtTx: 1.0, memo: "mev sandwich capture proceeds" });

// NFT trade
push({ chain: "base", timestamp: iso(100, 16), from: AGENT, to: addr("nft-marketplace"), asset: "ETH", amount: 0.4, direction: "OUT", priceUsdAtTx: 2950, memo: "nft purchase via marketplace" });
push({ chain: "base", timestamp: iso(15, 16), from: addr("nft-marketplace"), to: AGENT, asset: "ETH", amount: 0.55, direction: "IN", priceUsdAtTx: 3340, memo: "nft sale via marketplace" });

// Gas refund
push({ chain: "x-layer", timestamp: iso(8, 17), from: addr("okx-dex-router"), to: AGENT, asset: "OKB", amount: 0.03, direction: "IN", priceUsdAtTx: 58.9, memo: "gas refund from router" });

rows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

const outPath = path.join(__dirname, "..", "data", "sample-transactions.json");
writeFileSync(outPath, JSON.stringify(rows, null, 2));
console.log(`Wrote ${rows.length} transactions to ${outPath}`);
console.log(`Demo wallet: ${AGENT}`);
