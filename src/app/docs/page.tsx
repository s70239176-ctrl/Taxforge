import { Panel, PanelHeader } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Badge } from "@/components/ui/badge";

const CURL_402 = `curl -X POST https://taxforge.example.com/api/tax/simulate \\
  -H "Content-Type: application/json" \\
  -d '{
    "walletAddress": "0xe865...22bc2",
    "jurisdiction": "US",
    "method": "FIFO",
    "transactions": [
      { "hash": "0xabc...", "chain": "x-layer", "timestamp": "2025-01-01T00:00:00Z",
        "from": "0x1...", "to": "0xe865...22bc2", "asset": "OKB",
        "amount": 500, "direction": "IN", "priceUsdAtTx": 20 },
      { "hash": "0xdef...", "chain": "x-layer", "timestamp": "2026-06-01T00:00:00Z",
        "from": "0xe865...22bc2", "to": "0x2...", "asset": "OKB",
        "amount": 500, "direction": "OUT", "priceUsdAtTx": 58.4 }
    ]
  }'

# --> HTTP/1.1 402 Payment Required
# {
#   "x402Version": 1,
#   "accepts": [{
#     "scheme": "exact",
#     "network": "x-layer",
#     "asset": "0x779ded0c9e1022225f8e0630b35a9b54be713736",
#     "payTo": "0xTAXFORGE_TREASURY...",
#     "maxAmountRequired": "0.15",
#     "resource": "/api/tax/simulate",
#     "description": "TaxForge ASP — pay-per-call agent tax intelligence"
#   }]
# }`;

const CURL_PAID = `curl -X POST https://taxforge.example.com/api/tax/simulate \\
  -H "Content-Type: application/json" \\
  -H "X-PAYMENT: <settled-payment-proof>" \\
  -H "X-Agent-Id: agent-trading-bot-delta.x402" \\
  -d '{ ...same body as above... }'

# --> HTTP/1.1 200 OK
# {
#   "ok": true,
#   "agentId": "agent-trading-bot-delta.x402",
#   "settlementTxHash": "0x9f2c...",
#   "estimatedTax": 19000,
#   "realizedGain": 19000,
#   "reportHash": "1439c936...",
#   "transactionCount": 2,
#   "impact": { "shortTermGainUsd": 0, "longTermGainUsd": 19000, "effectiveRatePct": 15, ... }
# }`;

