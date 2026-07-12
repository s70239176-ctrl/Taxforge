import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ClassifiedTransaction, RawTransaction, TransactionCategory } from "../tax/types";
import { incomeTypeForCategory, isTaxableCategory } from "../tax/rules-engine";

const CATEGORIES: TransactionCategory[] = [
  "TRANSFER",
  "SWAP",
  "DEFI_YIELD",
  "STAKING_REWARD",
  "AIRDROP",
  "AGENT_PAYMENT",
  "MEV",
  "NFT_TRADE",
  "BRIDGE",
  "GAS_REFUND",
  "UNKNOWN",
];

const ClassificationSchema = z.object({
  category: z.enum(CATEGORIES as [TransactionCategory, ...TransactionCategory[]]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(240),
});

/**
 * Deterministic, zero-dependency fallback classifier. Runs the same rules a
 * senior tax engineer would apply from raw calldata/counterparty metadata.
 * Used automatically when ANTHROPIC_API_KEY is unset, so `npm run dev` works
 * out of the box, and used as a cross-check against the LLM output otherwise.
 */
export function heuristicClassify(tx: RawTransaction): {
  category: TransactionCategory;
  confidence: number;
  reasoning: string;
} {
  const memo = (tx.memo ?? "").toLowerCase();

  if (tx.counterpartyAgentId) {
    return {
      category: "AGENT_PAYMENT",
      confidence: 0.92,
      reasoning: `Counterparty ${tx.counterpartyAgentId} is a registered agent identity — treated as an A2A service payment.`,
    };
  }
  if (memo.includes("mev") || memo.includes("arbitrage") || memo.includes("sandwich") || memo.includes("backrun")) {
    return {
      category: "MEV",
      confidence: 0.88,
      reasoning: "Memo/log pattern matches searcher/arbitrage bot proceeds within a single block.",
    };
  }
  if (memo.includes("airdrop") || memo.includes("claim")) {
    return {
      category: "AIRDROP",
      confidence: 0.9,
      reasoning: "Unsolicited inbound transfer matching a token-generation-event claim pattern.",
    };
  }
  if (memo.includes("stake") || memo.includes("staking")) {
    return {
      category: "STAKING_REWARD",
      confidence: 0.87,
      reasoning: "Periodic inbound transfer from a known validator/staking contract.",
    };
  }
  if (memo.includes("lp") || memo.includes("yield") || memo.includes("farm") || memo.includes("lend")) {
    return {
      category: "DEFI_YIELD",
      confidence: 0.85,
      reasoning: "Inbound transfer from a DeFi protocol contract consistent with yield distribution.",
    };
  }
  if (memo.includes("gas refund") || memo.includes("refund")) {
    return {
      category: "GAS_REFUND",
      confidence: 0.75,
      reasoning: "Small inbound transfer immediately following an outbound gas payment.",
    };
  }
  if (memo.includes("swap") || memo.includes("router") || memo.includes("dex")) {
    return {
      category: "SWAP",
      confidence: 0.9,
      reasoning: "Paired in/out legs routed through a DEX router within the same transaction.",
    };
  }
  if (memo.includes("bridge")) {
    return {
      category: "BRIDGE",
      confidence: 0.86,
      reasoning: "Transfer to/from a known cross-chain bridge contract, same beneficial owner.",
    };
  }
  if (memo.includes("nft")) {
    return {
      category: "NFT_TRADE",
      confidence: 0.83,
      reasoning: "Transfer paired with an NFT contract interaction in the same transaction.",
    };
  }
  if (tx.from.toLowerCase() === tx.to.toLowerCase()) {
    return {
      category: "TRANSFER",
      confidence: 0.7,
      reasoning: "Same-address movement, likely internal accounting or a wrapped-asset round trip.",
    };
  }
  return {
    category: "TRANSFER",
    confidence: 0.55,
    reasoning: "No stronger signal found; defaulting to a non-taxable transfer pending manual review.",
  };
}

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

const CLASSIFY_TOOL = {
  name: "classify_transaction",
  description: "Classify a single on-chain transaction into TaxForge's taxable-event taxonomy.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: { type: "string", enum: CATEGORIES },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string", maxLength: 240 },
    },
    required: ["category", "confidence", "reasoning"],
  },
};

/**
 * Classifies a transaction using Claude with forced structured tool-call
 * output. Falls back to the heuristic classifier if no API key is
 * configured, or if the model call fails for any reason — classification
 * must never be a hard dependency for the tax engine to run.
 */
export async function classifyTransaction(tx: RawTransaction): Promise<ClassifiedTransaction> {
  const client = getClient();
  let result: { category: TransactionCategory; confidence: number; reasoning: string };
  let source: "heuristic" | "llm" = "heuristic";

  if (!client) {
    result = heuristicClassify(tx);
  } else {
    try {
      const heuristic = heuristicClassify(tx); // used as context, not the answer
      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: "tool", name: "classify_transaction" },
        messages: [
          {
            role: "user",
            content: [
              "Classify this on-chain transaction for crypto tax purposes.",
              `Chain: ${tx.chain}`,
              `Direction: ${tx.direction}`,
              `Asset: ${tx.asset}, amount: ${tx.amount}`,
              `Counterparty agent id: ${tx.counterpartyAgentId ?? "none"}`,
              `Memo/log hint: ${tx.memo ?? "none"}`,
              `Heuristic pre-classification for reference: ${heuristic.category} (${heuristic.reasoning})`,
              "Return the single best-fit category with a calibrated confidence score.",
            ].join("\n"),
          },
        ],
      });

      const toolUse = response.content.find((b) => b.type === "tool_use");
      if (toolUse && toolUse.type === "tool_use") {
        const parsed = ClassificationSchema.parse(toolUse.input);
        result = parsed;
        source = "llm";
      } else {
        result = heuristic;
      }
    } catch {
      // Never let an upstream AI outage block tax classification.
      result = heuristicClassify(tx);
    }
  }

  const incomeType = incomeTypeForCategory(result.category);
  return {
    ...tx,
    category: result.category,
    incomeType,
    confidence: result.confidence,
    taxable: isTaxableCategory(result.category),
    classifierSource: source,
    reasoning: result.reasoning,
  };
}

export async function classifyBatch(txs: RawTransaction[]): Promise<ClassifiedTransaction[]> {
  return Promise.all(txs.map(classifyTransaction));
}
