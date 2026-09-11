import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium " +
    "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 " +
    "disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-gradient-accent text-ink-1 hover:brightness-110 hover:shadow-glow active:brightness-95",
        secondary: "bg-surface-2 text-ink-1 hover:bg-surface-3 border border-border",
        outline: "border border-border text-ink-1 hover:border-border-strong hover:bg-surface-2",
        ghost: "text-ink-2 hover:text-ink-1 hover:bg-surface-2",
        destructive: "bg-danger text-ink-1 hover:opacity-90",
        link: "text-ink-1 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Estado de carregamento — ortogonal à variant, força disabled e mostra spinner sem mudar a largura. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* asChild (Radix Slot) exige um único filho — spinner só é injetado no <button> nativo. */}
        {asChild ? (
          children
        ) : (
          <>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
