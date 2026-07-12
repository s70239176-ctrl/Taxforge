/**
 * Core domain types shared across the classification engine, cost-basis
 * engine, simulation API, and report generator.
 */

export type Chain =
  | "x-layer"
  | "ethereum"
  | "arbitrum"
  | "base"
  | "okx-chain";

export type Jurisdiction = "US" | "DE" | "FR" | "EU_GENERIC";

export type CostBasisMethod = "FIFO" | "LIFO" | "HIFO";

/**
 * The taxable-event taxonomy TaxForge classifies every inbound transaction
 * into. Deliberately broader than "buy/sell" because agent-generated
 * activity produces event types most consumer tax tools never see.
 */
export type TransactionCategory =
  | "TRANSFER" // wallet-to-wallet, same beneficial owner, non-taxable
  | "SWAP" // on-chain trade, disposal + acquisition
  | "DEFI_YIELD" // LP rewards, lending interest, liquid staking yield
  | "STAKING_REWARD"
  | "AIRDROP"
  | "AGENT_PAYMENT" // A2A: one agent pays another for a service/data/compute
  | "MEV" // sandwich/arbitrage/backrun proceeds captured by the agent
  | "NFT_TRADE"
  | "BRIDGE"
  | "GAS_REFUND"
  | "UNKNOWN";

export type IncomeType =
  | "CAPITAL_GAIN"
  | "ORDINARY_INCOME"
  | "BUSINESS_INCOME"
  | "NON_TAXABLE";

export interface RawTransaction {
  hash: string;
  chain: Chain;
  blockNumber: number;
  confirmations: number;
  timestamp: string; // ISO 8601
  from: string;
  to: string;
  asset: string; // symbol, e.g. "USDC"
  amount: number; // absolute value moved
  direction: "IN" | "OUT";
  priceUsdAtTx: number; // fair market value per unit at tx time
  gasUsd: number;
  counterpartyAgentId?: string; // present when the counterparty is a known agent (A2A)
  memo?: string;
}

export interface ClassifiedTransaction extends RawTransaction {
  category: TransactionCategory;
  incomeType: IncomeType;
  confidence: number; // 0..1, from the classifier
  taxable: boolean;
  classifierSource: "heuristic" | "llm";
  reasoning: string; // short human-readable justification, 1 sentence
}

export interface TaxLot {
  lotId: string;
  asset: string;
  amount: number;
  remaining: number;
  costBasisUsdPerUnit: number;
  acquiredAt: string; // ISO 8601
  sourceTxHash: string;
}

export interface RealizedDisposal {
  lotId: string;
  amountUsed: number;
  costBasisUsd: number;
  proceedsUsd: number;
  gainUsd: number;
  holdingPeriodDays: number;
  term: "SHORT" | "LONG";
}

export interface TaxImpact {
  method: CostBasisMethod;
  jurisdiction: Jurisdiction;
  asset: string;
  disposals: RealizedDisposal[];
  realizedGainUsd: number;
  shortTermGainUsd: number;
  longTermGainUsd: number;
  ordinaryIncomeUsd: number;
  estimatedTaxUsd: number;
  effectiveRatePct: number;
  notes: string[];
}

export interface SimulationRequest {
  chain: Chain;
  assetIn: string;
  amountIn: number;
  assetOut: string;
  expectedAmountOut: number;
  priceUsdIn: number; // current FMV per unit of assetIn
  jurisdiction: Jurisdiction;
  method: CostBasisMethod;
  walletAddress: string;
}

export interface SimulationResult {
  request: SimulationRequest;
  impact: TaxImpact;
  netProceedsAfterTaxUsd: number;
  recommendation: string;
  alternativeMethods: Partial<Record<CostBasisMethod, number>>; // estimated tax per method
  generatedAt: string;
}

export interface TaxReport {
  id: string;
  jurisdiction: Jurisdiction;
  method: CostBasisMethod;
  periodStart: string;
  periodEnd: string;
  walletAddress: string;
  transactionCount: number;
  totalRealizedGainUsd: number;
  totalOrdinaryIncomeUsd: number;
  totalEstimatedTaxUsd: number;
  transactions: ClassifiedTransaction[];
  attestationHash: string;
  anchorTxHash?: string;
  status: "DRAFT" | "FINAL" | "ANCHORED";
  generatedAt: string;
}
