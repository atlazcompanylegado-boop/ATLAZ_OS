import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { translateClientEventKind } from "@/lib/clients/activity";
import { translateProjectEventKind } from "@/lib/projects/activity";
import { translateTicketEventKind } from "@/lib/support/activity";
import { formatTicketNumber } from "@/lib/support/format";
import type { ClientTimelineEntry } from "@/server/repositories/client-timeline-repository";

/** Título traduzido do evento — mesmo helper usado na Timeline do próprio Projeto/Chamado, nunca uma segunda tradução. */
function timelineTitle(entry: ClientTimelineEntry): string {
  if (entry.projectName) return `${entry.projectName} — ${translateProjectEventKind(entry.kind)}`;
  if (entry.ticketNumber !== null) return `Chamado ${formatTicketNumber(entry.ticketNumber)} — ${translateTicketEventKind(entry.kind)}`;
  return translateClientEventKind(entry.kind);
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Server Component — a timeline nunca mostra `kind` cru, UUID ou payload JSON
 * (ver docs/clientes-checkpoint-1.md §50). "Carregar mais" navega para a mesma
 * página com `timelinePage` incrementado (sem infinite scroll).
 */
export function ClientTimeline({
  clientId,
  entries,
  total,
  page,
  pageSize,
}: {
  clientId: string;
  entries: ClientTimelineEntry[];
  total: number;
  page: number;
  pageSize: number;
}) {
  if (entries.length === 0) {
    return <EmptyState icon={History} title="Nenhuma atividade ainda" description="As mudanças neste cliente aparecerão aqui." />;
  }

  const hasMore = page * pageSize < total;

  return (
    <div className="space-y-4">
      <ol className="space-y-4 border-l border-border pl-5">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface-1 bg-accent" />
            <p className="text-sm font-medium text-ink-1">{timelineTitle(entry)}</p>
            {entry.summary ? <p className="text-sm text-ink-2">{entry.summary}</p> : null}
            <p className="mt-0.5 text-xs text-ink-3">
              {entry.actorName ?? "Sistema"} · {dateFormatter.format(entry.occurredAt)}
            </p>
          </li>
        ))}
      </ol>
      {hasMore ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`/clientes/${clientId}?tab=timeline&timelinePage=${page + 1}`}>Carregar mais</Link>
        </Button>
      ) : null}
    </div>
  );
}
