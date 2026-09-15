import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { activityEvents, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { CLIENT_TIMELINE_PAGE_SIZE } from "@/lib/validation/client";

export interface ClientTimelineEntry {
  id: string;
  kind: string;
  summary: string;
  actorName: string | null;
  occurredAt: Date;
}

/**
 * `entity_type='client'` — eventos de contato também usam o ID do cliente pai
 * (mesmo contrato da RLS de timeline). `page` é cumulativo (não paginação por
 * offset): "Carregar mais" pede mais uma página inteira desde o início, para que
 * a navegação por link (sem estado client-side) simplesmente mostre mais itens
 * em vez de substituir a janela visível.
 */
export async function listClientTimeline(
  db: DbClient,
  orgId: string,
  clientId: string,
  page: number,
): Promise<{ rows: ClientTimelineEntry[]; total: number; pageSize: number }> {
  const pageSize = CLIENT_TIMELINE_PAGE_SIZE;
  const where = and(eq(activityEvents.orgId, orgId), eq(activityEvents.entityType, "client"), eq(activityEvents.entityId, clientId));

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: activityEvents.id,
        kind: activityEvents.kind,
        summary: activityEvents.summary,
        actorName: users.fullName,
        occurredAt: activityEvents.occurredAt,
      })
      .from(activityEvents)
      .leftJoin(users, eq(users.id, activityEvents.actorUserId))
      .where(where)
      .orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id))
      .limit(page * pageSize),
    db.select({ value: count() }).from(activityEvents).where(where),
  ]);

  return { rows, total: Number(totalRow?.value ?? 0), pageSize };
}
