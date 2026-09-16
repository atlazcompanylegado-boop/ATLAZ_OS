import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Calendar, User, Building2, Percent } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeProjectSession } from "@/lib/auth/project-access";
import { can } from "@/config/permissions";
import { getProjectWorkspace } from "@/server/services/project-service";
import { ServiceError } from "@/server/services/service-error";
import { parsePositiveInt } from "@/lib/validation/normalize";
import { formatProjectDate, isProjectOverdue } from "@/lib/projects/format";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { ProjectPriorityBadge } from "@/components/projects/priority-badge";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { ProjectStatusActions } from "@/components/projects/status-actions";

const TAB_VALUES = ["geral", "timeline"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function ProjetoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const session = await getCurrentSession();
  const auth = authorizeProjectSession(session, "read");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para ver esta ficha de projeto.
      </Alert>
    );
  }
  const canWrite = can(session?.membership?.permissions, "project:write");
  const canReadClients = can(session?.membership?.permissions, "client:read");

  const tabParam = typeof sp.tab === "string" ? sp.tab : "geral";
  const activeTab: TabValue = (TAB_VALUES as readonly string[]).includes(tabParam) ? (tabParam as TabValue) : "geral";
  const timelinePage = parsePositiveInt(sp.timelinePage, 1);

  let project, timeline;
  try {
    ({ project, timeline } = await getProjectWorkspace(id, timelinePage));
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }

  const overdue = isProjectOverdue(project.dueDate, project.status);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projetos", href: "/projetos" }, { label: project.name }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[26px] text-ink-1">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
          <ProjectPriorityBadge priority={project.priority} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? <ProjectStatusActions projectId={project.id} status={project.status} version={project.version} /> : null}
          {canWrite ? (
            <Button asChild variant="outline">
              <Link href={`/projetos/${project.id}/editar`}>
                <Pencil className="h-4 w-4" strokeWidth={1.5} />
                Editar
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <Overview
            icon={Building2}
            label="Cliente"
            value={
              canReadClients ? (
                <Link href={`/clientes/${project.clientId}`} className="text-accent-strong hover:underline">
                  {project.clientName}
                </Link>
              ) : (
                project.clientName
              )
            }
          />
          <Overview icon={User} label="Responsável" value={project.ownerName ?? "Sem responsável"} />
          <Overview
            icon={Calendar}
            label="Prazo"
            value={formatProjectDate(project.dueDate)}
            sub={overdue ? "Atrasado" : undefined}
            subClassName={overdue ? "text-danger" : undefined}
          />
          <Overview icon={Percent} label="Progresso" value={project.progress === null ? "Não informado" : `${project.progress}%`} />
        </CardContent>
        <CardContent className="flex items-center gap-2 border-t border-border p-4 text-xs text-ink-3">
          <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
          Última atualização em {dateFormatter.format(project.updatedAt)}
        </CardContent>
      </Card>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="geral">
          <VisaoGeral project={project} overdue={overdue} />
        </TabsContent>

        <TabsContent value="timeline">
          <ProjectTimeline projectId={project.id} entries={timeline.rows} total={timeline.total} page={timelinePage} pageSize={timeline.pageSize} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Overview({
  icon: Icon,
  label,
  value,
  sub,
  subClassName,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
  subClassName?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        {label}
      </p>
      <p className="truncate text-sm text-ink-1">{value}</p>
      {sub ? <p className={`truncate text-xs ${subClassName ?? "text-ink-3"}`}>{sub}</p> : null}
    </div>
  );
}

function VisaoGeral({
  project,
  overdue,
}: {
  project: Awaited<ReturnType<typeof getProjectWorkspace>>["project"];
  overdue: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Descrição</h3>
          <p className="whitespace-pre-wrap text-sm text-ink-2">{project.description || "Nenhuma descrição registrada."}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Datas</h3>
          <DataRow label="Início" value={formatProjectDate(project.startDate)} />
          <DataRow label="Prazo" value={formatProjectDate(project.dueDate)} valueClassName={overdue ? "text-danger" : undefined} />
          <DataRow label="Concluído em" value={project.completedAt ? dateFormatter.format(project.completedAt) : null} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Metadados</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DataRow label="Criado em" value={dateFormatter.format(project.createdAt)} />
            <DataRow label="Última atualização" value={dateFormatter.format(project.updatedAt)} />
            <DataRow label="Versão" value={String(project.version)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DataRow({ label, value, valueClassName }: { label: string; value: string | null | undefined; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-3">{label}</span>
      <span className={`truncate text-right text-ink-1 ${valueClassName ?? ""}`}>{value || "—"}</span>
    </div>
  );
}
