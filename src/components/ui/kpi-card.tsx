import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  className?: string;
}

/**
 * "Atlaz Metric Card" — indicador executivo do dashboard. Nunca renderiza número
 * sem uma fonte real por trás. Hover muito sutil (2px + borda mais clara + glow
 * de accent quase imperceptível) — o vermelho não fica visível em repouso, só na
 * interação (ver docs/design-system.md §2).
 */
export function KpiCard({ label, value, icon: Icon, trend, className }: KpiCardProps) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden p-6 transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-md),var(--glow-accent)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[.02] to-transparent" />
      <div className="relative flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-2">{label}</span>
        {Icon ? (
          <Icon className="h-4 w-4 text-ink-3 transition-colors duration-200 group-hover:text-ink-2" strokeWidth={1.5} />
        ) : null}
      </div>
      <div className="relative mt-3 text-3xl font-semibold tabular-nums text-ink-1">{value}</div>
      {trend ? (
        <div
          className={cn(
            "relative mt-2 text-xs",
            trend.direction === "up" && "text-success",
            trend.direction === "down" && "text-danger",
            trend.direction === "flat" && "text-ink-3",
          )}
        >
          {trend.label}
        </div>
      ) : null}
    </Card>
  );
}
