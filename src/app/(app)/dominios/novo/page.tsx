import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { DomainForm } from "@/components/domains/domain-form";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeDomainSession } from "@/lib/auth/domain-access";
import { can } from "@/config/permissions";
import { listAvailableDomainOwners, getDomainClient } from "@/server/services/domain-service";
import { ServiceError } from "@/server/services/service-error";
import type { DomainClientOption } from "@/components/domains/client-selector";

export default async function NovoDominioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const auth = authorizeDomainSession(session, "write");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para cadastrar domínios.
      </Alert>
    );
  }

  const sp = await searchParams;
  const clienteParam = typeof sp.cliente === "string" ? sp.cliente : undefined;

  // Pré-seleção vinda da URL nunca é autoridade — revalidada aqui, e o service
  // revalida de novo ao salvar. Se o cliente não existir/não for acessível, apenas
  // ignora a pré-seleção em vez de falhar a página inteira.
  let preselectedClient: DomainClientOption | null = null;
  if (clienteParam) {
    try {
      const client = await getDomainClient(clienteParam);
      preselectedClient = { id: client.id, name: client.name, status: client.status };
    } catch (error) {
      if (!(error instanceof ServiceError && error.code === "invalid_client")) throw error;
    }
  }

  const owners = await listAvailableDomainOwners();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Domínios", href: "/dominios" }, { label: "Novo domínio" }]} />
      <PageHeader title="Novo domínio" description="Cadastre um novo domínio vinculado a um cliente da Atlaz Company." />
      <div className="max-w-3xl">
        <DomainForm
          mode="create"
          owners={owners}
          preselectedClient={preselectedClient}
          canManageProject={can(session?.membership?.permissions, "project:read")}
        />
      </div>
    </div>
  );
}
