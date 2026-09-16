import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { TicketForm } from "@/components/support/ticket-form";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeTicketSession } from "@/lib/auth/ticket-access";
import { can } from "@/config/permissions";
import { listAvailableTicketAssignees, getTicketClient } from "@/server/services/ticket-service";
import { ServiceError } from "@/server/services/service-error";
import type { TicketClientOption } from "@/components/support/client-selector";

export default async function NovoChamadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const auth = authorizeTicketSession(session, "write");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para abrir chamados.
      </Alert>
    );
  }

  const sp = await searchParams;
  const clienteParam = typeof sp.cliente === "string" ? sp.cliente : undefined;

  // Pré-seleção vinda da URL nunca é autoridade — revalidada aqui, e o service
  // revalida de novo ao salvar. Se o cliente não existir/não for acessível, apenas
  // ignora a pré-seleção em vez de falhar a página inteira.
  let preselectedClient: TicketClientOption | null = null;
  if (clienteParam) {
    try {
      const client = await getTicketClient(clienteParam);
      preselectedClient = { id: client.id, name: client.name, status: client.status };
    } catch (error) {
      if (!(error instanceof ServiceError && error.code === "invalid_client")) throw error;
    }
  }

  const assignees = await listAvailableTicketAssignees();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Suporte", href: "/suporte" }, { label: "Novo chamado" }]} />
      <PageHeader title="Novo chamado" description="Abra um novo chamado de atendimento vinculado a um cliente da Atlaz Company." />
      <div className="max-w-3xl">
        <TicketForm
          mode="create"
          assignees={assignees}
          preselectedClient={preselectedClient}
          canManageProject={can(session?.membership?.permissions, "project:read")}
        />
      </div>
    </div>
  );
}
