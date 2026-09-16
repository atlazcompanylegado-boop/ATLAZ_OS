import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { activityEvents, projects, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { CLIENT_TIMELINE_PAGE_SIZE } from "@/lib/validation/client";

export interface ClientTimelineEntry {
  id: string;
  kind: string;
  summary: string;
  actorName: string | null;
  occurredAt: Date;
  /** Nome do projeto quando o evento é de Projetos (null para eventos do próprio Cliente). */
  projectName: string | null;
}

/**
 * `entity_type='client'` — eventos de contato também usam o ID do cliente pai
 * (mesmo contrato da RLS de timeline). `page` é cumulativo (não paginação por
 * offset): "Carregar mais" pede mais uma página inteira desde o início, para que
 * a navegação por link (sem estado client-side) simplesmente mostre mais itens
 * em vez de substituir a janela visível.
 *
 * `includeProjectEvents` consolida, na leitura, eventos de Projetos do próprio
 * Cliente (`entity_type='project'`) via UNION ALL com um INNER JOIN em `projects`
 * — nunca confia em `payload.clientId` (não é autoridade): o vínculo real é
 * `projects.org_id = orgId AND projects.client_id = clientId AND projects.id =
 * activity_events.entity_id`. Projeto órfão (sem linha correspondente),
 * cross-org ou de outro cliente nunca casa o JOIN e é omitido, sem precisar de
 * filtro adicional. `includeProjectEvents=false` (chamador sem `project:read`)
 * mantém exatamente o comportamento anterior — nenhuma linha de Projetos é
 * sequer construída, muito menos consultada. Nada é duplicado como
 * `entity_type='client'`: os producers de Projetos continuam gravando só
 * `entity_type='project'` (ver src/server/services/project-events.ts).
 * A paginação/ordenação ocorre sobre o fluxo já unido (uma única consulta ao
 * banco), nunca em duas janelas de `pageSize` somadas em memória.
 */
export async function listClientTimeline(
  db: DbClient,
  orgId: string,
  clientId: string,
  page: number,
  includeProjectEvents = false,
): Promise<{ rows: ClientTimelineEntry[]; total: number; pageSize: number }> {
  const pageSize = CLIENT_TIMELINE_PAGE_SIZE;
  const limit = page * pageSize;
  const clientWhere = and(eq(activityEvents.orgId, orgId), eq(activityEvents.entityType, "client"), eq(activityEvents.entityId, clientId));

  if (!includeProjectEvents) {
    const [rows, [totalRow]] = await Promise.all([
      db.select({
        id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
        actorName: users.fullName, occurredAt: activityEvents.occurredAt,
        projectName: sql<string | null>`null::text`,
      }).from(activityEvents).leftJoin(users, eq(users.id, activityEvents.actorUserId))
        .where(clientWhere).orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id)).limit(limit),
      db.select({ value: count() }).from(activityEvents).where(clientWhere),
    ]);
    return { rows, total: Number(totalRow?.value ?? 0), pageSize };
  }

  const clientEvents = db.select({
    id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
    actorName: users.fullName, occurredAt: activityEvents.occurredAt,
    projectName: sql<string | null>`null::text`.as("projectName"),
  }).from(activityEvents).leftJoin(users, eq(users.id, activityEvents.actorUserId)).where(clientWhere);

  const projectJoin = and(eq(projects.orgId, activityEvents.orgId), eq(projects.id, activityEvents.entityId));
  const projectEvents = db.select({
    id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
    actorName: users.fullName, occurredAt: activityEvents.occurredAt,
    projectName: projects.name,
  }).from(activityEvents)
    .innerJoin(projects, projectJoin)
    .leftJoin(users, eq(users.id, activityEvents.actorUserId))
    .where(and(eq(activityEvents.orgId, orgId), eq(activityEvents.entityType, "project"), eq(projects.orgId, orgId), eq(projects.clientId, clientId)));

  const combined = unionAll(clientEvents, projectEvents).as("client_timeline_combined");

  const [rows, [totalRow]] = await Promise.all([
    db.select({
      id: combined.id, kind: combined.kind, summary: combined.summary,
      actorName: combined.actorName, occurredAt: combined.occurredAt, projectName: combined.projectName,
    }).from(combined).orderBy(desc(combined.occurredAt), desc(combined.id)).limit(limit),
    db.select({ value: count() }).from(combined),
  ]);
  return { rows, total: Number(totalRow?.value ?? 0), pageSize };
}
