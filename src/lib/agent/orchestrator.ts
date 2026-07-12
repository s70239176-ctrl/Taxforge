import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import type {
  ClassifiedTransaction,
  CostBasisMethod,
  Jurisdiction,
  RawTransaction,
  SimulationRequest,
  SimulationResult,
  TaxImpact,
} from "../tax/types";
import { classifyBatch, classifyTransaction } from "../ai/classify";
import { matchDisposal, openLot } from "../tax/cost-basis";
import { computeTaxImpact, JURISDICTION_RATES } from "../tax/rules-engine";

/**
 * TaxForge's core pipeline, expressed as a LangGraph state machine so the
 * "agent logic" is inspectable/extensible the same way any other LangGraph
 * agent would be — each node is a pure function over shared state, and the
 * graph can be extended with new nodes (e.g. a jurisdiction-selection node,
 * a multi-agent-consensus node) without touching the others.
 *
 *   ingest -> classify -> computeImpact -> decide -> END
 */

const PipelineState = Annotation.Root({
  rawTransactions: Annotation<RawTransaction[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  classified: Annotation<ClassifiedTransaction[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  jurisdiction: Annotation<Jurisdiction>({
    reducer: (_prev, next) => next,
    default: () => "US",
  }),
  method: Annotation<CostBasisMethod>({
    reducer: (_prev, next) => next,
    default: () => "FIFO",
  }),
  impact: Annotation<TaxImpact | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  recommendation: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

type State = typeof PipelineState.State;

async function ingestNode(state: State): Promise<Partial<State>> {
  // In production this node pulls from the multi-chain ingestion service
  // (see src/lib/chain/xlayer.ts + equivalents). For the graph itself,
  // ingestion is treated as already-resolved input state.
  return { rawTransactions: state.rawTransactions };
}

async function classifyNode(state: State): Promise<Partial<State>> {
  const classified = await classifyBatch(state.rawTransactions);
  return { classified };
}

async function computeImpactNode(state: State): Promise<Partial<State>> {
  const byAsset = new Map<string, ClassifiedTransaction[]>();
  for (const tx of state.classified) {
    const list = byAsset.get(tx.asset) ?? [];
    list.push(tx);
    byAsset.set(tx.asset, list);
  }

  // Aggregate impact across all assets touched in this batch.
  let realizedGainUsd = 0;
  let shortTermGainUsd = 0;
  let longTermGainUsd = 0;
  let ordinaryIncomeUsd = 0;
  const allDisposals: TaxImpact["disposals"] = [];

  for (const [asset, txs] of byAsset) {
    const lots = txs
      .filter((t) => t.direction === "IN" && t.taxable !== false)
      .map((t) =>
        openLot({
          asset,
          amount: t.amount,
          costBasisUsdPerUnit: t.priceUsdAtTx,
          acquiredAt: t.timestamp,
          sourceTxHash: t.hash,
        })
      );

    for (const t of txs) {
      if (t.direction !== "OUT") continue;
      if (t.category === "TRANSFER" || t.category === "BRIDGE" || t.category === "GAS_REFUND") continue;
      const { disposals } = matchDisposal(lots, {
        asset,
        amount: t.amount,
        proceedsUsd: t.amount * t.priceUsdAtTx,
        disposedAt: t.timestamp,
        method: state.method,
      });
      allDisposals.push(...disposals);
    }

    for (const t of txs) {
      if (t.direction === "IN" && t.incomeType === "ORDINARY_INCOME") {
        ordinaryIncomeUsd += t.amount * t.priceUsdAtTx;
      }
      if (t.direction === "IN" && t.incomeType === "BUSINESS_INCOME") {
        ordinaryIncomeUsd += t.amount * t.priceUsdAtTx;
      }
    }
  }

  const impact = computeTaxImpact({
    asset: "PORTFOLIO",
    jurisdiction: state.jurisdiction,
    method: state.method,
    disposals: allDisposals,
    ordinaryIncomeUsd,
  });

  return { impact };
}

async function decideNode(state: State): Promise<Partial<State>> {
  if (!state.impact) return { recommendation: "No impact computed." };
  const { effectiveRatePct, realizedGainUsd, estimatedTaxUsd } = state.impact;

  let recommendation: string;
  if (realizedGainUsd <= 0) {
    recommendation = "Net realized loss/neutral in this batch — no near-term tax liability created.";
  } else if (effectiveRatePct > 25) {
    recommendation = `High effective rate (${effectiveRatePct.toFixed(1)}%) — consider holding remaining lots past the long-term threshold or switching to HIFO before further disposals.`;
  } else {
    recommendation = `Estimated tax of $${estimatedTaxUsd.toFixed(2)} is within normal range for this activity level.`;
  }
  return { recommendation };
}

const graph = new StateGraph(PipelineState)
  .addNode("ingest", ingestNode)
  .addNode("classify", classifyNode)
  .addNode("computeImpact", computeImpactNode)
  .addNode("decide", decideNode)
  .addEdge(START, "ingest")
  .addEdge("ingest", "classify")
  .addEdge("classify", "computeImpact")
  .addEdge("computeImpact", "decide")
  .addEdge("decide", END);

export const taxforgeGraph = graph.compile();

export async function runPortfolioAnalysis(input: {
  rawTransactions: RawTransaction[];
  jurisdiction: Jurisdiction;
  method: CostBasisMethod;
}) {
  return taxforgeGraph.invoke(input);
}

/**
 * Fast-path used by /api/simulate and /api/a2mcp for a *single hypothetical*
 * trade — an autonomous trading agent calling TaxForge before it executes,
 * asking "what does this cost me in tax". Doesn't need the full graph since
 * there's no batch to classify, just one proposed disposal against current
 * mocked/known lots.
 */
export async function simulateSingleTrade(req: SimulationRequest): Promise<SimulationResult> {
  const disposedAt = new Date().toISOString();
  // Demo assumption: a single lot acquired 200 days ago at 70% of current
  // price, representative of typical agent treasury turnover. A production
  // deployment reads the caller's real lots from the store.
  const assumedAcquiredAt = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  const lot = openLot({
    asset: req.assetIn,
    amount: req.amountIn,
    costBasisUsdPerUnit: req.priceUsdIn * 0.7,
    acquiredAt: assumedAcquiredAt,
    sourceTxHash: "sim-lot",
  });

  const computeFor = (method: CostBasisMethod) => {
    const lotClone = { ...lot, remaining: lot.remaining };
    const { disposals } = matchDisposal([lotClone], {
      asset: req.assetIn,
      amount: req.amountIn,
      proceedsUsd: req.amountIn * req.priceUsdIn,
      disposedAt,
      method,
    });
    return computeTaxImpact({
      asset: req.assetIn,
      jurisdiction: req.jurisdiction,
      method,
      disposals,
    });
  };

  const impact = computeFor(req.method);
  const alternativeMethods: SimulationResult["alternativeMethods"] = {};
  (["FIFO", "LIFO", "HIFO"] as CostBasisMethod[]).forEach((m) => {
    alternativeMethods[m] = Math.round(computeFor(m).estimatedTaxUsd * 100) / 100;
  });

  const grossProceedsUsd = req.amountIn * req.priceUsdIn;
  const netProceedsAfterTaxUsd = grossProceedsUsd - impact.estimatedTaxUsd;

  const best = Object.entries(alternativeMethods).sort((a, b) => a[1] - b[1])[0];
  const recommendation =
    best && best[0] !== req.method && best[1] < impact.estimatedTaxUsd - 0.01
      ? `Switching to ${best[0]} for this lot saves an estimated $${(impact.estimatedTaxUsd - best[1]).toFixed(2)} versus ${req.method}.`
      : `${req.method} is already the lowest-tax method available for this disposal among the lots on record.`;

  return {
    request: req,
    impact,
    netProceedsAfterTaxUsd,
    recommendation,
    alternativeMethods,
    generatedAt: disposedAt,
  };
}
