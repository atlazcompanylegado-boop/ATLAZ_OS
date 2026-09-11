import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-md border p-4 text-sm", {
  variants: {
    variant: {
      neutral: "border-border bg-surface-2 text-ink-1",
      info: "border-border bg-surface-2 text-ink-1",
      success: "border-success/30 bg-success/10 text-ink-1",
      warning: "border-warning/30 bg-warning/10 text-ink-1",
      danger: "border-danger/30 bg-danger/10 text-ink-1",
    },
  },
  defaultVariants: { variant: "neutral" },
});

const icons = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
}

function Alert({ className, variant = "neutral", title, children, ...props }: AlertProps) {
  const Icon = icons[variant ?? "neutral"];
  return (
    <div className={cn(alertVariants({ variant, className }))} {...props}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
      <div className="space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  );
}

export { Alert };
