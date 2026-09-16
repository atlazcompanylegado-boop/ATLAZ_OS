import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { ticketComments, users } from "@/server/db/schema";
import type { DbClient, Transaction } from "@/server/db/types";

export type TicketCommentRow = typeof ticketComments.$inferSelect;

/** Imutável: só INSERT/SELECT existem — sem update/delete (ver docs/suporte-checkpoint-a.md §11). Ordem cronológica ascendente (conversa, não auditoria). */
export async function listTicketComments(db: DbClient, orgId: string, ticketId: string) {
  return db.select({ id: ticketComments.id, content: ticketComments.content, authorName: users.fullName, createdAt: ticketComments.createdAt })
    .from(ticketComments).leftJoin(users, eq(users.id, ticketComments.authorUserId))
    .where(and(eq(ticketComments.orgId, orgId), eq(ticketComments.ticketId, ticketId)))
    .orderBy(asc(ticketComments.createdAt), asc(ticketComments.id));
}
export async function createTicketComment(tx: Transaction, orgId: string, ticketId: string, authorUserId: string, content: string) {
  const [row] = await tx.insert(ticketComments).values({ orgId, ticketId, authorUserId, content }).returning();
  return row!;
}
