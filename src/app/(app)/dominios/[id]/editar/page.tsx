import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeDomainSession } from "@/lib/auth/domain-access";
import { can } from "@/config/permissions";
import { getDomainDetail, listAvailableDomainOwners } from "@/server/services/domain-service";
import { ServiceError } from "@/server/services/service-error";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { DomainForm } from "@/components/domains/domain-form";

export default async function EditarDominioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const auth = authorizeDomainSession(session, "write");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para editar domínios.
      </Alert>
    );
  }

  let domain;
  try {
    domain = await getDomainDetail(id);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }

  const owners = await listAvailableDomainOwners();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Domínios", href: "/dominios" }, { label: domain.domainName, href: `/dominios/${domain.id}` }, { label: "Editar" }]} />
      <PageHeader title={`Editar ${domain.domainName}`} description="Atualize os dados deste domínio." />
      <div className="max-w-3xl">
        <DomainForm
          mode="edit"
          owners={owners}
          domain={domain}
          canManageProject={can(session?.membership?.permissions, "project:read")}
        />
      </div>
    </div>
  );
}
