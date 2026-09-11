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

/**
 * Camada de acabamento premium (Fase 1 — refatoração visual). Aditiva: espelha os
 * novos CSS custom properties de src/app/globals.css. Regra dura: glow/accent só
 * em estado de interação (hover/focus/active), nunca decoração permanente.
 */
export const glass = {
  bg: "rgba(19, 19, 21, 0.72)",
  bgStrong: "rgba(27, 27, 30, 0.88)",
  border: "rgba(245, 245, 244, 0.08)",
  blur: "14px",
} as const;

export const glow = {
  accent: "0 0 0 1px rgba(138, 21, 34, 0.32), 0 0 20px rgba(138, 21, 34, 0.14)",
  accentFocus: "0 0 0 3px rgba(138, 21, 34, 0.15)",
} as const;

export const gradient = {
  accent: "linear-gradient(135deg, #8A1522 0%, #A31D2C 100%)",
  ambientA: "radial-gradient(60% 50% at 85% 0%, rgba(138, 21, 34, 0.07), transparent 70%)",
  ambientB: "radial-gradient(50% 40% at 8% 100%, rgba(245, 245, 244, 0.035), transparent 70%)",
} as const;

export const scrollbar = {
  track: "transparent",
  thumb: "rgba(245, 245, 244, 0.14)",
  thumbHover: "rgba(245, 245, 244, 0.24)",
} as const;

/** Badge institucional de papel/cargo (ex.: SUPER ADMIN) — distinto do badge de fase. */
export const role = {
  bg: "rgba(90, 16, 24, 0.16)",
  border: "rgba(163, 29, 44, 0.35)",
  ink: "#C98D90",
} as const;
