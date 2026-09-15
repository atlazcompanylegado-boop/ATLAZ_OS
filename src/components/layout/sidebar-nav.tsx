"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getVisibleNavigation } from "@/config/navigation";
import { Badge } from "@/components/ui/badge";

export type SidebarLabelMode = "responsive" | "hidden" | "visible";

/**
 * Conteúdo de navegação da sidebar — extraído para ser reaproveitado tanto no
 * <aside> fixo do desktop quanto no drawer mobile (mobile-nav.tsx), sem duplicar
 * a lógica de item ativo/grupos.
 *
 * labelMode controla a visibilidade de rótulos/badges (não usa JS/matchMedia —
 * só classes responsivas do Tailwind, ver docs/design-system.md):
 *  - "responsive": oculto abaixo de `lg` (o <aside> já está compacto nesse intervalo
 *    por CSS), visível a partir de `lg` — usado no <aside> desktop quando não
 *    colapsado manualmente.
 *  - "hidden": sempre oculto — <aside> colapsado manualmente pelo usuário.
 *  - "visible": sempre visível, ignora breakpoint — drawer mobile (largura fixa).
 */
export function SidebarNav({
  labelMode = "responsive",
  onNavigate,
  permissions,
}: {
  labelMode?: SidebarLabelMode;
  onNavigate?: () => void;
  permissions?: readonly string[];
}) {
  const pathname = usePathname();
  const navigation = getVisibleNavigation(permissions);

  const labelClass =
    labelMode === "hidden" ? "hidden" : labelMode === "visible" ? "inline" : "hidden lg:inline";
  const blockLabelClass =
    labelMode === "hidden" ? "hidden" : labelMode === "visible" ? "block" : "hidden lg:block";
  const badgeClass =
    labelMode === "hidden" ? "hidden" : labelMode === "visible" ? "inline-flex" : "hidden lg:inline-flex";

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {navigation.map((group) => (
        <div key={group.label} className="mb-5">
          <p className={cn("mb-2 px-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3/80", blockLabelClass)}>
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={labelMode !== "visible" ? item.label : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-all duration-200",
                      active
                        ? "border border-accent/20 bg-accent-muted text-ink-1 shadow-glow"
                        : "border border-transparent text-ink-2 hover:bg-surface-2/70 hover:text-ink-1",
                    )}
                  >
                    {active && (
                      <span className="absolute -left-3 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full bg-accent" />
                    )}
                    <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
                    <span className={cn("flex-1 truncate", labelClass)}>{item.label}</span>
                    {item.status === "planned" && (
                      <Badge variant="tag" className={cn("shrink-0", badgeClass)}>
                        {item.phase}
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
