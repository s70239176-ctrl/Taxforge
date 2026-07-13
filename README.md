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
2. **The A2MCP endpoint** (paid, x402-gated) — `/api/tax/simulate` (0.15 USDT, batch), `/api/a2mcp/report` (2.50 USDT), `/api/a2mcp/classify` (0.05 USDT)
3. **A2A mode** — TaxForge as a long-lived counterparty agent in a multi-turn negotiation (see `docs/architecture.md` and the A2A section of `/docs` in-app)

Two more endpoints round out the live surface:
- `GET /api/tax/ingest?wallet=...&chains=...` — pulls **real** transaction history from live block
  explorer APIs (Etherscan V2 for Ethereum/Arbitrum/Base, OKLink for X Layer). Falls back to bundled
  sample data with `"source": "sample"` explicitly marked if no API keys are configured — it never
  silently pretends to be live.
- `GET /health` (and `GET /api/health`, identical) — reports `paymentMode` (`"live"` vs `"demo"`)
  and `storageBackend` (`"upstash-redis"` vs `"json-file"`) alongside ASP reputation, so it's
  immediately obvious from the outside whether an instance is actually production-ready or still
  running in demo mode.

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
│   │   ├── health/route.ts          # ★ real, top-level health check
│   │   └── api/
│   │       ├── tax/simulate/        # ★ paid (0.15 USDT), batch, real ingestion-ready
│   │       ├── tax/reports/         # free — list/generate from persisted data
│   │       ├── tax/ingest/          # ★ real multi-chain explorer ingestion
│   │       ├── a2mcp/report/        # ★ paid (2.50 USDT), anchored report generation
│   │       ├── a2mcp/classify/      # ★ paid (0.05 USDT)
│   │       ├── a2mcp/simulate/      # paid, single-hypothetical-trade (legacy path)
│   │       ├── simulate/, classify/, reports/[+ [id]/pdf]  # free, session-based
│   │       └── health/              # ASP reputation/uptime (alias of /health)
│   ├── components/
│   │   ├── control-room/            # ledger tape, chain status, stat strip
│   │   ├── transactions/, simulate/, reports/
│   │   ├── layout/                  # masthead, nav rail, shell, theme toggle
│   │   └── ui/                      # button, badge, card, code-block
│   └── lib/
│       ├── tax/                     # types, cost-basis, rules-engine, calculate-tax.ts
│       ├── ai/classify.ts           # Claude + heuristic classifier
│       ├── agent/orchestrator.ts    # LangGraph pipeline + simulate
│       ├── agent/a2mcp-client-example.ts
│       ├── chain/xlayer.ts          # viem client + OKX payment adapter
│       ├── chain/explorers.ts       # ★ real Etherscan V2 / OKLink ingestion
│       ├── reports/generate.ts      # hashing + PDF rendering
│       ├── x402/middleware.ts       # pay-per-call gate
│       ├── x402/facilitator.ts      # ★ real x402 v2 /verify + /settle client
│       ├── db/index.ts              # ★ JSON file (dev) or Upstash Redis (prod)
│       ├── rate-limit.ts            # ★ in-memory (dev) or Upstash-backed (prod)
│       └── logging.ts               # ★ structured JSON logging for every call
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
classification falls back to a deterministic heuristic engine, storage is a local JSON file, rate
limiting is in-memory, and payments run through a local mock adapter that accepts any non-empty
`X-PAYMENT` header. `GET /health` always tells you which mode is active (`paymentMode`,
`storageBackend`) so this is never ambiguous from the outside.

```bash
npm run test        # vitest — cost-basis + rules-engine unit tests
npm run build        # production build
npm run seed         # regenerate data/sample-transactions.json
```

## Going live on OKX.AI — what you must configure

Demo mode is safe for local dev and judging, but **do not list a callable ASP on OKX.AI while any
of these are unset** — `GET /health` will tell you exactly which ones are still missing:

