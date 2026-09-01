import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        arcade: {
          bg: "#0a0b14",
          panel: "#12142399",
          panel2: "#161829",
          line: "#2a2d45",
          yes: "#00ffa3",
          yesDim: "#0a5c3e",
          no: "#ff3d6e",
          noDim: "#5c0a26",
          amber: "#ffb703",
          cyan: "#3df2ff",
          violet: "#a78bfa",
          text: "#e8e9f5",
          dim: "#8a8dad",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "monospace"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px -2px rgba(0,255,163,0.35)",
        glowNo: "0 0 20px -2px rgba(255,61,110,0.35)",
        panel: "0 0 0 1px rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.45)",
      },
      keyframes: {
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        pulseGlow: {
          "0%,100%": { boxShadow: "0 0 0px rgba(0,255,163,0)" },
          "50%": { boxShadow: "0 0 24px rgba(0,255,163,0.45)" },
        },
        scan: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 100%" },
        },
        tick: {
          "0%": { transform: "translateY(2px)", opacity: "0.4" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        blink: "blink 1.4s ease-in-out infinite",
        pulseGlow: "pulseGlow 2.2s ease-in-out infinite",
        tick: "tick 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
