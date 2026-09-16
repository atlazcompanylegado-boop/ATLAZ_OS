import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Calendar, User, Building2, FolderKanban } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeTicketSession } from "@/lib/auth/ticket-access";
import { can } from "@/config/permissions";
import { getTicketWorkspace } from "@/server/services/ticket-service";
import { ServiceError } from "@/server/services/service-error";
import { parsePositiveInt } from "@/lib/validation/normalize";
import { formatTicketDateTime, formatTicketNumber, isTicketOverdue } from "@/lib/support/format";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketStatusBadge } from "@/components/support/status-badge";
import { TicketPriorityBadge } from "@/components/support/priority-badge";
import { TicketTimeline } from "@/components/support/ticket-timeline";
import { TicketInteractions } from "@/components/support/interactions";
import { TicketStatusActions } from "@/components/support/status-actions";

const TAB_VALUES = ["geral", "interacoes", "timeline"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ChamadoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const session = await getCurrentSession();
  const auth = authorizeTicketSession(session, "read");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para ver esta ficha de chamado.
      </Alert>
    );
  }
  const canWrite = can(session?.membership?.permissions, "ticket:write");
  const canReadProjects = can(session?.membership?.permissions, "project:read");

  const tabParam = typeof sp.tab === "string" ? sp.tab : "geral";
  const activeTab: TabValue = (TAB_VALUES as readonly string[]).includes(tabParam) ? (tabParam as TabValue) : "geral";
  const timelinePage = parsePositiveInt(sp.timelinePage, 1);

  let ticket, timeline, comments;
  try {
    ({ ticket, timeline, comments } = await getTicketWorkspace(id, timelinePage));
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }

  const overdue = isTicketOverdue(ticket.dueAt, ticket.status);
  const label = `${formatTicketNumber(ticket.ticketNumber)} — ${ticket.title}`;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Suporte", href: "/suporte" }, { label }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[26px] text-ink-1">{label}</h1>
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? <TicketStatusActions ticketId={ticket.id} status={ticket.status} version={ticket.version} /> : null}
          {canWrite ? (
            <Button asChild variant="outline">
              <Link href={`/suporte/${ticket.id}/editar`}>
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
              <Link href={`/clientes/${ticket.clientId}`} className="text-accent-strong hover:underline">
                {ticket.clientName}
              </Link>
            }
          />
          <Overview
            icon={FolderKanban}
            label="Projeto"
            value={
              !ticket.hasProject ? (
                "Nenhum"
              ) : ticket.projectName ? (
                canReadProjects ? (
                  <Link href={`/projetos/${ticket.projectId}`} className="text-accent-strong hover:underline">
                    {ticket.projectName}
                  </Link>
                ) : (
                  ticket.projectName
                )
              ) : (
                <span className="italic text-ink-3">Projeto vinculado</span>
              )
            }
          />
          <Overview icon={User} label="Responsável" value={ticket.assigneeName ?? "Sem responsável"} />
          <Overview
            icon={Calendar}
            label="Prazo"
            value={formatTicketDateTime(ticket.dueAt)}
            sub={overdue ? "Atrasado" : undefined}
            subClassName={overdue ? "text-danger" : undefined}
          />
        </CardContent>
        <CardContent className="flex items-center gap-2 border-t border-border p-4 text-xs text-ink-3">
          <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
          Última atualização em {dateFormatter.format(ticket.updatedAt)}
        </CardContent>
      </Card>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="interacoes">Interações</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="geral">
          <VisaoGeral ticket={ticket} overdue={overdue} canReadProjects={canReadProjects} />
        </TabsContent>

        <TabsContent value="interacoes">
          <TicketInteractions ticketId={ticket.id} comments={comments} canComment={canWrite} />
        </TabsContent>

        <TabsContent value="timeline">
          <TicketTimeline ticketId={ticket.id} entries={timeline.rows} total={timeline.total} page={timelinePage} pageSize={timeline.pageSize} />
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
  ticket,
  overdue,
  canReadProjects,
}: {
  ticket: Awaited<ReturnType<typeof getTicketWorkspace>>["ticket"];
  overdue: boolean;
  canReadProjects: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Descrição</h3>
          <p className="whitespace-pre-wrap text-sm text-ink-2">{ticket.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Cliente e Projeto</h3>
          <DataRow label="Cliente" value={ticket.clientName} />
          <DataRow
            label="Projeto"
            value={!ticket.hasProject ? "Nenhum" : ticket.projectName ?? (canReadProjects ? "—" : "Projeto vinculado (sem permissão para detalhes)")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Datas</h3>
          <DataRow label="Prazo" value={formatTicketDateTime(ticket.dueAt)} valueClassName={overdue ? "text-danger" : undefined} />
          <DataRow label="Aberto em" value={formatTicketDateTime(ticket.createdAt)} />
          <DataRow label="Última atualização" value={formatTicketDateTime(ticket.updatedAt)} />
          <DataRow label="Resolvido em" value={ticket.resolvedAt ? formatTicketDateTime(ticket.resolvedAt) : null} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Metadados</h3>
          <DataRow label="Número" value={formatTicketNumber(ticket.ticketNumber)} />
          <DataRow label="Versão" value={String(ticket.version)} />
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
