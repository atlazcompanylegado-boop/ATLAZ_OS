"use client";

import { AtlasMark } from "@/components/brand/atlas-mark";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Drawer, DrawerContent } from "@/components/ui/drawer";

/** Navegação em drawer para telas abaixo de `md` (768px) — reaproveita SidebarNav. */
export function MobileNav({
  open,
  onOpenChange,
  permissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions?: readonly string[];
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="left" className="max-w-[280px]">
        <div className="flex h-14 items-center gap-2.5 border-b border-[var(--glass-border)] px-4">
          <AtlasMark size={22} className="shrink-0 text-ink-1" />
          <span className="font-display text-[15px] tracking-wide text-ink-1">ATLΛZ OS</span>
        </div>
        <SidebarNav labelMode="visible" onNavigate={() => onOpenChange(false)} permissions={permissions} />
      </DrawerContent>
    </Drawer>
  );
}
