import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { activityEvents, clients, domains, memberships, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { DOMAIN_TIMELINE_PAGE_SIZE } from "@/lib/validation/domain";
import { domainPage } from "./domain-repository";

export async function listDomainTimeline(db: DbClient, orgId: string, domainId: string, requestedPage: number) {
  const where = and(eq(activityEvents.orgId, orgId), eq(domains.orgId, orgId), eq(clients.orgId, orgId),
    eq(activityEvents.entityType, "domain"), eq(domains.id, domainId));
  const domainJoin = and(eq(domains.orgId, activityEvents.orgId), eq(domains.id, activityEvents.entityId));
  const clientJoin = and(eq(clients.orgId, domains.orgId), eq(clients.id, domains.clientId));
  const [n] = await db.select({ total: count() }).from(activityEvents).innerJoin(domains, domainJoin).innerJoin(clients, clientJoin).where(where);
  const total = Number(n?.total ?? 0), pageSize = DOMAIN_TIMELINE_PAGE_SIZE, page = domainPage(requestedPage, total, pageSize);
  const rows = await db.select({ id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
    actorName: users.fullName, occurredAt: activityEvents.occurredAt })
    .from(activityEvents).innerJoin(domains, domainJoin).innerJoin(clients, clientJoin)
    .leftJoin(memberships, and(eq(memberships.orgId, orgId), eq(memberships.userId, activityEvents.actorUserId)))
    .leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(where).orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total, page, pageSize };
}
