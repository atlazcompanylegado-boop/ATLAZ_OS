"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AtlasMark } from "@/components/brand/atlas-mark";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileOpenChange,
  permissions,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  permissions?: readonly string[];
}) {
  return (
    <>
      {/*
        Responsividade (ver docs/design-system.md §"Sidebar responsiva"):
        <768px (md)   → oculta, navegação vive no drawer (MobileNav).
        768–1023px    → nasce compacta (72px) — é o único intervalo realmente apertado.
        ≥1024px (lg)  → nasce expandida (264px): cobre notebooks/desktops comuns
                        (1280/1366/1440/1536/1920px) sem forçar modo compacto.
        O toggle manual (`collapsed`) sempre sobrepõe o automático, em qualquer largura.
      */}
      <aside
        className={cn(
          "surface-elevation-1 relative z-10 hidden h-screen shrink-0 flex-col border-r border-[var(--glass-border)] transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-[72px] lg:w-[264px]",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-[var(--glass-border)] px-4">
          <AtlasMark size={22} className="shrink-0 text-ink-1" />
          <span
            className={cn(
              "font-display text-[16px] font-medium tracking-wide text-ink-1",
              collapsed ? "hidden" : "hidden lg:inline",
            )}
          >
            ATLΛZ OS
          </span>
        </div>

        <SidebarNav labelMode={collapsed ? "hidden" : "responsive"} permissions={permissions} />

        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          className="flex h-11 items-center justify-center gap-2 border-t border-[var(--glass-border)] text-ink-3 transition-colors duration-200 hover:text-ink-1"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronsLeft className="h-4 w-4" strokeWidth={1.5} />}
        </button>
      </aside>

      <MobileNav open={mobileOpen} onOpenChange={onMobileOpenChange} permissions={permissions} />
    </>
  );
}
