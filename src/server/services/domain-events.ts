import "server-only";
import { activityEvents, auditLog } from "@/server/db/schema";
import type { Transaction } from "@/server/db/types";
import type { DomainEventKind } from "@/lib/domains/activity";
import type { DomainRow } from "@/server/repositories/domain-repository";

export interface DomainActor { orgId: string; userId: string; membershipId: string; actorLabel: string }

/**
 * Allowlist: nunca serializa request/sessão/linha crua. Nunca inclui o texto de `notes`
 * (Checkpoint A §22, Checkpoint B §34) — só se há observação presente, para diffing seguro.
 * Nunca inclui nome do Projeto — só o ID, quando houver (mesmo contrato de Suporte).
 */
export function serializeDomain(row: DomainRow) {
  return { clientId: row.clientId, projectId: row.projectId, domainName: row.domainName, registrar: row.registrar,
    registrationDate: row.registrationDate, expirationDate: row.expirationDate, autoRenewStatus: row.autoRenewStatus,
    status: row.status, ownerUserId: row.ownerUserId, notesPresent: row.notes !== null, version: row.version };
}
export async function recordDomainEvent(tx: Transaction, actor: DomainActor, domain: DomainRow,
  kind: DomainEventKind, summary: string, change?: { before: unknown; after: unknown }) {
  // payload guarda só o clientId (contexto, nunca autoridade) — nunca nome/detalhe de Projeto,
  // mesmo quando o kind é project_changed (Checkpoint B §51/§56).
  await tx.insert(activityEvents).values({ orgId: actor.orgId, entityType: "domain", entityId: domain.id,
    actorUserId: actor.userId, kind, summary, payload: { clientId: domain.clientId, ...change } });
}
export async function recordDomainAudit(tx: Transaction, actor: DomainActor, after: DomainRow, before?: DomainRow) {
  await tx.insert(auditLog).values({ orgId: actor.orgId, actorUserId: actor.userId, actorLabel: actor.actorLabel,
    entityType: "domain", entityId: after.id, action: before ? "domain.update" : "domain.create",
    before: before ? serializeDomain(before) : null, after: serializeDomain(after),
    context: { clientId: after.clientId, previousVersion: before?.version ?? null, version: after.version } });
}
