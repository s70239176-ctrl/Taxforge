import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs font-mono uppercase tracking-wide whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-line text-ink-muted bg-panel-raised",
        gain: "border-gain/30 text-gain bg-gain-dim",
        loss: "border-loss/30 text-loss bg-loss-dim",
        pending: "border-pending/30 text-pending bg-pending-dim",
        signal: "border-signal/30 text-signal bg-signal-dim",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Maps a TransactionCategory to a badge variant + label, used across the app. */
export const CATEGORY_STYLE: Record<string, { variant: BadgeProps["variant"]; label: string }> = {
  TRANSFER: { variant: "neutral", label: "transfer" },
  SWAP: { variant: "signal", label: "swap" },
  DEFI_YIELD: { variant: "gain", label: "defi yield" },
  STAKING_REWARD: { variant: "gain", label: "staking" },
  AIRDROP: { variant: "gain", label: "airdrop" },
  AGENT_PAYMENT: { variant: "signal", label: "a2a payment" },
  MEV: { variant: "pending", label: "mev" },
  NFT_TRADE: { variant: "signal", label: "nft" },
  BRIDGE: { variant: "neutral", label: "bridge" },
  GAS_REFUND: { variant: "neutral", label: "gas refund" },
  UNKNOWN: { variant: "neutral", label: "unknown" },
};
