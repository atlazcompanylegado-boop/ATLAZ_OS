import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeProjectSession } from "@/lib/auth/project-access";
import { listAvailableProjectOwners, getProjectClient } from "@/server/services/project-service";
import { ServiceError } from "@/server/services/service-error";
import type { ClientOption } from "@/components/projects/client-selector";

export default async function NovoProjetoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const auth = authorizeProjectSession(session, "write");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para cadastrar projetos.
      </Alert>
    );
  }

  const sp = await searchParams;
  const clienteParam = typeof sp.cliente === "string" ? sp.cliente : undefined;

  // Pré-seleção vinda da URL nunca é autoridade — revalidada aqui, e o service
  // revalida de novo ao salvar. Se o cliente não existir/não for acessível, apenas
  // ignora a pré-seleção em vez de falhar a página inteira.
  let preselectedClient: ClientOption | null = null;
  if (clienteParam) {
    try {
      const client = await getProjectClient(clienteParam);
      preselectedClient = { id: client.id, name: client.name, status: client.status };
    } catch (error) {
      if (!(error instanceof ServiceError && error.code === "invalid_client")) throw error;
    }
  }

  const owners = await listAvailableProjectOwners();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projetos", href: "/projetos" }, { label: "Novo projeto" }]} />
      <PageHeader title="Novo projeto" description="Cadastre um novo projeto vinculado a um cliente da Atlaz Company." />
      <div className="max-w-3xl">
        <ProjectForm mode="create" owners={owners} preselectedClient={preselectedClient} />
      </div>
    </div>
  );
}
