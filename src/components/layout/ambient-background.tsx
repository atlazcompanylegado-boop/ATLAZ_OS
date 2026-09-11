import Image from "next/image";
import atlasFull from "@/components/brand/atlas-login-bg.png";
import { OrbitLines } from "@/components/brand/orbit-lines";

/**
 * Luz ambiente do shell — a identidade dark do app precisa derivar da mesma
 * arte do login (src/components/brand/atlas-login-bg.png), não de
 * gradientes genéricos soltos. Três camadas, todas `pointer-events-none` e
 * estáticas (sem JS, sem canvas):
 *
 *  1. .atlaz-ambient — dois radiais muito discretos (luz ambiente de base).
 *  2. A própria silhueta do Atlas, invertida (a arte é P&B sobre fundo claro;
 *     `invert + mix-blend-mode: screen` faz a figura aparecer como um traço
 *     claro sobre o fundo escuro, e o fundo claro da arte desaparecer no
 *     escuro do app) — ver docs/design-system.md §11. Grande, sangrando no
 *     canto, bem apagada.
 *  3. OrbitLines — os arcos orbitais da mesma arte, para reforçar a leitura.
 *
 * Fica atrás de tudo (z-0); sidebar/topbar (glass translúcido) deixam esse
 * traço vazar sutilmente por trás delas.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="atlaz-ambient absolute inset-0" />
      <div className="absolute -bottom-[22%] -right-[16%] h-[72%] w-[44%] opacity-[0.05] mix-blend-screen [filter:invert(1)_grayscale(1)]">
        <Image src={atlasFull} alt="" fill sizes="44vw" className="object-cover object-left-top" priority={false} />
      </div>
      <OrbitLines className="absolute -bottom-[26%] -right-[12%] h-[62%] w-[62%] text-ink-2 opacity-[0.07]" />
    </div>
  );
}
