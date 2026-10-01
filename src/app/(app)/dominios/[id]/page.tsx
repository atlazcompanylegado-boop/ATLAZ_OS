import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Calendar, User, Building2, FolderKanban, Repeat } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeDomainSession } from "@/lib/auth/domain-access";
import { can } from "@/config/permissions";
import { getDomainWorkspace } from "@/server/services/domain-service";
import { ServiceError } from "@/server/services/service-error";
import { parsePositiveInt } from "@/lib/validation/normalize";
import { domainNameToUnicode } from "@/lib/validation/domain-normalize";
import { formatDomainDate, formatDomainDaysLabel, domainExpirationState } from "@/lib/domains/format";
import { DOMAIN_AUTO_RENEW_LABELS } from "@/lib/validation/domain";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DomainStatusBadge } from "@/components/domains/status-badge";
import { DomainExpirationBadge } from "@/components/domains/expiration-badge";
import { DomainTimeline } from "@/components/domains/domain-timeline";
import { DomainStatusActions } from "@/components/domains/status-actions";

const TAB_VALUES = ["geral", "timeline"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const dateOnlyFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function DominioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const session = await getCurrentSession();
  const auth = authorizeDomainSession(session, "read");
  if (!auth.ok) {
    return (
      <Alert variant="warning" title="Sem acesso">
        Você não tem permissão para ver esta ficha de domínio.
      </Alert>
    );
  }
  const canWrite = can(session?.membership?.permissions, "domain:write");
  const canReadProjects = can(session?.membership?.permissions, "project:read");

  const tabParam = typeof sp.tab === "string" ? sp.tab : "geral";
  const activeTab: TabValue = (TAB_VALUES as readonly string[]).includes(tabParam) ? (tabParam as TabValue) : "geral";
  const timelinePage = parsePositiveInt(sp.timelinePage, 1);

  let domain, timeline;
  try {
    ({ domain, timeline } = await getDomainWorkspace(id, timelinePage));
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") notFound();
    throw error;
  }

  const unicodeName = domainNameToUnicode(domain.domainName);
  const showAscii = unicodeName !== domain.domainName;
  const label = unicodeName;
  const expirationState = domainExpirationState(domain.expirationDate, domain.status);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Domínios", href: "/dominios" }, { label }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[26px] text-ink-1">{label}</h1>
          {showAscii ? <span className="text-sm text-ink-3">({domain.domainName})</span> : null}
          <DomainStatusBadge status={domain.status} />
          <DomainExpirationBadge expirationDate={domain.expirationDate} status={domain.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? <DomainStatusActions domainId={domain.id} status={domain.status} version={domain.version} /> : null}
          {canWrite ? (
            <Button asChild variant="outline">
              <Link href={`/dominios/${domain.id}/editar`}>
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
              <Link href={`/clientes/${domain.clientId}`} className="text-accent-strong hover:underline">
                {domain.clientName}
              </Link>
            }
          />
          <Overview
            icon={FolderKanban}
            label="Projeto"
            value={
              !domain.hasProject ? (
                "Nenhum"
              ) : domain.projectName ? (
                canReadProjects ? (
                  <Link href={`/projetos/${domain.projectId}`} className="text-accent-strong hover:underline">
                    {domain.projectName}
                  </Link>
                ) : (
                  domain.projectName
                )
              ) : (
                <span className="italic text-ink-3">Projeto vinculado</span>
              )
            }
          />
          <Overview icon={User} label="Responsável" value={domain.ownerName ?? "Sem responsável"} />
          <Overview
            icon={Calendar}
            label="Vencimento"
            value={formatDomainDate(domain.expirationDate)}
            sub={formatDomainDaysLabel(domain.expirationDate, domain.status)}
            subClassName={expirationState === "expired" ? "text-danger" : undefined}
          />
        </CardContent>
        <CardContent className="flex items-center gap-2 border-t border-border p-4 text-xs text-ink-3">
          <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
          Última atualização em {dateFormatter.format(domain.updatedAt)}
        </CardContent>
      </Card>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="geral">
          <VisaoGeral domain={domain} canReadProjects={canReadProjects} />
        </TabsContent>

        <TabsContent value="timeline">
          <DomainTimeline domainId={domain.id} entries={timeline.rows} total={timeline.total} page={timelinePage} pageSize={timeline.pageSize} />
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
  domain,
  canReadProjects,
}: {
  domain: Awaited<ReturnType<typeof getDomainWorkspace>>["domain"];
  canReadProjects: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-1">
            <Repeat className="h-4 w-4" strokeWidth={1.5} />
            Renovação
          </h3>
          <DataRow label="Vencimento" value={formatDomainDate(domain.expirationDate)} />
          <DataRow label="Situação" value={formatDomainDaysLabel(domain.expirationDate, domain.status)} />
          <DataRow label="Renovação automática" value={DOMAIN_AUTO_RENEW_LABELS[domain.autoRenewStatus]} />
          <DataRow label="Registrador" value={domain.registrar} />
          <DataRow label="Responsável" value={domain.ownerName} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Vínculos</h3>
          <DataRow label="Cliente" value={domain.clientName} />
          <DataRow
            label="Projeto"
            value={!domain.hasProject ? "Nenhum" : domain.projectName ?? (canReadProjects ? "—" : "Projeto vinculado (sem permissão para detalhes)")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Registro</h3>
          <DataRow label="Data de registro" value={formatDomainDate(domain.registrationDate)} />
          <DataRow label="Cadastrado em" value={dateOnlyFormatter.format(domain.createdAt)} />
          <DataRow label="Versão" value={String(domain.version)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-ink-1">Observações</h3>
          <p className="whitespace-pre-wrap text-sm text-ink-2">{domain.notes || "Nenhuma observação registrada."}</p>
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
