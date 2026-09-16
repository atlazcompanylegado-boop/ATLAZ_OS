import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { activityEvents, projects, supportTickets, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { CLIENT_TIMELINE_PAGE_SIZE } from "@/lib/validation/client";

export interface ClientTimelineEntry {
  id: string;
  kind: string;
  summary: string;
  actorName: string | null;
  occurredAt: Date;
  /** Nome do projeto quando o evento é de Projetos (null para os demais tipos). */
  projectName: string | null;
  /** Número humano do chamado quando o evento é de Suporte (null para os demais tipos). */
  ticketNumber: number | null;
}

const NULL_TEXT = sql<string | null>`null::text`;
const NULL_BIGINT = sql<number | null>`null::bigint`;

/**
 * `entity_type='client'` — eventos de contato também usam o ID do cliente pai
 * (mesmo contrato da RLS de timeline). `page` é cumulativo (não paginação por
 * offset): "Carregar mais" pede mais uma página inteira desde o início, para que
 * a navegação por link (sem estado client-side) simplesmente mostre mais itens
 * em vez de substituir a janela visível.
 *
 * `includeProjectEvents`/`includeTicketEvents` consolidam, na leitura, eventos de
 * Projetos (`entity_type='project'`) e de Suporte (`entity_type='ticket'`) do
 * próprio Cliente via UNION ALL com INNER JOIN em `projects`/`support_tickets` —
 * nunca confiam em `payload.clientId` (não é autoridade): o vínculo real é
 * `<tabela>.org_id = orgId AND <tabela>.client_id = clientId AND <tabela>.id =
 * activity_events.entity_id`. Evento órfão, cross-org ou de outro cliente nunca
 * casa o JOIN e é omitido, sem precisar de filtro adicional. Cada flag em `false`
 * (chamador sem `project:read`/`ticket:read`) mantém exatamente o comportamento
 * anterior — nenhuma linha extra é sequer construída, muito menos consultada.
 * Nada é duplicado como `entity_type='client'`: os producers de Projetos/Suporte
 * continuam gravando só o próprio `entity_type`. A paginação/ordenação ocorre
 * sobre o fluxo já unido (uma única consulta ao banco), nunca em janelas de
 * `pageSize` por fonte somadas em memória.
 */
export async function listClientTimeline(
  db: DbClient,
  orgId: string,
  clientId: string,
  page: number,
  includeProjectEvents = false,
  includeTicketEvents = false,
): Promise<{ rows: ClientTimelineEntry[]; total: number; pageSize: number }> {
  const pageSize = CLIENT_TIMELINE_PAGE_SIZE;
  const limit = page * pageSize;
  const clientWhere = and(eq(activityEvents.orgId, orgId), eq(activityEvents.entityType, "client"), eq(activityEvents.entityId, clientId));

  const clientEvents = db.select({
    id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
    actorName: users.fullName, occurredAt: activityEvents.occurredAt,
    projectName: NULL_TEXT.as("projectName"), ticketNumber: NULL_BIGINT.as("ticketNumber"),
  }).from(activityEvents).leftJoin(users, eq(users.id, activityEvents.actorUserId)).where(clientWhere);

  if (!includeProjectEvents && !includeTicketEvents) {
    const [rows, [totalRow]] = await Promise.all([
      clientEvents.orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id)).limit(limit),
      db.select({ value: count() }).from(activityEvents).where(clientWhere),
    ]);
    return { rows, total: Number(totalRow?.value ?? 0), pageSize };
  }

  const projectJoin = and(eq(projects.orgId, activityEvents.orgId), eq(projects.id, activityEvents.entityId));
  const projectEvents = db.select({
    id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
    actorName: users.fullName, occurredAt: activityEvents.occurredAt,
    projectName: projects.name, ticketNumber: NULL_BIGINT.as("ticketNumber"),
  }).from(activityEvents).innerJoin(projects, projectJoin).leftJoin(users, eq(users.id, activityEvents.actorUserId))
    .where(and(eq(activityEvents.orgId, orgId), eq(activityEvents.entityType, "project"), eq(projects.orgId, orgId), eq(projects.clientId, clientId)));

  const ticketJoin = and(eq(supportTickets.orgId, activityEvents.orgId), eq(supportTickets.id, activityEvents.entityId));
  const ticketEvents = db.select({
    id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
    actorName: users.fullName, occurredAt: activityEvents.occurredAt,
    projectName: NULL_TEXT.as("projectName"), ticketNumber: supportTickets.ticketNumber,
  }).from(activityEvents).innerJoin(supportTickets, ticketJoin).leftJoin(users, eq(users.id, activityEvents.actorUserId))
    .where(and(eq(activityEvents.orgId, orgId), eq(activityEvents.entityType, "ticket"), eq(supportTickets.orgId, orgId), eq(supportTickets.clientId, clientId)));

  const combined = includeProjectEvents && includeTicketEvents ? unionAll(clientEvents, projectEvents, ticketEvents)
    : includeProjectEvents ? unionAll(clientEvents, projectEvents)
    : unionAll(clientEvents, ticketEvents);
  const union = combined.as("client_timeline_combined");

  const [rows, [totalRow]] = await Promise.all([
    db.select({
      id: union.id, kind: union.kind, summary: union.summary,
      actorName: union.actorName, occurredAt: union.occurredAt, projectName: union.projectName, ticketNumber: union.ticketNumber,
    }).from(union).orderBy(desc(union.occurredAt), desc(union.id)).limit(limit),
    db.select({ value: count() }).from(union),
  ]);
  return { rows, total: Number(totalRow?.value ?? 0), pageSize };
}
