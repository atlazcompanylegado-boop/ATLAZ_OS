import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeTicketSession } from "@/lib/auth/ticket-access";
import { can } from "@/config/permissions";
import { getTicketDetail, listAvailableTicketAssignees } from "@/server/services/ticket-service";
import { ServiceError } from "@/server/services/service-error";
import { formatTicketNumber } from "@/lib/support/format";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { TicketForm } from "@/components/support/ticket-form";

export default async function EditarChamadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const auth = authorizeTicketSession(session, "write");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para editar chamados.
      </Alert>
    );
  }

  let ticket;
  try {
    ticket = await getTicketDetail(id);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }

  const assignees = await listAvailableTicketAssignees();
  const label = `${formatTicketNumber(ticket.ticketNumber)} — ${ticket.title}`;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Suporte", href: "/suporte" }, { label, href: `/suporte/${ticket.id}` }, { label: "Editar" }]} />
      <PageHeader title={`Editar ${label}`} description="Atualize os dados deste chamado." />
      <div className="max-w-3xl">
        <TicketForm
          mode="edit"
          assignees={assignees}
          ticket={{ ...ticket, dueAt: ticket.dueAt?.toISOString() ?? null }}
          canManageProject={can(session?.membership?.permissions, "project:read")}
        />
      </div>
    </div>
  );
}
