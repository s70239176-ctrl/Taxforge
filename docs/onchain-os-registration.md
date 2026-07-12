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
   | `/api/a2mcp/simulate` | POST | 0.02 USDC | Pre-trade tax-impact simulation |
   | `/api/a2mcp/classify` | POST | 0.01 USDC | Single-transaction classification |

   These should match `X402_PRICE_SIMULATE` / `X402_PRICE_CLASSIFY` in your deployed environment —
   Onchain OS's discovery layer surfaces the price to calling agents up front, so keep the console
   and the live `X402Requirements` response in sync.

4. **Payment configuration**
   - Network: `x-layer`
   - Asset: `USDC`
   - `payTo`: your `X402_RECEIVING_ADDRESS`
   - Facilitator: point at the OKX x402 facilitator (`X402_FACILITATOR_URL`) once assigned one at
     registration time.

5. **Health / reputation hook** — point Onchain OS's uptime monitor at `GET /api/health`. This is
   also where TaxForge's own `callsServed` / `disputesRaised` / `uptimePct` counters live, so the
   registry can pull TaxForge's own reputation signal the same way it would for any other ASP.

6. **MCP manifest (if the console asks for one)** — describe the two tools as:
   - `taxforge.simulate_tax_impact(chain, assetIn, amountIn, assetOut, expectedAmountOut, priceUsdIn, walletAddress, jurisdiction, method)`
   - `taxforge.classify_transaction(hash, chain, ..., counterpartyAgentId?, memo?)`

   matching the Zod schemas in `src/app/api/a2mcp/simulate/route.ts` and
   `src/app/api/a2mcp/classify/route.ts` — keep the manifest and the actual `zod` schema in lockstep
   if you change one.

7. **Submit for listing.** Once approved, TaxForge becomes discoverable to any agent browsing the
   Onchain OS ASP directory, and can start accruing the reputation signals shown in the in-app
   `/docs` page.

## Verifying the listing end-to-end

Run the reference client in `src/lib/agent/a2mcp-client-example.ts` (or the curl examples in
`/docs` in-app) against the registered base URL to confirm a cold, unauthenticated agent can
complete the 402 → pay → 200 loop exactly as documented.
