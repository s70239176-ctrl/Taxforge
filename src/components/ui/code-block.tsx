import { cn } from "@/lib/utils";

export function CodeBlock({ children, label, className }: { children: string; label?: string; className?: string }) {
  return (
    <div className={cn("hairline overflow-hidden rounded bg-panel-raised", className)}>
      {label && (
        <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 font-mono text-2xs text-ink-faint">
          <span className="h-2 w-2 rounded-full bg-line" />
          {label}
        </div>
      )}
      <pre className="overflow-x-auto p-3 text-2xs leading-relaxed">
        <code className="font-mono text-ink-muted">{children}</code>
      </pre>
    </div>
  );
}
