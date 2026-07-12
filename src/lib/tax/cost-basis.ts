import type { CostBasisMethod, RealizedDisposal, TaxLot } from "./types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const LONG_TERM_THRESHOLD_DAYS = 365; // US rule; used as the generic default

/**
 * Orders open lots for disposal according to the chosen cost-basis method.
 * Mutates nothing — returns a new sorted array.
 */
function orderLots(lots: TaxLot[], method: CostBasisMethod): TaxLot[] {
  const open = lots.filter((l) => l.remaining > 1e-12);
  switch (method) {
    case "FIFO":
      return [...open].sort(
        (a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime()
      );
    case "LIFO":
      return [...open].sort(
        (a, b) => new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime()
      );
    case "HIFO":
      return [...open].sort((a, b) => b.costBasisUsdPerUnit - a.costBasisUsdPerUnit);
  }
}

function holdingPeriodDays(acquiredAt: string, disposedAt: string): number {
  return Math.max(
    0,
    Math.round((new Date(disposedAt).getTime() - new Date(acquiredAt).getTime()) / MS_PER_DAY)
  );
}

/**
 * Matches a disposal (sale/swap-out) against open lots for the given asset,
 * consuming lots in the order the method dictates. Returns the per-lot
 * realized disposals and mutates `lots` in place to reflect consumption
 * (callers should pass a clone if they need the pre-disposal state after).
 */
export function matchDisposal(
  lots: TaxLot[],
  params: {
    asset: string;
    amount: number;
    proceedsUsd: number; // total USD value received for `amount`
    disposedAt: string;
    method: CostBasisMethod;
  }
): { disposals: RealizedDisposal[]; shortfallAmount: number } {
  const { asset, amount, proceedsUsd, disposedAt, method } = params;
  const proceedsPerUnit = amount > 0 ? proceedsUsd / amount : 0;

  const ordered = orderLots(
    lots.filter((l) => l.asset === asset),
    method
  );

  let remainingToMatch = amount;
  const disposals: RealizedDisposal[] = [];

  for (const lot of ordered) {
    if (remainingToMatch <= 1e-12) break;
    const used = Math.min(lot.remaining, remainingToMatch);
    if (used <= 0) continue;

    const costBasisUsd = used * lot.costBasisUsdPerUnit;
    const proceeds = used * proceedsPerUnit;
    const days = holdingPeriodDays(lot.acquiredAt, disposedAt);

    disposals.push({
      lotId: lot.lotId,
      amountUsed: used,
      costBasisUsd,
      proceedsUsd: proceeds,
      gainUsd: proceeds - costBasisUsd,
      holdingPeriodDays: days,
      term: days >= LONG_TERM_THRESHOLD_DAYS ? "LONG" : "SHORT",
    });

    lot.remaining -= used;
    remainingToMatch -= used;
  }

  return { disposals, shortfallAmount: Math.max(0, remainingToMatch) };
}

/** Adds a new open lot from an acquisition event (buy, swap-in, yield receipt, airdrop). */
export function openLot(params: {
  asset: string;
  amount: number;
  costBasisUsdPerUnit: number;
  acquiredAt: string;
  sourceTxHash: string;
}): TaxLot {
  return {
    lotId: `${params.sourceTxHash}:${params.asset}:${params.acquiredAt}`,
    remaining: params.amount,
    ...params,
  };
}

export function summarizeDisposals(disposals: RealizedDisposal[]) {
  const realizedGainUsd = disposals.reduce((s, d) => s + d.gainUsd, 0);
  const shortTermGainUsd = disposals
    .filter((d) => d.term === "SHORT")
    .reduce((s, d) => s + d.gainUsd, 0);
  const longTermGainUsd = disposals
    .filter((d) => d.term === "LONG")
    .reduce((s, d) => s + d.gainUsd, 0);
  return { realizedGainUsd, shortTermGainUsd, longTermGainUsd };
}
