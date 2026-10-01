import Link from "next/link";
import { Globe, Plus } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeDomainSession } from "@/lib/auth/domain-access";
import { can } from "@/config/permissions";
import { getDomainsPageData, getDomainClient, getDomainProject } from "@/server/services/domain-service";
import { formatDomainDate } from "@/lib/domains/format";
import { DOMAIN_AUTO_RENEW_LABELS } from "@/lib/validation/domain";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { DomainFilters } from "@/components/domains/domain-filters";
import { DomainStatusBadge } from "@/components/domains/status-badge";
import { DomainExpirationBadge } from "@/components/domains/expiration-badge";
import { Pagination } from "@/components/clients/pagination";
import { searchDomainClientsAction, searchDomainProjectsAction } from "./actions";
import type { DomainClientOption } from "@/components/domains/client-selector";
import type { DomainProjectOption } from "@/components/domains/project-selector";

const updatedAtFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function DominiosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const auth = authorizeDomainSession(session, "read");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para ver Domínios. Peça a um administrador para conceder `domain:read` e `client:read`.
      </Alert>
    );
  }

  const canWrite = can(session?.membership?.permissions, "domain:write");
  const canReadProjects = can(session?.membership?.permissions, "project:read");
  const params = await searchParams;
  const flat = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const rawFilters = { ...flat, ownerUserId: flat.responsavel };

  const { rows, total, pageSize, page, kpis, filters, owners } = await getDomainsPageData(rawFilters);

  let selectedClient: DomainClientOption | null = null;
  if (filters.clientId) {
    try { selectedClient = await getDomainClient(filters.clientId); } catch { /* filtro inválido é só ignorado */ }
  }
  let selectedProject: DomainProjectOption | null = null;
  if (canReadProjects && filters.clientId && filters.projectId) {
    try { selectedProject = (await getDomainProject(filters.clientId, filters.projectId)) ?? null; } catch { /* idem */ }
  }

  function buildHref(targetPage: number) {
    const next = new URLSearchParams(flat as Record<string, string>);
    next.set("page", String(targetPage));
    return `/dominios?${next.toString()}`;
  }

  const hasActiveFilters = !!filters.q || !!filters.status || !!filters.autoRenewStatus || !!filters.ownerUserId ||
    !!filters.clientId || !!filters.projectId || !!filters.expirationWindow || filters.expired;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domínios"
        description="Acompanhe os domínios geridos pela Atlaz Company e seus vencimentos."
        action={
          canWrite ? (
            <Button asChild>
              <Link href="/dominios/novo">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Novo domínio
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Ativos" value={kpis.active} icon={Globe} />
        <KpiCard label="Vencem em até 30 dias" value={kpis.expiring30} />
        <KpiCard label="Vencem em até 7 dias" value={kpis.expiring7} />
        <KpiCard label="Vencidos" value={kpis.expired} />
      </div>

      <DomainFilters
        owners={owners}
        selectedClient={selectedClient}
        selectedProject={selectedProject}
        onSearchClients={searchDomainClientsAction}
        onSearchProjects={searchDomainProjectsAction}
        canFilterByProject={canReadProjects}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Globe}
          title={total === 0 && !hasActiveFilters ? "Nenhum domínio cadastrado" : "Nenhum domínio encontrado"}
          description={
            total === 0 && !hasActiveFilters
              ? "Cadastre o primeiro domínio para começar a acompanhar os vencimentos."
              : "Ajuste os filtros para encontrar o domínio que procura."
          }
          action={
            canWrite && total === 0 ? (
              <Button asChild size="sm">
                <Link href="/dominios/novo">Novo domínio</Link>
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
                  <TableHead>Domínio</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Registrador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Renovação automática</TableHead>
                  <TableHead>Atualizado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.domainName}</TableCell>
                    <TableCell className="text-ink-2">
                      <Link href={`/clientes/${row.clientId}`} className="hover:underline">
                        {row.clientName}
                      </Link>
                    </TableCell>
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
                    <TableCell className="text-ink-2">{row.registrar ?? "—"}</TableCell>
                    <TableCell>
                      <DomainStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-2">{formatDomainDate(row.expirationDate)}</span>
                        <DomainExpirationBadge expirationDate={row.expirationDate} status={row.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-ink-2">{DOMAIN_AUTO_RENEW_LABELS[row.autoRenewStatus]}</TableCell>
                    <TableCell className="text-ink-2">{updatedAtFormatter.format(row.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/dominios/${row.id}`}>Ver</Link>
                        </Button>
                        {canWrite ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/dominios/${row.id}/editar`}>Editar</Link>
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
                    <p className="truncate text-sm font-medium text-ink-1">{row.domainName}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-3">{row.clientName}</p>
                  </div>
                  <DomainStatusBadge status={row.status} className="shrink-0" />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-2">
                  <div>
                    <dt className="text-ink-3">Vencimento</dt>
                    <dd className="flex items-center gap-1.5">
                      {formatDomainDate(row.expirationDate)}
                      <DomainExpirationBadge expirationDate={row.expirationDate} status={row.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Renovação automática</dt>
                    <dd>{DOMAIN_AUTO_RENEW_LABELS[row.autoRenewStatus]}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dominios/${row.id}`}>Ver</Link>
                  </Button>
                  {canWrite ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dominios/${row.id}/editar`}>Editar</Link>
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
