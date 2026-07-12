import { cn } from "@/lib/utils";

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("panel rounded", className)}>{children}</div>;
}

export function PanelHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
      <div>
        {eyebrow && <div className="label-eyebrow mb-0.5">{eyebrow}</div>}
        <h3 className="font-display text-sm font-medium text-ink">{title}</h3>
      </div>
      {action}
    </div>
  );
}

export function StatBlock({
  label,
  value,
  delta,
  deltaTone = "neutral",
  mono = true,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "gain" | "loss" | "neutral";
  mono?: boolean;
}) {
  const toneClass = deltaTone === "gain" ? "text-gain" : deltaTone === "loss" ? "text-loss" : "text-ink-muted";
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="label-eyebrow">{label}</span>
      <span className={cn("font-display text-xl font-medium text-ink", mono && "font-tabular")}>{value}</span>
      {delta && <span className={cn("text-2xs font-mono", toneClass)}>{delta}</span>}
    </div>
  );
}
