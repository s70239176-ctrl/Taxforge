import { Panel } from "@/components/ui/card";
import { StatStrip } from "@/components/control-room/stat-strip";
import { LedgerTape } from "@/components/control-room/ledger-tape";
import { ChainStatus } from "@/components/control-room/chain-status";
import { AgentCallFeed } from "@/components/control-room/agent-call-feed";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-eyebrow mb-1">Control room</div>
          <h1 className="font-display text-xl font-medium text-ink">Portfolio Overview</h1>
        </div>
        <div className="hidden text-right text-2xs font-mono text-ink-faint sm:block">
          Wallet 0xe865…22bc2 · US · FIFO default
        </div>
      </div>

      <Panel>
        <StatStrip />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <LedgerTape />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel>
            <ChainStatus />
          </Panel>
          <Panel>
            <AgentCallFeed />
          </Panel>
        </div>
      </div>
    </div>
  );
}
