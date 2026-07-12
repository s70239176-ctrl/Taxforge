# TaxForge — 60-Second Demo Script

Goal: show the full loop — **agent asks before it acts → gets a real tax answer → acts → the
report reconciles what actually happened** — without narrating architecture. Judges should feel
"this is a real product with a real wedge," not "this is a hackathon tech demo."

Suggested screen recording flow, timestamped:

---

**0:00–0:08 — Cold open on the Dashboard.**
Land directly on the control room — no marketing slide. The ledger tape is already streaming
transactions in (let 4–5 rows animate in). Voiceover:
> "TaxForge is the tax engine for agents that trade, get paid, and get paid *by other agents* —
> continuously, across chains. This is one wallet's real activity feed, auto-classified as it lands."

**0:08–0:18 — Point at three rows in the tape as they scroll:** an `AGENT_PAYMENT`, a `DEFI_YIELD`,
an `MEV` tag. Voiceover:
> "A payment between two agents. A DeFi yield distribution at 3am. MEV proceeds from a searcher
> module. None of these fit a normal tax app's buy/sell model — TaxForge has a category for all
> of them."

**0:18–0:30 — Cut to the Simulate page.** Fill in a hypothetical OKB → USDC swap. Hit "Simulate."
Let the tax-impact panel populate live (realized gain, effective rate, FIFO/LIFO/HIFO comparison).
Voiceover:
> "Before an agent executes anything, it can ask: what does this cost me in tax? Here — FIFO
> costs $2,803. Switching to HIFO on this lot saves real money. That's the exact call an
> autonomous trading agent makes over our A2MCP endpoint before it trades."

**0:30–0:40 — Cut to API Docs page, scroll to the curl example.** Show the 402 → pay → 200 flow
already visible on screen (don't retype it live). Voiceover:
> "No API key, no onboarding. An agent calls us, gets a 402 with the price, pays two cents in
> USDC over x402 on X Layer, and gets structured JSON back. That's the whole integration."

**0:40–0:52 — Cut to Reports page.** Click "Generate report" with "Anchor on X Layer" checked.
Show the new report appear with status flipping to `ANCHORED`, attestation hash and anchor tx
hash visible. Click PDF, show the export open. Voiceover:
> "At period end, TaxForge produces a report with a SHA-256 hash of the exact transaction set —
> anchored on X Layer. Your accountant, or a counterparty agent, can verify it wasn't altered
> after the fact without ever seeing your raw wallet data."

**0:52–1:00 — Back to Dashboard, hold on the "Agents Calling TaxForge" panel** (the A2MCP call
feed) as it lists several agents paying per call. Voiceover, closing line:
> "Every call, every anchor, is a public reputation signal — TaxForge builds its own on-chain
> track record the same way any agent in this economy does. This is compliance infrastructure
> built for agents, by design, not bolted on after."

---

### B-roll / cutaway options if you have extra seconds
- Transactions page with category filter chips being clicked (SWAP → DEFI_YIELD → AGENT_PAYMENT)
  to show the taxonomy breadth in one screen.
- The chain-status panel (X Layer / Ethereum / Arbitrum / Base block heights ticking).

### What to avoid on camera
- Don't explain LangGraph, Zod, or file structure — judges are evaluating product and business
  potential, not implementation trivia.
- Don't linger on empty states — pre-warm the demo wallet (`npm run seed` then hit `/api/classify`
  once) before recording so the ledger tape has data immediately.
