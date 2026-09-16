import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Globe, Mail, Calendar, FileText, User } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeClientSession } from "@/lib/auth/client-access";
import { authorizeProjectSession } from "@/lib/auth/project-access";
import { can } from "@/config/permissions";
import { getClientWorkspace, type ClientWorkspace } from "@/server/services/client-service";
import { listProjects } from "@/server/services/project-service";
import { ServiceError } from "@/server/services/service-error";
import { parsePositiveInt } from "@/lib/validation/normalize";
import { PERSON_TYPE_LABELS } from "@/lib/validation/client";
import { formatDocumentForDisplay } from "@/lib/validation/document";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientStatusBadge } from "@/components/clients/status-badge";
import { ContactManager } from "@/components/clients/contact-manager";
import { ClientTimeline } from "@/components/clients/client-timeline";
import { ClientProjectsTab, ClientProjectsForbidden } from "@/components/projects/client-projects-tab";

const TAB_VALUES = ["geral", "contatos", "projetos", "suporte", "dominios", "infraestrutura", "timeline"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const FUTURE_MODULE_COPY: Partial<Record<TabValue, string>> = {
  suporte: "Os chamados deste cliente aparecerão aqui quando o módulo Suporte for habilitado.",
  dominios: "Os domínios associados a este cliente aparecerão aqui quando o módulo Domínios for habilitado.",
  infraestrutura: "Os recursos de infraestrutura deste cliente aparecerão aqui quando o módulo Infraestrutura for habilitado.",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function ClienteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const session = await getCurrentSession();
  const auth = authorizeClientSession(session, "read");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para ver esta ficha de cliente.
      </Alert>
    );
  }
  const canWrite = can(session?.membership?.permissions, "client:write");

  const tabParam = typeof sp.tab === "string" ? sp.tab : "geral";
  const activeTab: TabValue = (TAB_VALUES as readonly string[]).includes(tabParam) ? (tabParam as TabValue) : "geral";
  const timelinePage = parsePositiveInt(sp.timelinePage, 1);
  const projectsPage = parsePositiveInt(sp.projetosPage, 1);

  let client: ClientWorkspace["client"], contacts: ClientWorkspace["contacts"], timeline: ClientWorkspace["timeline"];
  try {
    ({ client, contacts, timeline } = await getClientWorkspace(id, timelinePage));
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }
  const primaryContact = contacts.find((c) => c.isPrimary) ?? null;
  const formattedDocument = formatDocumentForDisplay(client.personType, client.document);

  // Permissões cruzadas: `client:read` (já garantido acima) não implica `project:read`.
  // Sem os dois, a aba nunca consulta/mostra dados de Projetos (ver Checkpoint C §38).
  const canReadProjects = authorizeProjectSession(session, "read").ok;
  const canWriteProjects = canReadProjects && can(session?.membership?.permissions, "project:write");
  const projects = canReadProjects ? await listProjects({ clientId: client.id, page: projectsPage }) : null;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Clientes", href: "/clientes" }, { label: client.name }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[26px] text-ink-1">{client.name}</h1>
          <ClientStatusBadge status={client.status} />
        </div>
        {canWrite ? (
          <Button asChild variant="outline">
            <Link href={`/clientes/${client.id}/editar`}>
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
              Editar
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <Overview icon={User} label="Contato principal" value={primaryContact ? primaryContact.name : "Nenhum"} sub={primaryContact?.email ?? primaryContact?.phone ?? undefined} />
          <Overview icon={FileText} label="Documento" value={formattedDocument ?? "Não informado"} sub={client.personType ? PERSON_TYPE_LABELS[client.personType] : undefined} />
          <Overview icon={Mail} label="Responsável" value={client.ownerName ?? "Sem responsável"} />
          <Overview
            icon={Globe}
            label="Site"
            value={client.website ? <a href={client.website} target="_blank" rel="noreferrer" className="text-accent-strong hover:underline">{client.website}</a> : "Não informado"}
          />
        </CardContent>
        <CardContent className="flex items-center gap-2 border-t border-border p-4 text-xs text-ink-3">
          <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
          Última atualização em {dateFormatter.format(client.updatedAt)}
        </CardContent>
      </Card>

      <Tabs defaultValue={activeTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="contatos">Contatos</TabsTrigger>
          <TabsTrigger value="projetos">Projetos</TabsTrigger>
          <TabsTrigger value="suporte">Suporte</TabsTrigger>
          <TabsTrigger value="dominios">Domínios</TabsTrigger>
          <TabsTrigger value="infraestrutura">Infraestrutura</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="geral">
          <VisaoGeral client={client} primaryContact={primaryContact} />
        </TabsContent>

        <TabsContent value="contatos">
          <ContactManager clientId={client.id} contacts={contacts} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="projetos">
          {projects ? (
            <ClientProjectsTab
              clientId={client.id}
              rows={projects.rows}
              total={projects.total}
              page={projects.page}
              pageSize={projects.pageSize}
              canWrite={canWriteProjects}
            />
          ) : (
            <ClientProjectsForbidden />
          )}
        </TabsContent>

        {(["suporte", "dominios", "infraestrutura"] as const).map((tab) => (
          <TabsContent key={tab} value={tab}>
            <EmptyState title="Ainda não disponível" description={FUTURE_MODULE_COPY[tab]} />
          </TabsContent>
        ))}

        <TabsContent value="timeline">
          <ClientTimeline clientId={client.id} entries={timeline.rows} total={timeline.total} page={timelinePage} pageSize={timeline.pageSize} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Overview({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        {label}
      </p>
      <p className="truncate text-sm text-ink-1">{value}</p>
      {sub ? <p className="truncate text-xs text-ink-3">{sub}</p> : null}
    </div>
  );
}

function VisaoGeral({
  client,
  primaryContact,
}: {
  client: ClientWorkspace["client"];
  primaryContact: ClientWorkspace["contacts"][number] | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Dados cadastrais</h3>
          <DataRow label="Nome fantasia" value={client.tradeName} />
          <DataRow label="Razão social" value={client.legalName} />
          <DataRow label="Tipo de pessoa" value={client.personType ? PERSON_TYPE_LABELS[client.personType] : null} />
          <DataRow label="Documento" value={formatDocumentForDisplay(client.personType, client.document)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Contato principal</h3>
          {primaryContact ? (
            <>
              <DataRow label="Nome" value={primaryContact.name} />
              <DataRow label="Cargo" value={primaryContact.jobTitle} />
              <DataRow label="E-mail" value={primaryContact.email} />
              <DataRow label="Telefone" value={primaryContact.phone} />
              <DataRow label="WhatsApp" value={primaryContact.whatsapp} />
            </>
          ) : (
            <p className="text-sm text-ink-2">Nenhum contato principal definido.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Gestão</h3>
          <DataRow label="Origem" value={client.source} />
          <DataRow label="Responsável" value={client.ownerName} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Observações</h3>
          <p className="whitespace-pre-wrap text-sm text-ink-2">{client.notes || "Nenhuma observação registrada."}</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Metadados</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DataRow label="Criado em" value={dateFormatter.format(client.createdAt)} />
            <DataRow label="Última atualização" value={dateFormatter.format(client.updatedAt)} />
            <DataRow label="Versão" value={String(client.version)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-3">{label}</span>
      <span className="truncate text-right text-ink-1">{value || "—"}</span>
    </div>
  );
}
