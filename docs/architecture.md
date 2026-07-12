# Architecture Deep-Dive

## The taxable-event taxonomy

Most crypto tax tools only really model "buy" and "sell." TaxForge's classifier
(`src/lib/tax/types.ts` → `TransactionCategory`) is built around what *agents* actually generate:

| Category | Example | Tax treatment |
|---|---|---|
| `TRANSFER` | wallet-to-wallet, same owner | non-taxable |
| `SWAP` | DEX trade | capital gain/loss |
| `DEFI_YIELD` | LP rewards, lending interest | ordinary income at receipt, new cost basis |
| `STAKING_REWARD` | validator/staking payout | ordinary income at receipt |
| `AIRDROP` | unsolicited token claim | ordinary income at FMV on receipt |
| `AGENT_PAYMENT` | one agent pays another for data/compute/service | business income (receiver) / expense + disposal (payer) |
| `MEV` | arbitrage/sandwich/backrun proceeds | business income (systematic trading activity) |
| `NFT_TRADE`, `BRIDGE`, `GAS_REFUND` | — | capital gain / non-taxable / non-taxable |

`src/lib/tax/rules-engine.ts` maps each category to an `IncomeType`, independent of jurisdiction,
then `JURISDICTION_RATES` applies jurisdiction-specific rates on top (US short/long-term split,
Germany's one-year private-sale exemption, France's flat PFU rate, and an EU-generic fallback).

## Cost-basis engine

`src/lib/tax/cost-basis.ts` implements lot-based FIFO/LIFO/HIFO matching:
- `openLot()` creates a lot on every acquisition (buy, swap-in, yield receipt, airdrop).
- `matchDisposal()` orders open lots per the chosen method and consumes them against a disposal
  amount, splitting across multiple lots if needed and computing short/long-term holding period
  per disposed slice (365-day US-style threshold, used as the general default).

This is method-agnostic and jurisdiction-agnostic by design — `rules-engine.ts` is the only place
jurisdiction-specific rates live, so adding a new country is a matter of adding one entry to
`JURISDICTION_RATES` plus any category-level treatment overrides, not touching the matching logic.

## Agent orchestration (LangGraph)

`src/lib/agent/orchestrator.ts` expresses the batch pipeline as a `StateGraph`:

```
ingest → classify → computeImpact → decide → END
```

Each node is a pure function over shared state (`Annotation.Root`). This is deliberately
over-engineered relative to what four sequential function calls would need — the point is that the
pipeline is now a graph other nodes can be inserted into (a jurisdiction-selection node, a
multi-agent-consensus node reconciling two ASPs' classifications, a human-in-the-loop review node)
without touching the existing nodes. `simulateSingleTrade()` is a deliberate fast-path used by the
UI and the A2MCP endpoint for the single-hypothetical-trade case, which doesn't need graph
traversal overhead.

## x402 payment gate

`src/lib/x402/middleware.ts` implements the machine-readable 402 flow: `requirePayment()` checks
for an `X-PAYMENT` header, and if absent, returns an `X402Requirements` body (scheme/network/
asset/payTo/maxAmountRequired/resource) with HTTP 402. If present, it calls the OKX payment adapter
to verify against the exact terms it just quoted. This is the same shape as the public x402
scheme, so any x402-aware agent wallet/SDK — not just TaxForge's own reference client — can
integrate without TaxForge-specific glue.

## What's mocked and why

`src/lib/chain/xlayer.ts` defines `OkxPaymentAdapter` as an interface with three methods
(`verifyPayment`, `anchorHash`, `getAspReputation`) and ships `mockOkxPaymentAdapter` as the
default implementation. This repo does not vendor OKX's private Payment SDK package, so rather
than fabricate an API surface that might not match the real SDK, the mock is deterministic
(seeded off input, not random) so demo runs look consistent, and every call site in the app only
depends on the interface — swapping to the real SDK at hackathon/production time means rewriting
the body of those three functions and nothing else.
