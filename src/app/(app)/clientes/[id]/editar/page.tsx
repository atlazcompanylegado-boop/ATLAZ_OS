import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeClientSession } from "@/lib/auth/client-access";
import { getClientDetail, listAvailableOwners } from "@/server/services/client-service";
import { ServiceError } from "@/server/services/service-error";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "@/components/clients/client-form";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const auth = authorizeClientSession(session, "write");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para editar clientes.
      </Alert>
    );
  }

  let client;
  try {
    client = await getClientDetail(id);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }

  const owners = await listAvailableOwners();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Clientes", href: "/clientes" }, { label: client.name, href: `/clientes/${client.id}` }, { label: "Editar" }]} />
      <PageHeader title={`Editar ${client.name}`} description="Atualize os dados cadastrais deste cliente." />
      <div className="max-w-3xl">
        <ClientForm mode="edit" owners={owners} client={client} />
      </div>
    </div>
  );
}
