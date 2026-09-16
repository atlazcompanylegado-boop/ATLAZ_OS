import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { activityEvents, clients, memberships, projects, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { PROJECT_TIMELINE_PAGE_SIZE } from "@/lib/validation/project";
import { projectPage } from "./project-repository";

export async function listProjectTimeline(db: DbClient, orgId: string, projectId: string, requestedPage: number) {
  const where = and(eq(activityEvents.orgId, orgId), eq(projects.orgId, orgId), eq(clients.orgId, orgId),
    eq(activityEvents.entityType, "project"), eq(projects.id, projectId));
  const projectJoin = and(eq(projects.orgId, activityEvents.orgId), eq(projects.id, activityEvents.entityId));
  const clientJoin = and(eq(clients.orgId, projects.orgId), eq(clients.id, projects.clientId));
  const [n] = await db.select({ total: count() }).from(activityEvents).innerJoin(projects, projectJoin).innerJoin(clients, clientJoin).where(where);
  const total = Number(n?.total ?? 0), pageSize = PROJECT_TIMELINE_PAGE_SIZE, page = projectPage(requestedPage, total, pageSize);
  const rows = await db.select({ id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
    actorName: users.fullName, occurredAt: activityEvents.occurredAt })
    .from(activityEvents).innerJoin(projects, projectJoin).innerJoin(clients, clientJoin)
    .leftJoin(memberships, and(eq(memberships.orgId, orgId), eq(memberships.userId, activityEvents.actorUserId)))
    .leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(where).orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total, page, pageSize };
}
