import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-ink text-void hover:bg-ink/85",
        outline: "border border-line text-ink hover:border-ink-faint hover:bg-panel-raised",
        ghost: "text-ink-muted hover:text-ink hover:bg-panel-raised",
        signal: "bg-signal text-white hover:bg-signal/85",
        danger: "border border-loss/40 text-loss hover:bg-loss-dim",
      },
      size: {
        sm: "h-7 px-2.5 text-2xs",
        md: "h-9 px-3.5",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
