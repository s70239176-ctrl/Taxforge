# TaxForge

**The autonomous crypto tax compliance and reporting engine for the agent economy.**

Built for the OKX AI Genesis Hackathon. TaxForge is an Agent Service Provider (ASP): a service other
autonomous agents call — via MCP/x402 pay-per-call, or as a long-lived A2A counterparty — to get a
structured tax-impact readout *before* they execute an on-chain action, plus a human dashboard and
verifiable reporting for the people who own those agents.

> Multi-chain ingestion (X Layer, Ethereum, Arbitrum, Base) → AI classification into a taxable-event
> taxonomy that actually covers agent activity (DeFi yield, airdrops, agent-to-agent payments, MEV) →
> FIFO/LIFO/HIFO cost-basis engine → real-time simulation → SHA-256-attested, on-chain-anchored reports.

---

## Why this exists

Every existing crypto tax product assumes a human clicking "buy" and "sell" in an exchange UI. None of
them have a category for "my trading agent just paid another agent 6 cents in USDC for a GPU inference
call" or "my LP position just distributed yield at 3am while I was asleep." Agents transact
continuously, in small amounts, across chains, with other agents — and every one of those events can be
a taxable event somewhere. TaxForge is the compliance layer built for that reality from day one, not
retrofitted onto a consumer tax app.

## Architecture

```
                         ┌─────────────────────────────────────────┐
                         │              Next.js 15 App              │
                         │                                           │
   Human dashboard  ───▶ │  Dashboard · Transactions · Simulate ·   │
   (session, free)       │  Reports · API Docs                      │
                         └───────────────┬───────────────────────────┘
                                         │
                         ┌───────────────▼───────────────────────────┐
                         │            Core Engine (src/lib)           │
                         │                                             │
                         │  ai/classify.ts     — Claude structured     │
                         │                        output + heuristic   │
                         │                        fallback             │
                         │  tax/rules-engine.ts — jurisdiction rules   │
                         │  tax/cost-basis.ts   — FIFO/LIFO/HIFO       │
                         │  agent/orchestrator.ts — LangGraph pipeline │
                         │  reports/generate.ts — hash + PDF           │
                         │  chain/xlayer.ts     — viem + OKX adapter   │
                         │  x402/middleware.ts  — pay-per-call gate    │
                         └───────────────┬───────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
   Autonomous agents  ───▶  /api/a2mcp/*  (x402-gated)      /api/health
   (trading bots,           JSON in, JSON out.              (ASP reputation,
    DAO treasuries,         No account needed —              uptime, calls served)
    other ASPs)             pay, call, get answer.
```

The same tax engine backs three surfaces:
1. **The human dashboard** (free, session-based) — `/api/simulate`, `/api/classify`, `/api/reports`
2. **The A2MCP endpoint** (paid, x402-gated) — `/api/a2mcp/simulate`, `/api/a2mcp/classify`
3. **A2A mode** — TaxForge as a long-lived counterparty agent in a multi-turn negotiation (see `docs/architecture.md` and the A2A section of `/docs` in-app)

## Folder structure

```
taxforge/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Dashboard (control room)
│   │   ├── transactions/page.tsx    # Transaction feed
│   │   ├── simulate/page.tsx        # Simulation tool
│   │   ├── reports/page.tsx         # Report generator
│   │   ├── docs/page.tsx            # API docs
│   │   └── api/
│   │       ├── a2mcp/simulate/      # ★ paid agent endpoint
│   │       ├── a2mcp/classify/      # ★ paid agent endpoint
│   │       ├── simulate/            # free, session-based
│   │       ├── classify/
│   │       ├── reports/[+ [id]/pdf]
│   │       └── health/              # ASP reputation/uptime
│   ├── components/
│   │   ├── control-room/            # ledger tape, chain status, stat strip
│   │   ├── transactions/, simulate/, reports/
│   │   ├── layout/                  # masthead, nav rail, shell
│   │   └── ui/                      # button, badge, card, code-block
│   └── lib/
│       ├── tax/                     # types, cost-basis, rules-engine
│       ├── ai/classify.ts           # Claude + heuristic classifier
│       ├── agent/orchestrator.ts    # LangGraph pipeline + simulate
│       ├── agent/a2mcp-client-example.ts
│       ├── chain/xlayer.ts          # viem client + OKX payment adapter
│       ├── reports/generate.ts      # hashing + PDF rendering
│       ├── x402/middleware.ts       # pay-per-call gate
│       ├── db/index.ts              # swappable storage (JSON → Supabase)
│       └── rate-limit.ts
├── data/sample-transactions.json    # 51 realistic multi-chain agent transactions
├── tests/                           # vitest: cost-basis, rules-engine
├── scripts/seed.ts                  # regenerate sample data
└── docs/                            # demo script, deployment, ASP registration
```

