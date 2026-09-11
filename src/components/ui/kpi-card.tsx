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

/** Indicador executivo do dashboard. Nunca renderiza número sem uma fonte real por trás. */
export function KpiCard({ label, value, icon: Icon, trend, className }: KpiCardProps) {
  return (
    <Card className={cn("p-6", className)}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-2">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-ink-3" strokeWidth={1.5} /> : null}
      </div>
      <div className="mt-3 font-display text-3xl text-ink-1">{value}</div>
      {trend ? (
        <div
          className={cn(
            "mt-2 text-xs",
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
