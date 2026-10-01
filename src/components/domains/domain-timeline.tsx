import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { translateDomainEventKind } from "@/lib/domains/activity";
import { Pagination } from "@/components/clients/pagination";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

interface DomainTimelineEntry {
  id: string;
  kind: string;
  summary: string;
  actorName: string | null;
  occurredAt: Date;
}

/** Server Component — nunca mostra `kind` cru, UUID ou payload JSON (mesmo contrato de Clientes/Projetos/Suporte). */
export function DomainTimeline({
  domainId,
  entries,
  total,
  page,
  pageSize,
}: {
  domainId: string;
  entries: DomainTimelineEntry[];
  total: number;
  page: number;
  pageSize: number;
}) {
  if (entries.length === 0) {
    return <EmptyState icon={History} title="Nenhuma atividade ainda" description="As mudanças neste domínio aparecerão aqui." />;
  }

  function buildHref(targetPage: number) {
    return `/dominios/${domainId}?tab=timeline&timelinePage=${targetPage}`;
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-4 border-l border-border pl-5">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface-1 bg-accent" />
            <p className="text-sm font-medium text-ink-1">{translateDomainEventKind(entry.kind)}</p>
            {entry.summary ? <p className="text-sm text-ink-2">{entry.summary}</p> : null}
            <p className="mt-0.5 text-xs text-ink-3">
              {entry.actorName ?? "Sistema"} · {dateFormatter.format(entry.occurredAt)}
            </p>
          </li>
        ))}
      </ol>
      <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
    </div>
  );
}
