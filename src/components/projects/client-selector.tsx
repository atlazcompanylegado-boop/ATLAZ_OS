"use client";

import * as React from "react";
import { Search, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export interface ClientOption {
  id: string;
  name: string;
  status: string;
}

export interface ClientSelectorResult {
  rows: ClientOption[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Seletor de Cliente com busca server-side paginada (25 por consulta) — nunca
 * carrega todos os clientes da org para montar um select (ver Checkpoint A §29).
 * `onSearch` é a server action que consulta `listProjectClients`; a seleção final
 * ainda é revalidada no servidor pelo project-service ao salvar o formulário.
 */
export function ClientSelector({
  name,
  initialClient,
  onSearch,
  disabled,
  error,
}: {
  name: string;
  initialClient: ClientOption | null;
  onSearch: (q: string, page: number) => Promise<ClientSelectorResult>;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<ClientOption | null>(initialClient);
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<ClientOption[]>([]);
  const [meta, setMeta] = React.useState({ total: 0, page: 1, pageSize: 25 });
  const [pending, startSearch] = React.useTransition();

  function runSearch(query: string, page: number, append: boolean) {
    startSearch(async () => {
      const next = await onSearch(query, page);
      setRows((prev) => (append ? [...prev, ...next.rows] : next.rows));
      setMeta({ total: next.total, page: next.page, pageSize: next.pageSize });
    });
  }

  React.useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => runSearch(q, 1, false), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  function openModal() {
    setQ("");
    setOpen(true);
    runSearch("", 1, false);
  }

  function choose(option: ClientOption) {
    setSelected(option);
    setOpen(false);
  }

  const hasMore = meta.page * meta.pageSize < meta.total;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${name}-trigger`}>Cliente</Label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <button
        type="button"
        id={`${name}-trigger`}
        onClick={openModal}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-sm border bg-surface-2 px-3 text-sm transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-danger" : "border-border hover:border-border-strong",
        )}
      >
        <span className={cn("truncate", selected ? "text-ink-1" : "text-ink-3")}>
          {selected ? selected.name : "Selecione um cliente"}
        </span>
        {!disabled ? <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.5} /> : null}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Selecionar cliente</ModalTitle>
            <ModalDescription>Busque pelo nome, nome fantasia, razão social ou documento.</ModalDescription>
          </ModalHeader>
          <div className="space-y-3 p-6 pt-4">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente..."
              leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
              aria-label="Buscar cliente"
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {pending && rows.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-ink-3">Buscando...</p>
              ) : rows.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-ink-3">Nenhum cliente encontrado.</p>
              ) : (
                rows.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => choose(option)}
                    className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm text-ink-1 transition-colors duration-150 hover:bg-surface-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{option.name}</span>
                      <Badge variant="neutral">{option.status}</Badge>
                    </span>
                    {selected?.id === option.id ? <Check className="h-4 w-4 shrink-0 text-accent-strong" strokeWidth={1.5} /> : null}
                  </button>
                ))
              )}
              {hasMore ? (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => runSearch(q, meta.page + 1, true)} disabled={pending}>
                  Carregar mais
                </Button>
              ) : null}
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
