import Link from "next/link";
import { LifeBuoy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { TicketStatusBadge } from "@/components/support/status-badge";
import { TicketPriorityBadge } from "@/components/support/priority-badge";
import { formatTicketDateTime, formatTicketNumber, isTicketOverdue } from "@/lib/support/format";
import { Pagination } from "@/components/clients/pagination";
import type { TicketRow } from "@/server/repositories/ticket-repository";

/**
 * Aba Suporte da Ficha Mestre — lista apenas chamados do cliente atual. Se o usuário
 * não tem `ticket:read`+`client:read` completos, esta aba nunca é renderizada com
 * dados: a página pai decide isso antes de chamar este componente (mesmo padrão da
 * aba Projetos — ver Checkpoint A/C2 de Suporte).
 */
export function ClientTicketsTab({
  clientId,
  rows,
  total,
  page,
  pageSize,
  canWrite,
}: {
  clientId: string;
  rows: (TicketRow & { clientName: string; assigneeName: string | null })[];
  total: number;
  page: number;
  pageSize: number;
  canWrite: boolean;
}) {
  function buildHref(targetPage: number) {
    return `/clientes/${clientId}?tab=suporte&suportePage=${targetPage}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">
          {total} {total === 1 ? "chamado" : "chamados"}
        </p>
        {canWrite ? (
          <Button asChild size="sm">
            <Link href={`/suporte/novo?cliente=${clientId}`}>
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Novo chamado
            </Link>
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Nenhum chamado cadastrado"
          description="Os chamados vinculados a este cliente aparecerão aqui."
          action={
            canWrite ? (
              <Button asChild size="sm">
                <Link href={`/suporte/novo?cliente=${clientId}`}>Novo chamado</Link>
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
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/suporte/${row.id}`}>Ver</Link>
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
                    <p className="truncate text-sm font-medium text-ink-1">
                      {formatTicketNumber(row.ticketNumber)} — {row.title}
                    </p>
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
                    <dd className={isTicketOverdue(row.dueAt, row.status) ? "text-danger" : undefined}>{formatTicketDateTime(row.dueAt)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/suporte/${row.id}`}>Ver</Link>
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

export function ClientTicketsForbidden() {
  return (
    <Alert variant="warning" title="Sem acesso a Suporte">
      Você não tem permissão para ver os chamados deste cliente.
    </Alert>
  );
}
