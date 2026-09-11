/** Arcos orbitais finos — divisor gráfico para telas especiais (login, IA, headers). */
export function OrbitLines({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <ellipse cx="200" cy="200" rx="190" ry="70" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
      <ellipse
        cx="200"
        cy="200"
        rx="190"
        ry="70"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
        transform="rotate(60 200 200)"
      />
      <ellipse
        cx="200"
        cy="200"
        rx="190"
        ry="70"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1"
        transform="rotate(120 200 200)"
      />
    </svg>
  );
}
