import { UsersRound } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { listTeamMembers } from "@/server/services/team-service";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

/**
 * Fase 0 entrega leitura real (memberships já existe no banco, herdado do projeto
 * anterior). Convite, edição de papel e remoção — protegidos por
 * `can(permissions, "team:manage")` — chegam na Fase 1.
 */
export default async function EquipePage() {
  const session = await getCurrentSession();
  if (!session?.membership) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você precisa de uma membership ativa para ver a equipe.
      </Alert>
    );
  }

  const members = await listTeamMembers(session.membership.org.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-ink-1">Equipe</h1>
        <p className="mt-1 text-sm text-ink-2">
          {members.length} {members.length === 1 ? "pessoa" : "pessoas"} na {session.membership.org.name}.
        </p>
      </div>

      {members.length === 0 ? (
        <EmptyState icon={UsersRound} title="Nenhum membro ainda" description="Rode o seed para criar o primeiro super admin — ver docs/banco.md." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Desde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.membershipId}>
                <TableCell>{m.fullName}</TableCell>
                <TableCell className="text-ink-2">{m.email}</TableCell>
                <TableCell>
                  <Badge variant="accent">{m.roleName}</Badge>
                </TableCell>
                <TableCell className="text-ink-2">
                  {new Intl.DateTimeFormat("pt-BR").format(m.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
