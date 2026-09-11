import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-3 text-ink-2",
        accent: "border-transparent bg-accent-muted text-accent-strong",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        danger: "border-transparent bg-danger/15 text-danger",
        /** Tag discreta de status/fase (ex.: "Fase 1") — nunca deve pesar mais que o rótulo ao lado. */
        tag: "border-border/60 bg-surface-3/60 px-2 py-0.5 text-[9px] tracking-[0.06em] text-ink-3",
        /** Badge institucional de papel/cargo (ex.: "SUPER ADMIN") — vermelho escuro/dessaturado, não o accent vivo. */
        role: "border-role-border bg-role-bg text-role-ink",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
