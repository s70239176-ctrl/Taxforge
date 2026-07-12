import { describe, it, expect } from "vitest";
import { incomeTypeForCategory, isTaxableCategory, computeTaxImpact } from "@/lib/tax/rules-engine";

describe("incomeTypeForCategory", () => {
  it("treats transfers, bridges, and gas refunds as non-taxable", () => {
    expect(incomeTypeForCategory("TRANSFER")).toBe("NON_TAXABLE");
    expect(incomeTypeForCategory("BRIDGE")).toBe("NON_TAXABLE");
    expect(incomeTypeForCategory("GAS_REFUND")).toBe("NON_TAXABLE");
  });

  it("treats swaps and NFT trades as capital gains", () => {
    expect(incomeTypeForCategory("SWAP")).toBe("CAPITAL_GAIN");
    expect(incomeTypeForCategory("NFT_TRADE")).toBe("CAPITAL_GAIN");
  });

  it("treats DeFi yield, staking, and airdrops as ordinary income", () => {
    expect(incomeTypeForCategory("DEFI_YIELD")).toBe("ORDINARY_INCOME");
    expect(incomeTypeForCategory("STAKING_REWARD")).toBe("ORDINARY_INCOME");
    expect(incomeTypeForCategory("AIRDROP")).toBe("ORDINARY_INCOME");
  });

  it("treats agent-to-agent payments and MEV as business income", () => {
    expect(incomeTypeForCategory("AGENT_PAYMENT")).toBe("BUSINESS_INCOME");
    expect(incomeTypeForCategory("MEV")).toBe("BUSINESS_INCOME");
  });
});

describe("isTaxableCategory", () => {
  it("flags transfers as non-taxable and everything else as taxable", () => {
    expect(isTaxableCategory("TRANSFER")).toBe(false);
    expect(isTaxableCategory("SWAP")).toBe(true);
    expect(isTaxableCategory("AGENT_PAYMENT")).toBe(true);
  });
});

describe("computeTaxImpact", () => {
  const disposals = [
    { lotId: "l1", amountUsed: 1, costBasisUsd: 100, proceedsUsd: 300, gainUsd: 200, holdingPeriodDays: 30, term: "SHORT" as const },
    { lotId: "l2", amountUsed: 1, costBasisUsd: 100, proceedsUsd: 250, gainUsd: 150, holdingPeriodDays: 400, term: "LONG" as const },
  ];

  it("applies short-term and long-term rates independently for the US", () => {
    const impact = computeTaxImpact({ asset: "ETH", jurisdiction: "US", method: "FIFO", disposals });
    expect(impact.shortTermGainUsd).toBe(200);
    expect(impact.longTermGainUsd).toBe(150);
    expect(impact.realizedGainUsd).toBe(350);
    expect(impact.estimatedTaxUsd).toBeGreaterThan(0);
  });

  it("applies Germany's zero rate on long-term private-sale gains", () => {
    const impact = computeTaxImpact({ asset: "ETH", jurisdiction: "DE", method: "FIFO", disposals });
    // Only the short-term gain should be taxed; long-term (>1yr) is exempt under DE rules.
    const shortOnlyTax = impact.estimatedTaxUsd;
    expect(shortOnlyTax).toBeGreaterThan(0);
    expect(shortOnlyTax).toBeLessThan(200 * 0.26375 + 150 * 0.01); // sanity: long-term contributes ~nothing
  });

  it("includes ordinary income in the effective rate calculation", () => {
    const impact = computeTaxImpact({
      asset: "PORTFOLIO",
      jurisdiction: "US",
      method: "FIFO",
      disposals: [],
      ordinaryIncomeUsd: 1000,
    });
    expect(impact.ordinaryIncomeUsd).toBe(1000);
    expect(impact.estimatedTaxUsd).toBeCloseTo(1000 * 0.32, 5);
  });
});
