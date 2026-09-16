"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { TICKET_SORTS, TICKET_SORT_LABELS, TICKET_STATUSES, TICKET_STATUS_LABELS, TICKET_PRIORITIES, TICKET_PRIORITY_LABELS } from "@/lib/validation/ticket";
import type { AssigneeOption } from "@/server/repositories/ticket-repository";
import { TicketClientSelector, type TicketClientOption, type TicketClientSelectorResult } from "./client-selector";
import { TicketProjectSelector, type TicketProjectOption, type TicketProjectSelectorResult } from "./project-selector";

const ALL = "__all__";
const UNASSIGNED = "unassigned";

/**
 * Filtros de Suporte sincronizados com a URL
 * (?q=&status=&priority=&responsavel=&clientId=&projectId=&sort=&overdue=&page=).
 * Cliente/Projeto reaproveitam os mesmos seletores paginados do formulário — nunca
 * carregam a lista inteira (Checkpoint C2 §9): o filtro de Projeto só habilita depois
 * de um Cliente já estar selecionado no filtro.
 */
export function TicketFilters({
  assignees,
  selectedClient,
  selectedProject,
  onSearchClients,
  onSearchProjects,
  canFilterByProject,
}: {
  assignees: AssigneeOption[];
  selectedClient: TicketClientOption | null;
  selectedProject: TicketProjectOption | null;
  onSearchClients: (q: string, page: number) => Promise<TicketClientSelectorResult>;
  onSearchProjects: (clientId: string, q: string, page: number) => Promise<TicketProjectSelectorResult>;
  /** project:read — sem ele, o filtro de Projeto não existe (o servidor também ignora `projectId`). */
  canFilterByProject: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");
  const [syncedParams, setSyncedParams] = React.useState(searchParams.toString());
  if (searchParams.toString() !== syncedParams) {
    setSyncedParams(searchParams.toString());
    setQ(searchParams.get("q") ?? "");
  }

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const timeout = setTimeout(() => updateParams({ q: q || null }), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const clientId = searchParams.get("clientId");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={canFilterByProject ? "Buscar por número, título, cliente ou projeto..." : "Buscar por número, título ou cliente..."}
        leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
        className="sm:max-w-xs"
        aria-label="Buscar chamados"
      />

      <div className="flex items-center gap-1 sm:w-56">
        <div className="flex-1">
          <TicketClientSelector
            name="clientFilter"
            initialClient={selectedClient}
            onSearch={onSearchClients}
            onChange={(client) => updateParams({ clientId: client?.id ?? null, projectId: null })}
          />
        </div>
        {selectedClient ? (
          <Button type="button" variant="ghost" size="sm" aria-label="Limpar filtro de cliente" onClick={() => updateParams({ clientId: null, projectId: null })}>
            <X className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        ) : null}
      </div>

      {canFilterByProject ? (
        <div className="sm:w-56">
          <TicketProjectSelector
            name="projectFilter"
            clientId={clientId}
            initialProject={selectedProject}
            onSearch={onSearchProjects}
            onChange={(project) => updateParams({ projectId: project?.id ?? null })}
          />
        </div>
      ) : null}

      <Select value={searchParams.get("status") ?? ALL} onValueChange={(value) => updateParams({ status: value === ALL ? null : value })}>
        <SelectTrigger className="sm:w-44" aria-label="Filtrar por status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {TICKET_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {TICKET_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("priority") ?? ALL} onValueChange={(value) => updateParams({ priority: value === ALL ? null : value })}>
        <SelectTrigger className="sm:w-44" aria-label="Filtrar por prioridade">
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as prioridades</SelectItem>
          {TICKET_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {TICKET_PRIORITY_LABELS[priority]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("responsavel") ?? ALL}
        onValueChange={(value) => updateParams({ responsavel: value === ALL ? null : value })}
      >
        <SelectTrigger className="sm:w-52" aria-label="Filtrar por responsável">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os responsáveis</SelectItem>
          <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
          {assignees.map((assignee) => (
            <SelectItem key={assignee.userId} value={assignee.userId}>
              {assignee.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("sort") ?? "created"} onValueChange={(value) => updateParams({ sort: value })}>
        <SelectTrigger className="sm:w-48" aria-label="Ordenar">
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent>
          {TICKET_SORTS.map((sort) => (
            <SelectItem key={sort} value={sort}>
              {TICKET_SORT_LABELS[sort]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 text-sm text-ink-1">
        <Checkbox
          checked={searchParams.get("overdue") === "true"}
          onCheckedChange={(checked) => updateParams({ overdue: checked === true ? "true" : null })}
        />
        Somente vencidos
      </label>
    </div>
  );
}
