/**
 * Marca provisória do ATLΛZ OS: um ponto central (Atlas) sustentando um arco orbital
 * (o globo). Usada até que os arquivos reais de logo da Atlaz Company (Fase 3 —
 * Brand Kit, ver docs/roadmap.md) sejam carregados em public/brand/.
 *
 * Não é o logotipo oficial "Atlas segurando o mundo em dissolução" da publicação de
 * referência — é um placeholder geométrico com a mesma linguagem (linha fina, órbita,
 * monocromia) para não deixar o produto sem marca enquanto o asset real não chega.
 */
export function AtlasMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role="img"
      aria-label="ATLΛZ"
    >
      <circle cx="20" cy="20" r="18.5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <ellipse
        cx="20"
        cy="20"
        rx="18.5"
        ry="7"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <circle cx="20" cy="20" r="3.5" fill="currentColor" />
    </svg>
  );
}
