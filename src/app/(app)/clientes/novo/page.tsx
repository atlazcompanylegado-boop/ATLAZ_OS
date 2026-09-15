import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "@/components/clients/client-form";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeClientSession } from "@/lib/auth/client-access";
import { listAvailableOwners } from "@/server/services/client-service";

export default async function NovoClientePage() {
  const session = await getCurrentSession();
  const auth = authorizeClientSession(session, "write");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para cadastrar clientes.
      </Alert>
    );
  }

  const owners = await listAvailableOwners();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Clientes", href: "/clientes" }, { label: "Novo cliente" }]} />
      <PageHeader title="Novo cliente" description="Cadastre um novo cliente na carteira da Atlaz Company." />
      <div className="max-w-3xl">
        <ClientForm mode="create" owners={owners} />
      </div>
    </div>
  );
}
