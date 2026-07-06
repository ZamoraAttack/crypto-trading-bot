import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#08080f",
        surface:    "#0e0e1a",
        "surface-2":"#13131f",
        border:     "#1a1a2e",
        accent:     "#6366f1",
        "accent-2": "#22d3ee",
        success:    "#22c55e",
        warning:    "#f59e0b",
        danger:     "#ef4444",
        muted:      "#6b7280",
      },
      boxShadow: {
        "glow-sm":      "0 0 12px rgba(99,102,241,0.12)",
        glow:           "0 0 28px rgba(99,102,241,0.16)",
        "glow-success": "0 0 20px rgba(34,197,94,0.14)",
        "glow-danger":  "0 0 20px rgba(239,68,68,0.14)",
        "glow-warning": "0 0 20px rgba(245,158,11,0.14)",
        card:           "0 4px 24px rgba(0,0,0,0.4)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "fade-in":    "fadeIn 0.3s ease",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