## Setup

### Option 1 — GitHub Codespaces / VS Code Dev Containers (zero manual setup)

This repo ships a `.devcontainer/devcontainer.json`. Open it in a Codespace (or "Reopen in
Container" locally in VS Code) and it will automatically:
- install Node 20 and all dependencies (`npm install`)
- copy `.env.example` → `.env.local` (all values optional — see zero-config note below)
- run `npm run seed` to generate the sample transaction dataset
- forward port 3000 with an auto-opening preview

Then just run:

```bash
npm run dev
```

### Option 2 — Manual setup

Requires Node 20+.

```bash
git clone <this-repo> taxforge && cd taxforge
npm install
cp .env.example .env.local     # all values are optional — the app runs with zero keys configured
npm run dev                     # http://localhost:3000
```

**Zero-config demo mode:** with no `.env.local` at all, TaxForge still works end to end —
classification falls back to a deterministic heuristic engine, chain calls hit a mocked X
Layer/OKX adapter, and storage is a local JSON file. Set `ANTHROPIC_API_KEY` to switch
classification over to live Claude structured-output calls; set the X402/OKX variables once you
have real Onchain OS credentials to switch payment verification and hash anchoring over to the
real facilitator/chain.

```bash
npm run test        # vitest — cost-basis + rules-engine unit tests
npm run build        # production build
npm run seed         # regenerate data/sample-transactions.json
```

## Registering TaxForge as an ASP on Onchain OS

See **`docs/onchain-os-registration.md`** for the full walkthrough. Short version:

1. Deploy this app (see `docs/deployment.md`) and confirm `GET /api/health` responds.
2. In the Onchain OS console, register a new ASP with your deployed base URL, the A2MCP resource
   paths (`/api/a2mcp/simulate`, `/api/a2mcp/classify`), and your x402 `payTo` address on X Layer.
3. Set the price schedule to match `.env.local` (`X402_PRICE_SIMULATE`, `X402_PRICE_CLASSIFY`) or
   update them to match what you register.
4. Onchain OS will begin routing discovery traffic and tracking your reputation counters
   (calls served, disputes, uptime) — surfaced in-app at `/docs` and via `/api/health`.

## Key design decisions

- **Heuristic classifier as a hard fallback, not a demo crutch.** `classifyTransaction` never throws
  if the LLM call fails or no key is set — tax classification is on the critical path for every other
  feature, so it can't have a hosted-API dependency as a single point of failure.
- **x402 gate is middleware, not a wrapper around every route.** `requirePayment()` is one function
  call at the top of a route handler — same pattern the OKX Payment SDK would slot into once you swap
  the mock adapter in `src/lib/chain/xlayer.ts`.
- **Reports hash their own canonical JSON**, not an arbitrary summary — so "verifiable" means the
  exact transaction set and totals in the PDF/JSON export are what got attested, not a claim about it.
- **Storage is an interface, not a database choice.** `TaxForgeStore` ships a zero-dependency JSON
  file driver for the demo; swapping in Supabase is a one-class change (`src/lib/db/index.ts`), and
  nothing else in the app imports `fs` directly.

## What's mocked vs. real

| Piece | Status |
|---|---|
| Tax engine (cost-basis, rules, classification, simulation, hashing) | **Real**, fully tested |
| X Layer RPC client (`viem`) | Real client, real chain config |
| OKX Payment SDK / x402 settlement + anchoring | **Adapter interface is real; implementation is a local mock** — see `src/lib/chain/xlayer.ts`. This repo doesn't vendor OKX's private SDK, so the three methods (`verifyPayment`, `anchorHash`, `getAspReputation`) are the swap-in point for the real thing. |
| PDF/JSON report generation | Real (`pdfkit`) |
| Sample transaction data | Fake but structurally realistic — see `data/sample-transactions.json` |

## License

MIT — hackathon submission, use freely.
