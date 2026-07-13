# Registering TaxForge as an Agent Service Provider on Onchain OS

This walks through turning a deployed TaxForge instance into a discoverable, callable ASP.
Console field names below are best-effort based on the publicly described Onchain OS ASP
registration flow at hackathon time — confirm exact field names against the live console, since
that surface is expected to evolve.

## Prerequisites

- TaxForge deployed and publicly reachable (see `docs/deployment.md`).
- `GET /api/health` returns 200.
- A funded X Layer address to receive x402 payments (`X402_RECEIVING_ADDRESS`).
- An Onchain OS / OKX developer account with ASP registration access.

## Steps

1. **Open the ASP registration console** in Onchain OS and start a new ASP entry.

2. **Identity**
   - Name: `TaxForge`
   - Category: `Compliance / Tax`
   - Description: short pitch — "Autonomous crypto tax compliance and reporting for agents. Real-time
     tax-impact simulation before you trade; verifiable, on-chain-anchored reports after."
   - Base URL: your deployed origin, e.g. `https://taxforge.example.com`

3. **Capabilities / resources** — register each A2MCP resource TaxForge exposes:

   | Resource | Method | Price | Description |
   |---|---|---|---|
   | `/api/tax/simulate` | POST | 0.15 USDT | Batch tax-impact simulation — accepts a transaction array, returns tax delta + SHA-256 report hash |
   | `/api/a2mcp/report` | POST | 2.50 USDT | Full report generation, X Layer-anchored |
   | `/api/a2mcp/classify` | POST | 0.05 USDT | Single transaction classification |

   These should match `X402_PRICE_SIMULATE` / `X402_PRICE_REPORT` / `X402_PRICE_CLASSIFY` in your deployed
   environment — Onchain OS's discovery layer surfaces the price to calling agents up front, so keep the console
   and the live `X402Requirements` response in sync. `GET /api/tax/reports` and `GET /health` stay free.

4. **Payment configuration**
   - Network: `x-layer`
   - Asset: `USDT` (or whatever you set `X402_ASSET` to)
   - `payTo`: your `X402_RECEIVING_ADDRESS`
   - Facilitator: Onchain OS assigns a facilitator URL during registration — set it as
     `X402_FACILITATOR_URL` in your deployment and redeploy. **Until this is set, the app runs in
     demo mode and does not actually verify payments** (see `src/lib/x402/facilitator.ts` and the
     `paymentMode` field in `GET /health`) — do not accept live marketplace traffic before this step.

5. **Health / reputation hook** — point Onchain OS's uptime monitor at `GET /health` (or
   `GET /api/health`, identical). This is also where TaxForge's own `callsServed` /
   `disputesRaised` / `uptimePct` counters live, plus `paymentMode` (`"live"` vs `"demo"`) and
   `storageBackend` — check both read `"live"` / `"upstash-redis"` before going live.

6. **MCP manifest (if the console asks for one)** — describe the tools as:
   - `taxforge.simulate_tax(transactions[], walletAddress, jurisdiction, method)` → `/api/tax/simulate`
   - `taxforge.generate_report(walletAddress, periodStart, periodEnd, jurisdiction, method, anchor)` → `/api/a2mcp/report`
   - `taxforge.classify_transaction(hash, chain, ..., counterpartyAgentId?, memo?)` → `/api/a2mcp/classify`

   matching the Zod schemas in each route file — keep the manifest and the actual `zod` schema in
   lockstep if you change one.

7. **Submit for listing.** Once approved, TaxForge becomes discoverable to any agent browsing the
   Onchain OS ASP directory, and can start accruing the reputation signals shown in the in-app
   `/docs` page.

## Verifying the listing end-to-end

Run the reference client in `src/lib/agent/a2mcp-client-example.ts` (or the curl examples in
`/docs` in-app) against the registered base URL to confirm a cold, unauthenticated agent can
complete the 402 → pay → 200 loop exactly as documented.
