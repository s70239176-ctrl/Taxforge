import type {
  ClassifiedTransaction,
  IncomeType,
  Jurisdiction,
  RealizedDisposal,
  TaxImpact,
  TransactionCategory,
} from "./types";

/**
 * Bracket-free, effective-rate approximations for demo purposes. A real
 * deployment plugs in the user's actual marginal bracket; TaxForge exposes
 * these as overridable constants precisely so that swap is trivial.
 */
export const JURISDICTION_RATES: Record<
  Jurisdiction,
  { shortTermPct: number; longTermPct: number; ordinaryIncomePct: number; notes: string[] }
> = {
  US: {
    shortTermPct: 0.32, // taxed as ordinary income at assumed bracket
    longTermPct: 0.15,
    ordinaryIncomePct: 0.32,
    notes: [
      "US: assets held > 365 days qualify for long-term capital gains rates.",
      "Airdrops and DeFi yield are ordinary income at fair market value on receipt (Rev. Rul. 2019-24, Notice 2014-21 line of guidance).",
    ],
  },
  DE: {
    shortTermPct: 0.26375, // flat capital gains-style withholding used as an approximation
    longTermPct: 0.0, // Germany: private disposals held > 1 year are tax-free for individuals
    ordinaryIncomePct: 0.42,
    notes: [
      "DE: private-sale exemption — gains on assets held over 1 year are tax-free for individual (non-business) holders (§23 EStG).",
      "An autonomous trading agent operated at commercial scale may be reclassified as a business activity, removing the exemption — flagged in disposals where relevant.",
    ],
  },
  FR: {
    shortTermPct: 0.3,
    longTermPct: 0.3, // France: flat 30% PFU regardless of holding period
    ordinaryIncomePct: 0.3,
    notes: ["FR: flat 30% 'Prélèvement Forfaitaire Unique' applies regardless of holding period."],
  },
  EU_GENERIC: {
    shortTermPct: 0.28,
    longTermPct: 0.28,
    ordinaryIncomePct: 0.28,
    notes: [
      "EU_GENERIC: placeholder blended rate — MiCA harmonizes reporting, not tax treatment, which stays member-state specific. Select a member state for accurate figures.",
    ],
  },
};

/** Maps a transaction category to how it is taxed, independent of jurisdiction. */
export function incomeTypeForCategory(category: TransactionCategory): IncomeType {
  switch (category) {
    case "TRANSFER":
    case "GAS_REFUND":
    case "BRIDGE":
      return "NON_TAXABLE";
    case "SWAP":
    case "NFT_TRADE":
      return "CAPITAL_GAIN";
    case "DEFI_YIELD":
    case "STAKING_REWARD":
    case "AIRDROP":
      return "ORDINARY_INCOME";
    case "AGENT_PAYMENT":
      // Receiving payment for services rendered by an autonomous agent is
      // business income; paying out in a crypto asset is *also* a disposal
      // of that asset (both legs are handled by the caller).
      return "BUSINESS_INCOME";
    case "MEV":
      // Arbitrage/backrun/sandwich proceeds captured programmatically are
      // treated as trading business income rather than passive capital gain
      // in most enforcement guidance, given the systematic, for-profit nature.
      return "BUSINESS_INCOME";
    case "UNKNOWN":
    default:
      return "CAPITAL_GAIN";
  }
}

export function isTaxableCategory(category: TransactionCategory): boolean {
  return incomeTypeForCategory(category) !== "NON_TAXABLE";
}

/** One-sentence, jurisdiction-aware human explanation used in the UI and reports. */
export function explainTreatment(tx: ClassifiedTransaction, jurisdiction: Jurisdiction): string {
  const rates = JURISDICTION_RATES[jurisdiction];
  switch (tx.category) {
    case "DEFI_YIELD":
      return `Ordinary income at $${tx.priceUsdAtTx.toFixed(4)}/unit on receipt; establishes new cost basis for future disposal.`;
    case "AIRDROP":
      return `Taxed as ordinary income at fair market value the moment dominion and control begin.`;
    case "AGENT_PAYMENT":
      return tx.direction === "IN"
        ? `Business income — payment received for agent-rendered services.`
        : `Business expense to the payer, and a disposal event for the asset transferred if paid in-kind.`;
    case "MEV":
      return `Treated as business income from systematic trading activity, not a passive capital gain.`;
    case "SWAP":
      return `Disposal of ${tx.asset}; realized gain taxed at ${jurisdiction} short/long-term rates depending on holding period.`;
    case "TRANSFER":
      return `Wallet-to-wallet transfer between addresses under common control — not a taxable event.`;
    default:
      return `Classified as ${tx.category.toLowerCase().replace("_", " ")}.`;
  }
}

/** Rolls up disposals + income events into a single TaxImpact for reporting/simulation. */
export function computeTaxImpact(params: {
  asset: string;
  jurisdiction: Jurisdiction;
  method: TaxImpact["method"];
  disposals: RealizedDisposal[];
  ordinaryIncomeUsd?: number;
}): TaxImpact {
  const rates = JURISDICTION_RATES[params.jurisdiction];
  const shortTermGainUsd = params.disposals
    .filter((d) => d.term === "SHORT")
    .reduce((s, d) => s + d.gainUsd, 0);
  const longTermGainUsd = params.disposals
    .filter((d) => d.term === "LONG")
    .reduce((s, d) => s + d.gainUsd, 0);
  const realizedGainUsd = shortTermGainUsd + longTermGainUsd;
  const ordinaryIncomeUsd = params.ordinaryIncomeUsd ?? 0;

  const taxOnShort = Math.max(0, shortTermGainUsd) * rates.shortTermPct;
  const taxOnLong = Math.max(0, longTermGainUsd) * rates.longTermPct;
  const taxOnOrdinary = Math.max(0, ordinaryIncomeUsd) * rates.ordinaryIncomePct;
  const estimatedTaxUsd = taxOnShort + taxOnLong + taxOnOrdinary;

  const totalIncome = realizedGainUsd + ordinaryIncomeUsd;
  const effectiveRatePct = totalIncome > 0 ? (estimatedTaxUsd / totalIncome) * 100 : 0;

  return {
    method: params.method,
    jurisdiction: params.jurisdiction,
    asset: params.asset,
    disposals: params.disposals,
    realizedGainUsd,
    shortTermGainUsd,
    longTermGainUsd,
    ordinaryIncomeUsd,
    estimatedTaxUsd,
    effectiveRatePct,
    notes: rates.notes,
  };
}
