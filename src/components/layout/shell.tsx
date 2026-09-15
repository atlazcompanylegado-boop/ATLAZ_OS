"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AmbientBackground } from "@/components/layout/ambient-background";

export function Shell({
  userLabel,
  permissions,
  children,
}: {
  userLabel: string;
  /** Permissões efetivas da sessão — decide quais itens de navegação aparecem (ver `config/navigation.ts`). */
  permissions?: readonly string[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <div className="relative flex h-screen overflow-hidden bg-surface-0">
      <AmbientBackground />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
        permissions={permissions}
      />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Topbar userLabel={userLabel} onOpenMobileNav={() => setMobileNavOpen(true)} permissions={permissions} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-content px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
