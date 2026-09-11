"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Feedback de ações (salvar, erro, etc). Disparado com `import { toast } from "sonner"`
 * em qualquer client component. Este componente só monta o container estilizado —
 * uma vez, no layout raiz.
 */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-surface-2 !border !border-border !text-ink-1 !shadow-lg !rounded-md",
          title: "!text-ink-1",
          description: "!text-ink-2",
          actionButton: "!bg-accent !text-ink-1",
          cancelButton: "!bg-surface-3 !text-ink-2",
        },
      }}
    />
  );
}
