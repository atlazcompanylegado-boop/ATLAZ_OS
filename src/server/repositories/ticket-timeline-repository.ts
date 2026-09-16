import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { activityEvents, clients, memberships, supportTickets, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { TICKET_TIMELINE_PAGE_SIZE } from "@/lib/validation/ticket";
import { ticketPage } from "./ticket-repository";

export async function listTicketTimeline(db: DbClient, orgId: string, ticketId: string, requestedPage: number) {
  const where = and(eq(activityEvents.orgId, orgId), eq(supportTickets.orgId, orgId), eq(clients.orgId, orgId),
    eq(activityEvents.entityType, "ticket"), eq(supportTickets.id, ticketId));
  const ticketJoin = and(eq(supportTickets.orgId, activityEvents.orgId), eq(supportTickets.id, activityEvents.entityId));
  const clientJoin = and(eq(clients.orgId, supportTickets.orgId), eq(clients.id, supportTickets.clientId));
  const [n] = await db.select({ total: count() }).from(activityEvents).innerJoin(supportTickets, ticketJoin).innerJoin(clients, clientJoin).where(where);
  const total = Number(n?.total ?? 0), pageSize = TICKET_TIMELINE_PAGE_SIZE, page = ticketPage(requestedPage, total, pageSize);
  const rows = await db.select({ id: activityEvents.id, kind: activityEvents.kind, summary: activityEvents.summary,
    actorName: users.fullName, occurredAt: activityEvents.occurredAt })
    .from(activityEvents).innerJoin(supportTickets, ticketJoin).innerJoin(clients, clientJoin)
    .leftJoin(memberships, and(eq(memberships.orgId, orgId), eq(memberships.userId, activityEvents.actorUserId)))
    .leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(where).orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total, page, pageSize };
}
