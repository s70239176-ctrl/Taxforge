import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0A0B0D",
        panel: "#12141A",
        "panel-raised": "#16181F",
        line: "#22262F",
        "line-soft": "#1A1D24",
        ink: "#E7E9EC",
        "ink-muted": "#7C8493",
        "ink-faint": "#4B5160",
        gain: "#1FAE6E",
        "gain-dim": "#123D2B",
        loss: "#C4433D",
        "loss-dim": "#3D1817",
        pending: "#B8912F",
        "pending-dim": "#332708",
        signal: "#4A6FA5",
        "signal-dim": "#16233A",
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
