import { Panel } from "@/components/ui/card";
import { TransactionTable } from "@/components/transactions/transaction-table";

export default function TransactionsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label-eyebrow mb-1">Multi-chain ingestion</div>
        <h1 className="font-display text-xl font-medium text-ink">Transaction Feed</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Every transaction is classified into TaxForge's taxable-event taxonomy the moment it's ingested — DeFi
          yield, airdrops, agent-to-agent payments, and MEV proceeds get treated differently from a simple transfer.
        </p>
      </div>
      <Panel>
        <TransactionTable />
      </Panel>
    </div>
  );
}
