"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PROJECT_SORTS, PROJECT_SORT_LABELS, PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_PRIORITIES, PROJECT_PRIORITY_LABELS } from "@/lib/validation/project";
import type { OwnerOption } from "@/server/repositories/project-repository";

const ALL = "__all__";
const UNASSIGNED = "unassigned";

/** Filtros de Projetos sincronizados com a URL (?q=&status=&responsavel=&sort=&page=). */
export function ProjectFilters({ owners }: { owners: OwnerOption[] }) {
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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por projeto ou cliente..."
        leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
        className="sm:max-w-xs"
        aria-label="Buscar projetos"
      />

      <Select value={searchParams.get("status") ?? ALL} onValueChange={(value) => updateParams({ status: value === ALL ? null : value })}>
        <SelectTrigger className="sm:w-44" aria-label="Filtrar por status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {PROJECT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {PROJECT_STATUS_LABELS[status]}
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
          {PROJECT_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {PROJECT_PRIORITY_LABELS[priority]}
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

      <Select value={searchParams.get("sort") ?? "created"} onValueChange={(value) => updateParams({ sort: value })}>
        <SelectTrigger className="sm:w-48" aria-label="Ordenar">
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent>
          {PROJECT_SORTS.map((sort) => (
            <SelectItem key={sort} value={sort}>
              {PROJECT_SORT_LABELS[sort]}
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
