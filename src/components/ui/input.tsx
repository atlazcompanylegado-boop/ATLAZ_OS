import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Ícone decorativo à esquerda (ex.: Mail, Lock). Ativa o modo "wrapper". */
  leftIcon?: React.ReactNode;
  /** Elemento interativo à direita, dentro do campo (ex.: botão mostrar/ocultar senha). */
  rightElement?: React.ReactNode;
  /** Estado de erro visual — soma-se a `aria-invalid` (que continua controlado por quem usa). */
  error?: boolean;
}

/**
 * Input global do design system. Sem `leftIcon`/`rightElement`, renderiza o
 * `<input>` puro de sempre (nenhum call-site existente quebra). Com qualquer
 * um dos dois, vira um wrapper com foco tratado via `:focus-within` — usado
 * hoje no login (e-mail/senha com ícone + toggle de visibilidade), reutilizável
 * em busca/formulários futuros (ver docs/design-system.md §13).
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightElement, error, ...props }, ref) => {
    if (!leftIcon && !rightElement) {
      return (
        <input
          type={type}
          ref={ref}
          aria-invalid={props["aria-invalid"] ?? error}
          className={cn(
            "flex h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-sm text-ink-1",
            "placeholder:text-ink-3 transition-colors duration-150",
            "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent",
            "disabled:cursor-not-allowed disabled:opacity-40",
            error && "border-danger focus-visible:border-danger focus-visible:ring-danger",
            className,
          )}
          {...props}
        />
      );
    }

    return (
      <div
        className={cn(
          "flex h-11 items-center gap-2.5 rounded-sm border bg-surface-2 px-3 transition-colors duration-200",
          "focus-within:border-accent focus-within:shadow-glow-focus",
          error ? "border-danger" : "border-border",
          className,
        )}
      >
        {leftIcon ? <span className="shrink-0 text-ink-3">{leftIcon}</span> : null}
        <input
          type={type}
          ref={ref}
          aria-invalid={props["aria-invalid"] ?? error}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-sm text-ink-1 placeholder:text-ink-3",
            "focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
          )}
          {...props}
        />
        {rightElement ? <span className="flex shrink-0 items-center">{rightElement}</span> : null}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
