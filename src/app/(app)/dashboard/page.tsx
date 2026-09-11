import { Users, Briefcase, Target, Wallet, AlertTriangle } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { getTeamSize } from "@/server/services/team-service";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const session = await getCurrentSession();

  if (!session) {
    // Não deveria acontecer (middleware + layout já barram), mas nunca assume sessão.
    return <Alert variant="danger">Sessão inválida. Faça login novamente.</Alert>;
  }

  if (!session.membership) {
    return (
      <Alert variant="warning" title="Sem vínculo de equipe">
        Sua conta ({session.email}) está autenticada, mas ainda não tem uma <code>membership</code> na
        Atlaz Company. Peça para um super admin te adicionar em Equipe, ou rode{" "}
        <code>npm run db:seed</code> com <code>SUPER_ADMIN_EMAIL={session.email}</code> em{" "}
        <code>.env.local</code>.
      </Alert>
    );
  }

  const teamSize = await getTeamSize(session.membership.org.id);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold text-ink-1">Dashboard</h1>
          <Badge variant="accent">{session.membership.role}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          Visão executiva da {session.membership.org.name}.
        </p>
      </div>

      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Membros da equipe" value={teamSize} icon={Users} />
          <KpiCard
            label="Clientes ativos"
            value="—"
            icon={Briefcase}
            trend={{ direction: "flat", label: "Aguarda módulo de Clientes (Fase 1)" }}
          />
          <KpiCard
            label="Leads"
            value="—"
            icon={Target}
            trend={{ direction: "flat", label: "Aguarda módulo de CRM (Fase 2)" }}
          />
          <KpiCard
            label="Faturamento (mês)"
            value="—"
            icon={Wallet}
            trend={{ direction: "flat", label: "Aguarda módulo Financeiro (Fase 2)" }}
          />
          <KpiCard
            label="Chamados abertos"
            value="—"
            icon={AlertTriangle}
            trend={{ direction: "flat", label: "Aguarda módulo de Suporte (Fase 1)" }}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-3">
          Atenção necessária
        </h2>
        <EmptyState
          icon={AlertTriangle}
          title="Nenhum alerta ainda"
          description="O motor de alertas (domínio/contrato vencendo, inadimplência, chamado parado) entra na Fase 2, junto do Financeiro e do CRM — ver docs/roadmap.md."
        />
      </section>
    </div>
  );
}