| Variable | Unlocks | Without it |
|---|---|---|
| `X402_FACILITATOR_URL` | Real payment verification + settlement (`src/lib/x402/facilitator.ts`) | **Payments are not actually checked** — any non-empty header is accepted. This is the one that matters most. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Persistent storage + correct multi-instance rate limiting | Data is written to local disk, which Vercel's serverless filesystem does not reliably persist across requests |
| `ANTHROPIC_API_KEY` | Live Claude classification | Falls back to the deterministic heuristic classifier (still functional, less nuanced on ambiguous transactions) |
| `ETHERSCAN_API_KEY` / `OKLINK_API_KEY` | Real multi-chain ingestion via `/api/tax/ingest` | Endpoint falls back to bundled sample data, explicitly marked `"source": "sample"` in the response |
| `X402_RECEIVING_ADDRESS` | Payments actually reach your treasury | Requirements are quoted with the zero address placeholder |

Get an Upstash database (free tier is enough) at https://console.upstash.com, an Etherscan V2 key
at https://etherscan.io/apis, and an OKLink key at https://www.oklink.com/docs/en — the facilitator
URL comes from OKX during Onchain OS registration (see below).

## Registering TaxForge as an ASP on Onchain OS

See **`docs/onchain-os-registration.md`** for the full walkthrough. Short version:

1. Deploy this app (see `docs/deployment.md`), set the variables in the table above, and confirm
   `GET /health` reports `"paymentMode": "live"` and `"storageBackend": "upstash-redis"`.
2. In the Onchain OS console, register a new ASP with your deployed base URL, the resource paths
   (`/api/tax/simulate`, `/api/a2mcp/report`, `/api/a2mcp/classify`), and your x402 `payTo` address
   on X Layer.
3. Set the price schedule to match `.env.local` (`X402_PRICE_SIMULATE=0.15`,
   `X402_PRICE_REPORT=2.50`, `X402_PRICE_CLASSIFY=0.05`) or update them to match what you register.
4. Onchain OS will begin routing discovery traffic and tracking your reputation counters
   (calls served, disputes, uptime) — surfaced in-app at `/docs` and via `/health`.

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
  file driver for local dev and a real Upstash Redis driver for production; swapping in Supabase or
  Postgres instead is a one-class change (`src/lib/db/index.ts`), and nothing else in the app
  imports `fs` or a Redis client directly.
- **Light by default, dark available.** Both themes share one CSS-variable token system
  (`src/app/globals.css`) so the institutional aesthetic — hairline borders, no gradients, muted
  gain/loss accents — holds in either mode. Toggle lives in the masthead, persisted via
  `localStorage`, with a no-flash inline bootstrap script in `layout.tsx`.

## What's real vs. what still needs your credentials

| Piece | Status |
|---|---|
| Tax engine (cost-basis, rules, classification, simulation, hashing) | **Real**, fully tested (15 passing tests) |
| x402 payment verification (`/verify`, `/settle`) | **Real client** against the open x402 v2 facilitator contract (`src/lib/x402/facilitator.ts`) — activates automatically once `X402_FACILITATOR_URL` is set. Runs in an explicit, logged demo mode otherwise. |
| Persistent storage | **Real** via Upstash Redis REST API once configured (`src/lib/db/index.ts`); local JSON file otherwise — the latter does not reliably persist on Vercel serverless |
| Rate limiting | **Real**, correct across multiple serverless instances via Upstash once configured (`src/lib/rate-limit.ts`); in-memory (single-instance only) otherwise |
| Multi-chain transaction ingestion (`/api/tax/ingest`) | **Real** Etherscan V2 (Ethereum/Arbitrum/Base) + OKLink (X Layer) API clients once keys are set; falls back to sample data with `"source": "sample"` explicitly marked otherwise |
| X Layer RPC client (`viem`) | Real client, real chain config, real public RPC (`rpc.xlayer.tech`) |
| OKX on-chain attestation anchoring | **Adapter interface is real; implementation is a local mock** — see `src/lib/chain/xlayer.ts`. This repo doesn't vendor OKX's private Payment SDK, so `anchorHash`/`getAspReputation` are the swap-in point for the real thing. |
| Structured logging | **Real** — every API call logs a structured JSON line (`src/lib/logging.ts`) |
| PDF/JSON report generation | Real (`pdfkit`) |
| Historical USD pricing for ingested transactions | **Not wired in** — explorer APIs return token amounts, not historical fiat value; `priceUsdAtTx` comes back `0` from `/api/tax/ingest` until you plug in a price feed (CoinGecko historical API, OKX market API, etc.) — see the comment in `src/lib/chain/explorers.ts` |
| Sample transaction data | Fake but structurally realistic — see `data/sample-transactions.json` |

## License

MIT — hackathon submission, use freely.
