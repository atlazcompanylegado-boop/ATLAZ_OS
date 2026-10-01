"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  DOMAIN_SORTS, DOMAIN_SORT_LABELS, DOMAIN_STATUSES, DOMAIN_STATUS_LABELS,
  DOMAIN_AUTO_RENEW_STATUSES, DOMAIN_AUTO_RENEW_LABELS, DOMAIN_EXPIRATION_WINDOWS,
} from "@/lib/validation/domain";
import type { AvailableOwnerOption } from "@/server/repositories/domain-repository";
import { DomainClientSelector, type DomainClientOption, type DomainClientSelectorResult } from "./client-selector";
import { DomainProjectSelector, type DomainProjectOption, type DomainProjectSelectorResult } from "./project-selector";

const ALL = "__all__";
const UNASSIGNED = "unassigned";
const EXPIRED = "expired";

const EXPIRATION_LABELS: Record<(typeof DOMAIN_EXPIRATION_WINDOWS)[number], string> = {
  "60": "Vence em até 60 dias", "30": "Vence em até 30 dias", "15": "Vence em até 15 dias", "7": "Vence em até 7 dias",
};

/**
 * Filtros de Domínios sincronizados com a URL
 * (?q=&status=&autoRenewStatus=&responsavel=&clientId=&projectId=&expirationWindow=&expired=&sort=&page=).
 * Cliente/Projeto reaproveitam os mesmos seletores paginados do formulário — nunca
 * carregam a lista inteira (Checkpoint A §37): o filtro de Projeto só habilita depois
 * de um Cliente já estar selecionado no filtro.
 */
export function DomainFilters({
  owners,
  selectedClient,
  selectedProject,
  onSearchClients,
  onSearchProjects,
  canFilterByProject,
}: {
  owners: AvailableOwnerOption[];
  selectedClient: DomainClientOption | null;
  selectedProject: DomainProjectOption | null;
  onSearchClients: (q: string, page: number) => Promise<DomainClientSelectorResult>;
  onSearchProjects: (clientId: string, q: string, page: number) => Promise<DomainProjectSelectorResult>;
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
  const expirationValue = searchParams.get("expired") === "true" ? EXPIRED : searchParams.get("expirationWindow") ?? ALL;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={canFilterByProject ? "Buscar por domínio, cliente, registrador ou projeto..." : "Buscar por domínio, cliente ou registrador..."}
        leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
        className="sm:max-w-xs"
        aria-label="Buscar domínios"
      />

      <div className="flex items-center gap-1 sm:w-56">
        <div className="flex-1">
          <DomainClientSelector
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
          <DomainProjectSelector
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
          {DOMAIN_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {DOMAIN_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={expirationValue}
        onValueChange={(value) =>
          updateParams(
            value === ALL ? { expirationWindow: null, expired: null }
              : value === EXPIRED ? { expirationWindow: null, expired: "true" }
              : { expirationWindow: value, expired: null },
          )
        }
      >
        <SelectTrigger className="sm:w-52" aria-label="Filtrar por vencimento">
          <SelectValue placeholder="Vencimento" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os vencimentos</SelectItem>
          {DOMAIN_EXPIRATION_WINDOWS.map((window) => (
            <SelectItem key={window} value={window}>
              {EXPIRATION_LABELS[window]}
            </SelectItem>
          ))}
          <SelectItem value={EXPIRED}>Vencidos</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("autoRenewStatus") ?? ALL}
        onValueChange={(value) => updateParams({ autoRenewStatus: value === ALL ? null : value })}
      >
        <SelectTrigger className="sm:w-56" aria-label="Filtrar por renovação automática">
          <SelectValue placeholder="Renovação automática" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as renovações</SelectItem>
          {DOMAIN_AUTO_RENEW_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {DOMAIN_AUTO_RENEW_LABELS[status]}
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
          {owners.map((owner) => (
            <SelectItem key={owner.userId} value={owner.userId}>
              {owner.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("sort") ?? "expiration"} onValueChange={(value) => updateParams({ sort: value })}>
        <SelectTrigger className="sm:w-48" aria-label="Ordenar">
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent>
          {DOMAIN_SORTS.map((sort) => (
            <SelectItem key={sort} value={sort}>
              {DOMAIN_SORT_LABELS[sort]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
