import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Estado de erro visual — mesmo padrão do Input (soma-se a `aria-invalid`). */
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      aria-invalid={props["aria-invalid"] ?? error}
      className={cn(
        "flex min-h-24 w-full rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-ink-1",
        "placeholder:text-ink-3 transition-colors duration-150",
        "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent",
        "disabled:cursor-not-allowed disabled:opacity-40",
        error && "border-danger focus-visible:border-danger focus-visible:ring-danger",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
