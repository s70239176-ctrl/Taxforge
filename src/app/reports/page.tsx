import { Panel } from "@/components/ui/card";
import { ReportGenerator } from "@/components/reports/report-generator";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label-eyebrow mb-1">Verifiable output</div>
        <h1 className="font-display text-xl font-medium text-ink">Report Generator</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Every report carries a SHA-256 attestation hash over its canonical transaction set. Anchor that hash on X
          Layer and anyone — an accountant, an auditor, a counterparty agent — can verify the report wasn't altered
          after the fact, without seeing your raw wallet data.
        </p>
      </div>
      <Panel>
        <ReportGenerator />
      </Panel>
    </div>
  );
}
