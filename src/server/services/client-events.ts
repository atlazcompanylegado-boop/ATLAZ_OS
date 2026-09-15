import "server-only";
import { activityEvents, auditLog } from "@/server/db/schema";
import type { Transaction } from "@/server/db/types";
import type { ClientEventKind } from "@/lib/clients/activity";

/**
 * Produtores de timeline/auditoria de Clientes. Sempre chamados dentro da mesma
 * transação da mutação de negócio (ver docs/clientes-checkpoint-1.md §19–21):
 * se a inserção do evento ou da auditoria falhar, a transação inteira reverte —
 * não existe cliente/contato parcialmente persistido sem seu evento correspondente.
 */
export async function recordClientEvent(
  tx: Transaction,
  params: { orgId: string; clientId: string; kind: ClientEventKind; summary: string; actorUserId: string; payload?: Record<string, unknown> },
) {
  await tx.insert(activityEvents).values({
    orgId: params.orgId,
    entityType: "client",
    entityId: params.clientId,
    kind: params.kind,
    summary: params.summary,
    actorUserId: params.actorUserId,
    payload: params.payload ?? {},
  });
}

/** Nunca grava token, sessão, segredo ou credencial — só o antes/depois de negócio. */
export async function recordClientAudit(
  tx: Transaction,
  params: {
    orgId: string;
    clientId: string;
    actorUserId: string;
    actorLabel: string;
    action: string;
    before?: unknown;
    after?: unknown;
    context?: Record<string, unknown>;
  },
) {
  await tx.insert(auditLog).values({
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    actorLabel: params.actorLabel,
    action: params.action,
    entityType: "client",
    entityId: params.clientId,
    before: params.before ?? null,
    after: params.after ?? null,
    context: params.context ?? {},
  });
}
