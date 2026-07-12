# Deployment

TaxForge is a standard Next.js 15 app with a filesystem-backed demo store, so it deploys cleanly
to Vercel with zero extra infra. For a longer-lived / multi-instance deployment, swap the storage
driver and rate limiter as noted below.

## Option A — Vercel (fastest path for the hackathon)

```bash
npm i -g vercel
vercel login
vercel                 # first deploy, follow prompts
vercel env add ANTHROPIC_API_KEY          # optional — omit to run on the heuristic classifier
vercel env add X402_RECEIVING_ADDRESS
vercel env add X402_NETWORK
vercel env add XLAYER_RPC_URL
vercel --prod
```

Notes:
- The demo storage driver (`DB_DRIVER=jsonfile`) writes to `data/*.json` on disk. **Vercel's
  filesystem is ephemeral per-invocation outside of `/tmp`**, so data won't persist across
  deployments/cold starts in production. Fine for demo/judging; for anything longer-lived, switch
  `DB_DRIVER=supabase` and implement the `SupabaseStore` class stubbed in `src/lib/db/index.ts`.
- The in-memory rate limiter (`src/lib/rate-limit.ts`) is per-instance. Vercel can spin up multiple
  serverless instances, so the limit is *approximate* under load — swap in Upstash Redis
  (`@upstash/ratelimit`) for a real shared limit before production traffic.
- `pdfkit`/`fontkit` are marked as `serverExternalPackages` in `next.config.mjs` — required for PDF
  generation to work under Vercel's serverless bundling. Don't remove that config.

## Option B — Railway (if you want a persistent filesystem / long-running process)

```bash
railway login
railway init
railway up
```

Set the same environment variables as above via `railway variables set KEY=value` or the
dashboard. Railway gives you a persistent container filesystem, so the JSON-file store actually
persists across requests here without needing Supabase — a good middle ground for a hackathon
deployment that needs to survive a few days of demoing.

## Option C — Vercel (frontend + API) + Railway (nothing else needed)

Given everything — including the A2MCP endpoint — is just Next.js API routes, there's no separate
backend service to split out. Option A or B alone is sufficient; don't over-engineer a
two-deployment setup unless you specifically want the persistent filesystem of Railway with the
edge network of Vercel in front of it.

## Post-deploy checklist

1. `curl https://<your-domain>/api/health` returns `{ "status": "ok", ... }`.
2. `npm run seed` locally once, or hit `GET /api/classify?wallet=<address>` against the deployed
   URL, so the demo wallet has classified data before you record or demo.
3. Confirm the 402 flow: `curl -X POST https://<your-domain>/api/a2mcp/simulate ...` (see
   `docs/demo-script.md` or the in-app `/docs` page for the exact payload) returns `402` without a
   payment header and `200` with one.
4. Update `X402_RECEIVING_ADDRESS` to your real treasury address on X Layer before registering as
   an ASP — see `docs/onchain-os-registration.md`.
