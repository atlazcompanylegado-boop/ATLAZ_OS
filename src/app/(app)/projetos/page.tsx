import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeProjectSession } from "@/lib/auth/project-access";
import { can } from "@/config/permissions";
import { getProjectsPageData } from "@/server/services/project-service";
import { formatProjectDate, isProjectOverdue } from "@/lib/projects/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { Pagination } from "@/components/clients/pagination";

export default async function ProjetosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const auth = authorizeProjectSession(session, "read");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para ver Projetos. Peça a um administrador para conceder `project:read` e `client:read`.
      </Alert>
    );
  }

  const canWrite = can(session?.membership?.permissions, "project:write");
  const params = await searchParams;
  const flat = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const rawFilters = { ...flat, ownerUserId: flat.responsavel };

  const { rows, total, pageSize, page, kpis, filters, owners } = await getProjectsPageData(rawFilters);

  function buildHref(targetPage: number) {
    const next = new URLSearchParams(flat as Record<string, string>);
    next.set("page", String(targetPage));
    return `/projetos?${next.toString()}`;
  }

  const hasActiveFilters = !!filters.q || !!filters.status || !!filters.priority || !!filters.ownerUserId || filters.overdue;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projetos"
        description="Acompanhe os projetos ativos e entregas da Atlaz Company."
        action={
          canWrite ? (
            <Button asChild>
              <Link href="/projetos/novo">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Novo projeto
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total de projetos" value={kpis.total} icon={FolderKanban} />
        <KpiCard label="Em andamento" value={kpis.active} />
        <KpiCard label="Em revisão" value={kpis.review} />
        <KpiCard label="Concluídos" value={kpis.completed} />
      </div>

      <ProjectFilters owners={owners} />

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={total === 0 && !hasActiveFilters ? "Nenhum projeto cadastrado" : "Nenhum projeto encontrado"}
          description={
            total === 0 && !hasActiveFilters
              ? "Crie o primeiro projeto para começar a acompanhar as entregas da operação."
              : "Ajuste os filtros para encontrar o projeto que procura."
          }
          action={
            canWrite && total === 0 ? (
              <Button asChild size="sm">
                <Link href="/projetos/novo">Novo projeto</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Atualizado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-ink-2">{row.clientName}</TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-ink-2">{row.ownerName ?? "—"}</TableCell>
                    <TableCell className={isProjectOverdue(row.dueDate, row.status) ? "text-danger" : "text-ink-2"}>
                      {formatProjectDate(row.dueDate)}
                      {isProjectOverdue(row.dueDate, row.status) ? " · Atrasado" : ""}
                    </TableCell>
                    <TableCell className="text-ink-2">{new Intl.DateTimeFormat("pt-BR").format(row.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/projetos/${row.id}`}>Ver</Link>
                        </Button>
                        {canWrite ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/projetos/${row.id}/editar`}>Editar</Link>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile/tablet */}
          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <div key={row.id} className="rounded-md border border-border bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-1">{row.name}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-3">{row.clientName}</p>
                  </div>
                  <ProjectStatusBadge status={row.status} className="shrink-0" />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-2">
                  <div>
                    <dt className="text-ink-3">Responsável</dt>
                    <dd>{row.ownerName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Prazo</dt>
                    <dd className={isProjectOverdue(row.dueDate, row.status) ? "text-danger" : undefined}>
                      {formatProjectDate(row.dueDate)}
                      {isProjectOverdue(row.dueDate, row.status) ? " · Atrasado" : ""}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projetos/${row.id}`}>Ver</Link>
                  </Button>
                  {canWrite ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/projetos/${row.id}/editar`}>Editar</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
        </>
      )}
    </div>
  );
}
