/**
 * Tokens visuais do ATLΛZ OS — espelham 1:1 as CSS variables definidas em
 * src/app/globals.css. Mantidos aqui (não só em CSS) para uso em lugares que
 * precisam do valor em JS/TS: canvas de partículas, gráficos, e-mails
 * transacionais futuros. Alterar um valor implica alterar os dois lugares.
 *
 * Ver docs/design-system.md para a justificativa de cada decisão.
 */

export const color = {
  surface: {
    0: "#0A0A0B",
    1: "#131315",
    2: "#1B1B1E",
    3: "#242427",
  },
  border: {
    default: "#2A2A2E",
    strong: "#38383D",
  },
  ink: {
    1: "#F5F5F4",
    2: "#A8A8AC",
    3: "#6E6E73",
  },
  accent: {
    default: "#8A1522",
    strong: "#A31D2C",
    muted: "rgba(138, 21, 34, 0.14)",
  },
  success: "#2E7D5B",
  warning: "#B8862E",
  danger: "#C23B3B",
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "16px",
} as const;

export const shadow = {
  sm: "0 1px 2px rgba(0, 0, 0, 0.4)",
  md: "0 4px 16px rgba(0, 0, 0, 0.45)",
  lg: "0 12px 40px rgba(0, 0, 0, 0.55)",
} as const;

export const space = [0, 4, 8, 12, 16, 24, 32, 48, 64] as const;

export const motion = {
  duration: "160ms",
  easing: "cubic-bezier(.4, 0, .2, 1)",
} as const;

export const typography = {
  interface: "var(--font-inter)",
  display: "var(--font-fraunces)",
} as const;

export const breakpoint = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;
