import Link from "next/link";
import { Users, Plus } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeClientSession } from "@/lib/auth/client-access";
import { can } from "@/config/permissions";
import { getClientsPageData } from "@/server/services/client-service";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { ClientFilters } from "@/components/clients/client-filters";
import { ClientStatusBadge } from "@/components/clients/status-badge";
import { Pagination } from "@/components/clients/pagination";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const auth = authorizeClientSession(session, "read");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para ver Clientes. Peça a um administrador para conceder `client:read`.
      </Alert>
    );
  }

  const canWrite = can(session?.membership?.permissions, "client:write");
  const params = await searchParams;
  const flat = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));

  const { rows, total, pageSize, page, kpis, filters, owners } = await getClientsPageData(flat);

  function buildHref(targetPage: number) {
    const next = new URLSearchParams(flat as Record<string, string>);
    next.set("page", String(targetPage));
    return `/clientes?${next.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Gerencie a carteira de clientes da Atlaz Company."
        action={
          canWrite ? (
            <Button asChild>
              <Link href="/clientes/novo">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Novo cliente
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total de clientes" value={kpis.total} icon={Users} />
        <KpiCard label="Ativos" value={kpis.active} />
        <KpiCard label="Em onboarding" value={kpis.onboarding} />
        <KpiCard label="Pausados" value={kpis.paused} />
      </div>

      <ClientFilters owners={owners} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={total === 0 && !filters.q && !filters.status && !filters.ownerUserId ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado"}
          description={
            total === 0 && !filters.q && !filters.status && !filters.ownerUserId
              ? "Cadastre o primeiro cliente para começar a estruturar sua operação."
              : "Ajuste os filtros para encontrar o cliente que procura."
          }
          action={
            canWrite && total === 0 ? (
              <Button asChild size="sm">
                <Link href="/clientes/novo">Cadastrar cliente</Link>
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
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Contato principal</TableHead>
                  <TableHead>Atualizado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <ClientStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-ink-2">{row.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-ink-2">{row.primaryContactName ?? "—"}</TableCell>
                    <TableCell className="text-ink-2">{new Intl.DateTimeFormat("pt-BR").format(row.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/clientes/${row.id}`}>Ver</Link>
                        </Button>
                        {canWrite ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/clientes/${row.id}/editar`}>Editar</Link>
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
                    <p className="mt-0.5 text-xs text-ink-3">Atualizado em {new Intl.DateTimeFormat("pt-BR").format(row.updatedAt)}</p>
                  </div>
                  <ClientStatusBadge status={row.status} className="shrink-0" />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-2">
                  <div>
                    <dt className="text-ink-3">Responsável</dt>
                    <dd>{row.ownerName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Contato principal</dt>
                    <dd>{row.primaryContactName ?? "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/clientes/${row.id}`}>Ver</Link>
                  </Button>
                  {canWrite ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/clientes/${row.id}/editar`}>Editar</Link>
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
