"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function Shell({ userLabel, children }: { userLabel: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex h-screen bg-surface-0">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar userLabel={userLabel} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-content px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
