import Link from "next/link";
import { Globe, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { DomainStatusBadge } from "@/components/domains/status-badge";
import { DomainExpirationBadge } from "@/components/domains/expiration-badge";
import { formatDomainDate } from "@/lib/domains/format";
import { DOMAIN_AUTO_RENEW_LABELS } from "@/lib/validation/domain";
import { Pagination } from "@/components/clients/pagination";
import type { DomainRow } from "@/server/repositories/domain-repository";

const updatedAtFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * Aba Domínios da Ficha Mestre — lista apenas domínios do cliente atual. Se o usuário
 * não tem `domain:read`+`client:read` completos, esta aba nunca é renderizada com
 * dados: a página pai decide isso antes de chamar este componente (mesmo padrão das
 * abas Projetos/Suporte).
 */
export function ClientDomainsTab({
  clientId,
  rows,
  total,
  page,
  pageSize,
  canWrite,
}: {
  clientId: string;
  rows: (DomainRow & { clientName: string; projectName: string | null; ownerName: string | null; hasProject: boolean })[];
  total: number;
  page: number;
  pageSize: number;
  canWrite: boolean;
}) {
  function buildHref(targetPage: number) {
    return `/clientes/${clientId}?tab=dominios&dominiosPage=${targetPage}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">
          {total} {total === 1 ? "domínio" : "domínios"}
        </p>
        {canWrite ? (
          <Button asChild size="sm">
            <Link href={`/dominios/novo?cliente=${clientId}`}>
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Novo domínio
            </Link>
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="Nenhum domínio cadastrado"
          description="Os domínios vinculados a este cliente aparecerão aqui."
          action={
            canWrite ? (
              <Button asChild size="sm">
                <Link href={`/dominios/novo?cliente=${clientId}`}>Novo domínio</Link>
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
                  <TableHead>Status</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Renovação automática</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Atualizado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.domainName}</TableCell>
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
                    <TableCell className="text-ink-2">{row.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-ink-2">{updatedAtFormatter.format(row.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/dominios/${row.id}`}>Ver</Link>
                      </Button>
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
                  </div>
                  <DomainStatusBadge status={row.status} className="shrink-0" />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-2">
                  <div>
                    <dt className="text-ink-3">Vencimento</dt>
                    <dd>{formatDomainDate(row.expirationDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Responsável</dt>
                    <dd>{row.ownerName ?? "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dominios/${row.id}`}>Ver</Link>
                  </Button>
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

export function ClientDomainsForbidden() {
  return (
    <Alert variant="warning" title="Sem acesso a Domínios">
      Você não tem permissão para ver os domínios deste cliente.
    </Alert>
  );
}
