import "server-only";
import { activityEvents, auditLog } from "@/server/db/schema";
import type { Transaction } from "@/server/db/types";
import type { ProjectEventKind } from "@/lib/projects/activity";
import type { ProjectRow } from "@/server/repositories/project-repository";

export interface ProjectActor { orgId: string; userId: string; membershipId: string; actorLabel: string }
/** Allowlist: never serialize a request, session or raw database row. */
export function serializeProject(row: ProjectRow) {
  return { clientId: row.clientId, name: row.name, description: row.description, status: row.status, priority: row.priority,
    ownerUserId: row.ownerUserId, startDate: row.startDate, dueDate: row.dueDate, progress: row.progress,
    completedAt: row.completedAt?.toISOString() ?? null, version: row.version };
}
export async function recordProjectEvent(tx: Transaction, actor: ProjectActor, project: ProjectRow,
  kind: ProjectEventKind, summary: string, change?: { before: unknown; after: unknown }) {
  await tx.insert(activityEvents).values({ orgId: actor.orgId, entityType: "project", entityId: project.id,
    actorUserId: actor.userId, kind, summary, payload: { clientId: project.clientId, ...change } });
}
export async function recordProjectAudit(tx: Transaction, actor: ProjectActor, after: ProjectRow, before?: ProjectRow) {
  await tx.insert(auditLog).values({ orgId: actor.orgId, actorUserId: actor.userId, actorLabel: actor.actorLabel,
    entityType: "project", entityId: after.id, action: before ? "project.update" : "project.create",
    before: before ? serializeProject(before) : null, after: serializeProject(after),
    context: { clientId: after.clientId, previousVersion: before?.version ?? null, version: after.version } });
}
