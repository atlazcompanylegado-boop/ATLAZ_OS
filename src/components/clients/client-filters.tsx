"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CLIENT_SORT_LABELS, CLIENT_SORTS, CLIENT_STATUSES, CLIENT_STATUS_LABELS } from "@/lib/validation/client";
import type { OwnerOption } from "@/server/repositories/client-repository";

const ALL = "__all__";

/** Filtros de Clientes sincronizados com a URL (?q=&status=&responsavel=&sort=&page=). */
export function ClientFilters({ owners }: { owners: OwnerOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");
  // Ajuste de estado durante a renderização (padrão recomendado pelo React para
  // "resetar" estado quando uma prop/derivado externo muda) em vez de um efeito
  // com setState síncrono — evita o passo extra de render de um useEffect.
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
    params.delete("page"); // qualquer mudança de filtro volta para a página 1
    router.push(`${pathname}?${params.toString()}`);
  }

  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const timeout = setTimeout(() => updateParams({ q: q || null }), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nome, razão social ou documento..."
        leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
        className="sm:max-w-xs"
        aria-label="Buscar clientes"
      />

      <Select value={searchParams.get("status") ?? ALL} onValueChange={(value) => updateParams({ status: value === ALL ? null : value })}>
        <SelectTrigger className="sm:w-44" aria-label="Filtrar por status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {CLIENT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {CLIENT_STATUS_LABELS[status]}
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
          {owners.map((owner) => (
            <SelectItem key={owner.userId} value={owner.userId}>
              {owner.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("sort") ?? "recent"} onValueChange={(value) => updateParams({ sort: value })}>
        <SelectTrigger className="sm:w-48" aria-label="Ordenar">
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent>
          {CLIENT_SORTS.map((sort) => (
            <SelectItem key={sort} value={sort}>
              {CLIENT_SORT_LABELS[sort]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
