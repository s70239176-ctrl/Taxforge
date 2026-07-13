import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "rgb(var(--color-void) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        "panel-raised": "rgb(var(--color-panel-raised) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        "line-soft": "rgb(var(--color-line-soft) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--color-ink-muted) / <alpha-value>)",
        "ink-faint": "rgb(var(--color-ink-faint) / <alpha-value>)",
        gain: "rgb(var(--color-gain) / <alpha-value>)",
        "gain-dim": "rgb(var(--color-gain-dim) / <alpha-value>)",
        loss: "rgb(var(--color-loss) / <alpha-value>)",
        "loss-dim": "rgb(var(--color-loss-dim) / <alpha-value>)",
        pending: "rgb(var(--color-pending) / <alpha-value>)",
        "pending-dim": "rgb(var(--color-pending-dim) / <alpha-value>)",
        signal: "rgb(var(--color-signal) / <alpha-value>)",
        "signal-dim": "rgb(var(--color-signal-dim) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      },
      borderRadius: {
        DEFAULT: "2px",
        sm: "1px",
        md: "3px",
      },
      keyframes: {
        "tape-in": {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.15" },
        },
        "confirm-sweep": {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "200% 0%" },
        },
      },
      animation: {
        "tape-in": "tape-in 220ms ease-out",
        blink: "blink 1.4s step-start infinite",
        "confirm-sweep": "confirm-sweep 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
