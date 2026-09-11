import type { Config } from "tailwindcss";

// Os valores reais das cores/tipografia vivem como CSS variables em src/app/globals.css
// (ver src/design-system/tokens.ts para a versão TS dos mesmos tokens). Este arquivo só
// conecta o Tailwind a essas variáveis — nenhuma cor é definida diretamente aqui.
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      colors: {
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        ink: {
          1: "var(--ink-1)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          muted: "var(--accent-muted)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        role: {
          bg: "var(--role-bg)",
          border: "var(--role-border)",
          ink: "var(--role-ink)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--glow-accent)",
        "glow-focus": "var(--glow-accent-focus)",
      },
      backgroundImage: {
        "gradient-accent": "var(--gradient-accent)",
      },
      backdropBlur: {
        glass: "var(--glass-blur)",
      },
      transitionDuration: {
        DEFAULT: "160ms",
      },
      maxWidth: {
        content: "1440px",
      },
    },
  },
  plugins: [],
};

export default config;
