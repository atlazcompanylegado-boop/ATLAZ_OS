"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { FLAT_NAVIGATION } from "@/config/navigation";
import { Badge } from "@/components/ui/badge";

/**
 * Busca global (Ctrl/Cmd+K). Escopo da Fase 0: navegação entre os módulos do
 * ATLΛZ OS (existentes e planejados). Cada fase futura soma suas próprias
 * entidades (clientes, projetos, leads...) a este índice — ver docs/roadmap.md.
 */
export function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FLAT_NAVIGATION;
    return FLAT_NAVIGATION.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          className={cn(
            "flex h-8 w-56 items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 text-sm text-ink-3",
            "transition-colors duration-150 hover:border-border-strong hover:text-ink-2",
          )}
        >
          <SearchIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="rounded border border-border px-1 text-[10px] text-ink-3">Ctrl K</kbd>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-32 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-border bg-surface-2 shadow-lg focus:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Busca global</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <SearchIcon className="h-4 w-4 text-ink-3" strokeWidth={1.5} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ir para um módulo do ATLΛZ OS..."
              className="h-12 w-full bg-transparent text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-3">Nenhum módulo encontrado.</p>
            ) : (
              results.map((item) => (
                <button
                  key={item.href}
                  onClick={() => go(item.href)}
                  className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm text-ink-1 hover:bg-surface-3"
                >
                  <item.icon className="h-4 w-4 text-ink-3" strokeWidth={1.5} />
                  <span className="flex-1">{item.label}</span>
                  {item.status === "planned" ? (
                    <Badge variant="neutral">{item.phase}</Badge>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
