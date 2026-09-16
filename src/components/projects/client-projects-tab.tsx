import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { formatProjectDate, isProjectOverdue } from "@/lib/projects/format";
import { Pagination } from "@/components/clients/pagination";
import type { ProjectRow } from "@/server/repositories/project-repository";

/**
 * Aba Projetos da Ficha Mestre — lista apenas projetos do cliente atual. Se o
 * usuário tem `client:read` mas não `project:read`+`client:read` completos
 * (contrato de `authorizeProjectSession`), esta aba nunca é renderizada com
 * dados: a página pai decide isso antes de chamar este componente (ver
 * Checkpoint A §21: "sem vazar existência/contagem").
 */
export function ClientProjectsTab({
  clientId,
  rows,
  total,
  page,
  pageSize,
  canWrite,
}: {
  clientId: string;
  rows: (ProjectRow & { clientName: string; ownerName: string | null })[];
  total: number;
  page: number;
  pageSize: number;
  canWrite: boolean;
}) {
  function buildHref(targetPage: number) {
    return `/clientes/${clientId}?tab=projetos&projetosPage=${targetPage}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">
          {total} {total === 1 ? "projeto" : "projetos"}
        </p>
        {canWrite ? (
          <Button asChild size="sm">
            <Link href={`/projetos/novo?cliente=${clientId}`}>
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Novo projeto
            </Link>
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhum projeto cadastrado"
          description="Os projetos vinculados a este cliente aparecerão aqui."
          action={
            canWrite ? (
              <Button asChild size="sm">
                <Link href={`/projetos/novo?cliente=${clientId}`}>Novo projeto</Link>
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
                  <TableHead>Projeto</TableHead>
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
                    <TableCell>
                      <ProjectStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-ink-2">{row.ownerName ?? "—"}</TableCell>
                    <TableCell className={isProjectOverdue(row.dueDate, row.status) ? "text-danger" : "text-ink-2"}>
                      {formatProjectDate(row.dueDate)}
                    </TableCell>
                    <TableCell className="text-ink-2">{new Intl.DateTimeFormat("pt-BR").format(row.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/projetos/${row.id}`}>Ver</Link>
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
                  <p className="truncate text-sm font-medium text-ink-1">{row.name}</p>
                  <ProjectStatusBadge status={row.status} className="shrink-0" />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-2">
                  <div>
                    <dt className="text-ink-3">Responsável</dt>
                    <dd>{row.ownerName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Prazo</dt>
                    <dd className={isProjectOverdue(row.dueDate, row.status) ? "text-danger" : undefined}>{formatProjectDate(row.dueDate)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projetos/${row.id}`}>Ver</Link>
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

export function ClientProjectsForbidden() {
  return (
    <Alert variant="warning" title="Sem acesso a Projetos">
      Você não tem permissão para ver os projetos deste cliente.
    </Alert>
  );
}