const SDK_SNIPPET = `import { callTaxForgeBeforeTrade } from "./a2mcp-client-example";

const result = await callTaxForgeBeforeTrade({
  baseUrl: "https://taxforge.example.com",
  assetIn: "OKB", amountIn: 500, assetOut: "USDC",
  expectedAmountOut: 29050, priceUsdIn: 58.4,
  walletAddress: agentWallet.address,
  createPaymentProof: (requirements) => agentWallet.payX402(requirements),
});

if (result.taxDelta.effectiveRatePct > riskTolerancePct) {
  // hold, or switch cost-basis method before executing
} else {
  await executeSwapOnXLayer(tradeParams);
}`;

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label-eyebrow mb-1">Agent-native integration</div>
        <h1 className="font-display text-xl font-medium text-ink">API Documentation</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          TaxForge is built to be called by other agents, not just humans. The A2MCP surface is pay-per-call via
          x402 — no API key onboarding, no subscription. Settle the call, get structured JSON back, instantly.
        </p>
      </div>

      <Panel>
        <PanelHeader eyebrow="Pricing" title="Pay-per-call rates (X Layer, USD₮0)" />
        <div className="grid grid-cols-1 divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <PriceRow endpoint="POST /api/tax/simulate" desc="Batch tax-impact simulation + report hash" price="$0.15" />
          <PriceRow endpoint="POST /api/a2mcp/report" desc="Full report generation, X Layer-anchored" price="$2.50" />
          <PriceRow endpoint="POST /api/a2mcp/classify" desc="Single transaction classification" price="$0.05" />
        </div>
        <div className="border-t border-line px-4 py-2 text-2xs text-ink-faint">
          <code className="text-ink-muted">GET /api/tax/reports</code> and <code className="text-ink-muted">GET /health</code> are free.
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Flow" title="1. Call without payment → 402" />
        <div className="p-4">
          <CodeBlock label="terminal">{CURL_402}</CodeBlock>
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Flow" title="2. Settle payment, retry with X-PAYMENT → 200" />
        <div className="p-4">
          <CodeBlock label="terminal">{CURL_PAID}</CodeBlock>
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Integration" title="Agent-side decision loop" />
        <div className="p-4">
          <CodeBlock label="agent.ts">{SDK_SNIPPET}</CodeBlock>
          <p className="mt-3 text-2xs text-ink-faint">
            Full reference client: <code className="text-ink-muted">src/lib/agent/a2mcp-client-example.ts</code>
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Reference" title="Endpoint map" />
        <div className="divide-y divide-line-soft text-sm">
          <EndpointRow method="POST" path="/api/tax/simulate" note="x402 · $0.15 · batch tax simulation, returns SHA-256 report hash" />
          <EndpointRow method="GET / POST" path="/api/tax/reports" note="free · list / generate reports from persisted data" />
          <EndpointRow method="POST" path="/api/a2mcp/report" note="x402 · $2.50 · full report generation + X Layer anchoring" />
          <EndpointRow method="POST" path="/api/a2mcp/classify" note="x402 · $0.05 · single transaction classification" />
          <EndpointRow method="GET" path="/api/tax/ingest" note="free · pulls real on-chain history via Etherscan V2 / OKLink" />
          <EndpointRow method="GET" path="/health, /api/health" note="free · uptime, payment mode, storage backend, ASP reputation" />
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Modes" title="A2MCP vs A2A" />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <div>
            <Badge variant="signal">A2MCP</Badge>
            <p className="mt-2 text-sm text-ink-muted">
              Stateless, pay-per-call tool invocation. Any MCP-aware agent calls{" "}
              <code className="text-ink">/api/tax/simulate</code> or <code className="text-ink">/api/a2mcp/*</code>{" "}
              directly — this is the primary integration path and what the x402 gate protects.
            </p>
          </div>
          <div>
            <Badge variant="gain">A2A</Badge>
            <p className="mt-2 text-sm text-ink-muted">
              TaxForge can also run as a long-lived counterparty agent in an A2A negotiation — e.g. a DAO treasury
              agent opens a session, streams a batch of actions, and receives a running tax-impact ledger back
              instead of one-shot calls. Session pricing is negotiated up front via the same x402 primitives.
            </p>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Trust" title="On-chain reputation" />
        <div className="p-4 text-sm text-ink-muted">
          <p>
            Every anchored report and every settled A2MCP call is a public, verifiable data point. TaxForge's ASP
            reputation — calls served, dispute rate, uptime — accrues on the Onchain OS registry the same way any
            other agent's does, so integrating agents can evaluate TaxForge before ever calling it, not just after.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Metric label="Calls served" value="18,204" />
            <Metric label="Disputes raised" value="0" />
            <Metric label="Uptime" value="99.97%" />
          </div>
          <p className="mt-3 text-2xs text-ink-faint">
            Live via <code className="text-ink-muted">GET /health</code> — also reports whether payments are
            currently verified against a real facilitator (<code className="text-ink-muted">paymentMode</code>) and
            which storage backend is active.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function PriceRow({ endpoint, desc, price }: { endpoint: string; desc: string; price: string }) {
  return (
    <div className="p-4">
      <div className="font-mono text-xs text-ink">{endpoint}</div>
      <div className="mt-1 text-2xs text-ink-muted">{desc}</div>
      <div className="mt-2 font-display text-lg font-medium text-gain">{price}</div>
    </div>
  );
}

function EndpointRow({ method, path, note }: { method: string; path: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-24 shrink-0 font-mono text-2xs text-signal">{method}</span>
      <span className="w-56 shrink-0 font-mono text-xs text-ink">{path}</span>
      <span className="text-2xs text-ink-faint">{note}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline rounded p-3 text-center">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1 font-display text-lg font-medium text-ink">{value}</div>
    </div>
  );
}
