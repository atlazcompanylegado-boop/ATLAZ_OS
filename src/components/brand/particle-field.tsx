/**
 * Campo de partículas — tradução discreta do efeito "Atlas se dissolvendo em
 * partículas" da identidade Atlaz (ver docs/design-system.md §8). Estático (sem
 * animação pesada), opacidade baixa por padrão. Usado em login, splash e headers
 * de Marketing/Atlas Social/Studio/Intelligence — nunca sobre texto denso.
 *
 * Posições geradas por um PRNG com seed fixa (não Math.random()) para o resultado
 * ser idêntico em servidor e cliente e não gerar mismatch de hidratação.
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildParticles(count: number, seed: number) {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    cx: rand() * 100,
    cy: rand() * 100,
    r: 0.4 + rand() * 1.1,
  }));
}

export function ParticleField({
  className,
  count = 60,
  seed = 42,
  opacity = 0.15,
}: {
  className?: string;
  count?: number;
  seed?: number;
  opacity?: number;
}) {
  const particles = buildParticles(count, seed);
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ opacity }}
    >
      {particles.map((p) => (
        <circle key={p.id} cx={p.cx} cy={p.cy} r={p.r} fill="currentColor" />
      ))}
    </svg>
  );
}
