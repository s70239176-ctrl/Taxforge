/**
 * Reference client — this is what a THIRD-PARTY autonomous trading agent
 * would run before executing a swap, to ask TaxForge "what does this cost
 * me in tax". Ships in this repo as documentation-by-example for hackathon
 * judges and integrating teams; not imported by the TaxForge app itself.
 *
 * Flow:
 *   1. POST without payment -> 402 + payment requirements
 *   2. Agent's wallet SDK constructs an X-PAYMENT proof for the exact terms
 *   3. Retry with X-PAYMENT header -> 200 + structured tax delta JSON
 */

interface TaxForgeCallArgs {
  baseUrl: string; // e.g. https://taxforge.example.com
  assetIn: string;
  amountIn: number;
  assetOut: string;
  expectedAmountOut: number;
  priceUsdIn: number;
  walletAddress: string;
  jurisdiction?: "US" | "DE" | "FR" | "EU_GENERIC";
  method?: "FIFO" | "LIFO" | "HIFO";
  /** Supplied by the calling agent's own payment/wallet SDK — opaque to TaxForge. */
  createPaymentProof: (requirements: unknown) => Promise<string>;
}

export async function callTaxForgeBeforeTrade(args: TaxForgeCallArgs) {
  const endpoint = `${args.baseUrl}/api/a2mcp/simulate`;
  const body = JSON.stringify({
    chain: "x-layer",
    assetIn: args.assetIn,
    amountIn: args.amountIn,
    assetOut: args.assetOut,
    expectedAmountOut: args.expectedAmountOut,
    priceUsdIn: args.priceUsdIn,
    walletAddress: args.walletAddress,
    jurisdiction: args.jurisdiction ?? "US",
    method: args.method ?? "FIFO",
  });

  // 1. First attempt — expect 402.
  const first = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (first.status !== 402) {
    // Some deployments may allow a free tier / already-paid session.
    return first.json();
  }
  const requirements = await first.json();

  // 2. Build payment proof for the exact terms TaxForge asked for.
  const paymentProof = await args.createPaymentProof(requirements);

  // 3. Retry with proof attached.
  const second = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": paymentProof,
      "X-Agent-Id": "example-trading-agent.eth",
    },
    body,
  });

  if (!second.ok) {
    throw new Error(`TaxForge call failed after payment: ${second.status} ${await second.text()}`);
  }

  return second.json();
}

/**
 * Example decision loop an autonomous trading agent might run:
 *
 *   const { impact, recommendation, netProceedsAfterTaxUsd } =
 *     await callTaxForgeBeforeTrade({ ...tradeParams, createPaymentProof });
 *
 *   if (impact.effectiveRatePct > riskTolerancePct) {
 *     // hold, or re-route through a lower-tax lot / method
 *   } else {
 *     await executeSwapOnXLayer(tradeParams);
 *   }
 */
