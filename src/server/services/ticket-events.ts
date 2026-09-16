import "server-only";
import { activityEvents, auditLog } from "@/server/db/schema";
import type { Transaction } from "@/server/db/types";
import type { TicketEventKind } from "@/lib/support/activity";
import type { TicketRow } from "@/server/repositories/ticket-repository";
import type { TicketCommentRow } from "@/server/repositories/ticket-comment-repository";

export interface TicketActor { orgId: string; userId: string; membershipId: string; actorLabel: string }

/** Allowlist: nunca serializa request/sessão/linha crua. Nunca inclui nome do Projeto — só o ID, quando houver. */
export function serializeTicket(row: TicketRow) {
  return { clientId: row.clientId, projectId: row.projectId, title: row.title, description: row.description, status: row.status,
    priority: row.priority, assignedUserId: row.assignedUserId, dueAt: row.dueAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null, version: row.version };
}
export async function recordTicketEvent(tx: Transaction, actor: TicketActor, ticket: TicketRow,
  kind: TicketEventKind, summary: string, change?: { before: unknown; after: unknown }) {
  // payload guarda só o clientId (contexto, nunca autoridade) — nunca nome/detalhe de Projeto, mesmo quando o kind é project_changed.
  await tx.insert(activityEvents).values({ orgId: actor.orgId, entityType: "ticket", entityId: ticket.id,
    actorUserId: actor.userId, kind, summary, payload: { clientId: ticket.clientId, ...change } });
}
export async function recordTicketAudit(tx: Transaction, actor: TicketActor, after: TicketRow, before?: TicketRow) {
  await tx.insert(auditLog).values({ orgId: actor.orgId, actorUserId: actor.userId, actorLabel: actor.actorLabel,
    entityType: "ticket", entityId: after.id, action: before ? "ticket.update" : "ticket.create",
    before: before ? serializeTicket(before) : null, after: serializeTicket(after),
    context: { clientId: after.clientId, previousVersion: before?.version ?? null, version: after.version } });
}
/**
 * Comentário: nunca duplica `content` em `activity_events`/`audit.log` (decisão aprovada no
 * Checkpoint B — ver §2 do pedido). O texto completo mora só em `ticket_comments`.
 */
export async function recordCommentEvent(tx: Transaction, actor: TicketActor, ticket: TicketRow, comment: TicketCommentRow) {
  await tx.insert(activityEvents).values({ orgId: actor.orgId, entityType: "ticket", entityId: ticket.id,
    actorUserId: actor.userId, kind: "ticket.comment_added", summary: "Comentário adicionado",
    payload: { clientId: ticket.clientId, commentId: comment.id } });
}
export async function recordCommentAudit(tx: Transaction, actor: TicketActor, ticket: TicketRow, comment: TicketCommentRow) {
  await tx.insert(auditLog).values({ orgId: actor.orgId, actorUserId: actor.userId, actorLabel: actor.actorLabel,
    entityType: "ticket", entityId: ticket.id, action: "ticket.comment.create",
    before: null, after: { commentId: comment.id, ticketId: ticket.id, authorUserId: comment.authorUserId, createdAt: comment.createdAt.toISOString() },
    context: { clientId: ticket.clientId } });
}
