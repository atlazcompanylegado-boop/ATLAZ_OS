import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ParticleField } from "@/components/brand/particle-field";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Nunca deixar uma lista/tela vazia sem contexto (ver docs/design-system.md §8, §51). */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-border bg-surface-1/40 px-6 py-10 text-center",
        className,
      )}
    >
      <ParticleField className="pointer-events-none absolute inset-0 h-full w-full text-ink-3" opacity={0.06} />
      <div className="relative z-10 flex flex-col items-center gap-3">
        {Icon ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2">
            <Icon className="h-4 w-4 text-ink-3" strokeWidth={1.5} />
          </div>
        ) : null}
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink-1">{title}</p>
          {description ? <p className="max-w-sm text-sm text-ink-2">{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}
