import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeProjectSession } from "@/lib/auth/project-access";
import { getProjectDetail, listAvailableProjectOwners } from "@/server/services/project-service";
import { ServiceError } from "@/server/services/service-error";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";

export default async function EditarProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const auth = authorizeProjectSession(session, "write");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para editar projetos.
      </Alert>
    );
  }

  let project;
  try {
    project = await getProjectDetail(id);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }

  const owners = await listAvailableProjectOwners();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projetos", href: "/projetos" }, { label: project.name, href: `/projetos/${project.id}` }, { label: "Editar" }]} />
      <PageHeader title={`Editar ${project.name}`} description="Atualize os dados deste projeto." />
      <div className="max-w-3xl">
        <ProjectForm mode="edit" owners={owners} project={project} />
      </div>
    </div>
  );
}
