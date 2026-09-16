"use client";

import * as React from "react";
import { Search, ChevronsUpDown, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export interface TicketProjectOption {
  id: string;
  name: string;
  status: string;
}
export interface TicketProjectSelectorResult {
  rows: TicketProjectOption[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Seletor de Projeto — sempre restrito ao Cliente já escolhido (Checkpoint C2 §9/§14):
 * sem `clientId`, o seletor fica desabilitado (nunca carrega os projetos do sistema
 * inteiro). Busca/paginação server-side, 25 por consulta. Se `clientId` mudar
 * (prop diferente da última renderização), a seleção atual é limpa automaticamente
 * — o servidor revalida de novo no submit, a limpeza aqui é só UX.
 */
export function TicketProjectSelector({
  name,
  clientId,
  initialProject,
  onSearch,
  onChange,
}: {
  name: string;
  clientId: string | null;
  initialProject: TicketProjectOption | null;
  onSearch: (clientId: string, q: string, page: number) => Promise<TicketProjectSelectorResult>;
  onChange?: (project: TicketProjectOption | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<TicketProjectOption | null>(initialProject);
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<TicketProjectOption[]>([]);
  const [meta, setMeta] = React.useState({ total: 0, page: 1, pageSize: 25 });
  const [pending, startSearch] = React.useTransition();
  const lastClientId = React.useRef(clientId);

  React.useEffect(() => {
    if (lastClientId.current !== clientId) {
      lastClientId.current = clientId;
      setSelected(null);
      onChange?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function runSearch(query: string, page: number, append: boolean) {
    if (!clientId) return;
    startSearch(async () => {
      const next = await onSearch(clientId, query, page);
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
    if (!clientId) return;
    setQ("");
    setOpen(true);
    runSearch("", 1, false);
  }

  const hasMore = meta.page * meta.pageSize < meta.total;
  const disabled = !clientId;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${name}-trigger`}>Projeto (opcional)</Label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          id={`${name}-trigger`}
          onClick={openModal}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-sm border border-border bg-surface-2 px-3 text-sm transition-colors duration-150",
            "hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <span className={cn("truncate", selected ? "text-ink-1" : "text-ink-3")}>
            {disabled ? "Selecione um cliente primeiro" : selected ? selected.name : "Sem projeto vinculado"}
          </span>
          {!disabled ? <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.5} /> : null}
        </button>
        {selected ? (
          <Button type="button" variant="ghost" size="sm" aria-label="Remover projeto vinculado" onClick={() => { setSelected(null); onChange?.(null); }}>
            <X className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        ) : null}
      </div>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Selecionar projeto</ModalTitle>
            <ModalDescription>Só mostra projetos do cliente já escolhido neste chamado.</ModalDescription>
          </ModalHeader>
          <div className="space-y-3 p-6 pt-4">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar projeto..."
              leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
              aria-label="Buscar projeto"
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {pending && rows.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-ink-3">Buscando...</p>
              ) : rows.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-ink-3">Nenhum projeto encontrado para este cliente.</p>
              ) : (
                rows.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => { setSelected(option); setOpen(false); onChange?.(option); }}
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
