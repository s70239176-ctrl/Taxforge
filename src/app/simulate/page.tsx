import { Panel } from "@/components/ui/card";
import { SimulatorPanel } from "@/components/simulate/simulator-panel";

export default function SimulatePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label-eyebrow mb-1">Real-time impact</div>
        <h1 className="font-display text-xl font-medium text-ink">Tax Simulation Tool</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Model a hypothetical trade before it happens. This is the exact calculation path an autonomous agent hits
          via the paid A2MCP endpoint — same engine, same numbers.
        </p>
      </div>
      <Panel>
        <SimulatorPanel />
      </Panel>
    </div>
  );
}
