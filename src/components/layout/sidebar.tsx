"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAVIGATION } from "@/config/navigation";
import { AtlasMark } from "@/components/brand/atlas-mark";
import { Badge } from "@/components/ui/badge";

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-border bg-surface-1 transition-[width] duration-150",
        collapsed ? "w-[72px]" : "w-[264px]",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <AtlasMark size={22} className="shrink-0 text-ink-1" />
        {!collapsed && <span className="font-display text-[15px] tracking-wide text-ink-1">ATLΛZ OS</span>}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAVIGATION.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed && (
              <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors duration-150",
                        active ? "text-ink-1" : "text-ink-2 hover:bg-surface-2 hover:text-ink-1",
                      )}
                    >
                      {active && (
                        <span className="absolute -left-3 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-accent" />
                      )}
                      <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.status === "planned" && (
                        <Badge variant="neutral" className="shrink-0 !px-1.5 !text-[9px]">
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

      <button
        onClick={onToggle}
        className="flex h-11 items-center justify-center gap-2 border-t border-border text-ink-3 transition-colors hover:text-ink-1"
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronsLeft className="h-4 w-4" strokeWidth={1.5} />}
      </button>
    </aside>
  );
}
