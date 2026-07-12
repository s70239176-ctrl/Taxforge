import { describe, it, expect } from "vitest";
import { openLot, matchDisposal, summarizeDisposals } from "@/lib/tax/cost-basis";

function lots() {
  return [
    openLot({ asset: "OKB", amount: 10, costBasisUsdPerUnit: 20, acquiredAt: "2025-01-01T00:00:00Z", sourceTxHash: "a" }),
    openLot({ asset: "OKB", amount: 10, costBasisUsdPerUnit: 40, acquiredAt: "2025-06-01T00:00:00Z", sourceTxHash: "b" }),
    openLot({ asset: "OKB", amount: 10, costBasisUsdPerUnit: 30, acquiredAt: "2025-09-01T00:00:00Z", sourceTxHash: "c" }),
  ];
}

describe("matchDisposal", () => {
  it("FIFO consumes the oldest lot first", () => {
    const { disposals } = matchDisposal(lots(), {
      asset: "OKB",
      amount: 10,
      proceedsUsd: 10 * 60,
      disposedAt: "2026-01-01T00:00:00Z",
      method: "FIFO",
    });
    expect(disposals).toHaveLength(1);
    expect(disposals[0]!.costBasisUsd).toBe(200); // 10 units @ $20
  });

  it("LIFO consumes the newest lot first", () => {
    const { disposals } = matchDisposal(lots(), {
      asset: "OKB",
      amount: 10,
      proceedsUsd: 10 * 60,
      disposedAt: "2026-01-01T00:00:00Z",
      method: "LIFO",
    });
    expect(disposals[0]!.costBasisUsd).toBe(300); // 10 units @ $30 (most recently acquired)
  });

  it("HIFO consumes the highest-cost-basis lot first", () => {
    const { disposals } = matchDisposal(lots(), {
      asset: "OKB",
      amount: 10,
      proceedsUsd: 10 * 60,
      disposedAt: "2026-01-01T00:00:00Z",
      method: "HIFO",
    });
    expect(disposals[0]!.costBasisUsd).toBe(400); // 10 units @ $40 (highest basis)
  });

  it("spans multiple lots when the disposal amount exceeds one lot", () => {
    const { disposals, shortfallAmount } = matchDisposal(lots(), {
      asset: "OKB",
      amount: 15,
      proceedsUsd: 15 * 60,
      disposedAt: "2026-01-01T00:00:00Z",
      method: "FIFO",
    });
    expect(disposals).toHaveLength(2);
    expect(shortfallAmount).toBe(0);
    const total = disposals.reduce((s, d) => s + d.amountUsed, 0);
    expect(total).toBe(15);
  });

  it("reports a shortfall when disposal amount exceeds all open lots", () => {
    const { shortfallAmount } = matchDisposal(lots(), {
      asset: "OKB",
      amount: 100,
      proceedsUsd: 100 * 60,
      disposedAt: "2026-01-01T00:00:00Z",
      method: "FIFO",
    });
    expect(shortfallAmount).toBe(70);
  });

  it("classifies long-term vs short-term correctly at the 365-day boundary", () => {
    const oldLot = [openLot({ asset: "ETH", amount: 1, costBasisUsdPerUnit: 1000, acquiredAt: "2025-01-01T00:00:00Z", sourceTxHash: "x" })];
    const { disposals } = matchDisposal(oldLot, {
      asset: "ETH",
      amount: 1,
      proceedsUsd: 3000,
      disposedAt: "2026-01-02T00:00:00Z", // 366 days later
      method: "FIFO",
    });
    expect(disposals[0]!.term).toBe("LONG");
  });
});

describe("summarizeDisposals", () => {
  it("splits gains by term correctly", () => {
    const disposals = matchDisposal(lots(), {
      asset: "OKB",
      amount: 30,
      proceedsUsd: 30 * 60,
      disposedAt: "2026-01-01T00:00:00Z",
      method: "FIFO",
    }).disposals;
    const summary = summarizeDisposals(disposals);
    // proceeds 30*60=1800; cost basis 10@20 + 10@40 + 10@30 = 900; gain = 900
    expect(summary.realizedGainUsd).toBeCloseTo(900, 5);
  });
});
