import Link from "next/link";
import { LifeBuoy, Plus } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeTicketSession } from "@/lib/auth/ticket-access";
import { can } from "@/config/permissions";
import { getTicketsPageData, getTicketClient, getTicketProject } from "@/server/services/ticket-service";
import { formatTicketDateTime, formatTicketNumber, isTicketOverdue } from "@/lib/support/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { TicketFilters } from "@/components/support/ticket-filters";
import { TicketStatusBadge } from "@/components/support/status-badge";
import { TicketPriorityBadge } from "@/components/support/priority-badge";
import { Pagination } from "@/components/clients/pagination";
import { searchTicketClientsAction, searchTicketProjectsAction } from "./actions";
import type { TicketClientOption } from "@/components/support/client-selector";
import type { TicketProjectOption } from "@/components/support/project-selector";

export default async function SuportePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const auth = authorizeTicketSession(session, "read");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para ver Suporte. Peça a um administrador para conceder `ticket:read` e `client:read`.
      </Alert>
    );
  }

  const canWrite = can(session?.membership?.permissions, "ticket:write");
  const canReadProjects = can(session?.membership?.permissions, "project:read");
  const params = await searchParams;
  const flat = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const rawFilters = { ...flat, assignedUserId: flat.responsavel };

  const { rows, total, pageSize, page, kpis, filters, assignees } = await getTicketsPageData(rawFilters);

  let selectedClient: TicketClientOption | null = null;
  if (filters.clientId) {
    try { selectedClient = await getTicketClient(filters.clientId); } catch { /* filtro inválido é só ignorado */ }
  }
  let selectedProject: TicketProjectOption | null = null;
  if (filters.clientId && filters.projectId) {
    try { selectedProject = (await getTicketProject(filters.clientId, filters.projectId)) ?? null; } catch { /* idem */ }
  }

  function buildHref(targetPage: number) {
    const next = new URLSearchParams(flat as Record<string, string>);
    next.set("page", String(targetPage));
    return `/suporte?${next.toString()}`;
  }

  const hasActiveFilters = !!filters.q || !!filters.status || !!filters.priority || !!filters.assignedUserId || !!filters.clientId || !!filters.projectId || filters.overdue;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suporte"
        description="Acompanhe os chamados de atendimento da Atlaz Company."
        action={
          canWrite ? (
            <Button asChild>
              <Link href="/suporte/novo">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Novo chamado
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Abertos" value={kpis.open} icon={LifeBuoy} />
        <KpiCard label="Em atendimento" value={kpis.inProgress} />
        <KpiCard label="Críticos" value={kpis.critical} />
        <KpiCard label="Vencidos" value={kpis.overdue} />
      </div>

      <TicketFilters
        assignees={assignees}
        selectedClient={selectedClient}
        selectedProject={selectedProject}
        onSearchClients={searchTicketClientsAction}
        onSearchProjects={searchTicketProjectsAction}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={total === 0 && !hasActiveFilters ? "Nenhum chamado cadastrado" : "Nenhum chamado encontrado"}
          description={
            total === 0 && !hasActiveFilters
              ? "Crie o primeiro chamado para começar a acompanhar o atendimento."
              : "Ajuste os filtros para encontrar o chamado que procura."
          }
          action={
            canWrite && total === 0 ? (
              <Button asChild size="sm">
                <Link href="/suporte/novo">Novo chamado</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chamado</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Atualizado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {formatTicketNumber(row.ticketNumber)} — {row.title}
                    </TableCell>
                    <TableCell className="text-ink-2">{row.clientName}</TableCell>
                    <TableCell className="text-ink-2">
                      {!row.hasProject ? "—" : row.projectName ? (
                        canReadProjects ? (
                          <Link href={`/projetos/${row.projectId}`} className="text-accent-strong hover:underline">
                            {row.projectName}
                          </Link>
                        ) : (
                          row.projectName
                        )
                      ) : (
                        <span className="italic text-ink-3">Projeto vinculado</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TicketStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <TicketPriorityBadge priority={row.priority} />
                    </TableCell>
                    <TableCell className="text-ink-2">{row.assigneeName ?? "—"}</TableCell>
                    <TableCell className={isTicketOverdue(row.dueAt, row.status) ? "text-danger" : "text-ink-2"}>
                      {formatTicketDateTime(row.dueAt)}
                      {isTicketOverdue(row.dueAt, row.status) ? " · Atrasado" : ""}
                    </TableCell>
                    <TableCell className="text-ink-2">{formatTicketDateTime(row.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/suporte/${row.id}`}>Ver</Link>
                        </Button>
                        {canWrite ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/suporte/${row.id}/editar`}>Editar</Link>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <div key={row.id} className="rounded-md border border-border bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-1">
                      {formatTicketNumber(row.ticketNumber)} — {row.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-3">{row.clientName}</p>
                  </div>
                  <TicketStatusBadge status={row.status} className="shrink-0" />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-2">
                  <div>
                    <dt className="text-ink-3">Responsável</dt>
                    <dd>{row.assigneeName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Prazo</dt>
                    <dd className={isTicketOverdue(row.dueAt, row.status) ? "text-danger" : undefined}>
                      {formatTicketDateTime(row.dueAt)}
                      {isTicketOverdue(row.dueAt, row.status) ? " · Atrasado" : ""}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/suporte/${row.id}`}>Ver</Link>
                  </Button>
                  {canWrite ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/suporte/${row.id}/editar`}>Editar</Link>
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
