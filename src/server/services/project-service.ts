import "server-only";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeProjectSession } from "@/lib/auth/project-access";
import { getDb } from "@/server/db/client";
import type { DbClient } from "@/server/db/types";
import { projectCreateSchema, projectUpdateSchema, projectFiltersSchema, projectIdSchema, projectVersionSchema,
  projectPaginationSchema, projectStatusActionSchema, projectReopenSchema, projectClientSelectorSchema,
  PROJECT_STATUS_LABELS, PROJECT_PRIORITY_LABELS, isFinalProjectStatus, type ProjectStatus } from "@/lib/validation/project";
import { PROJECT_EVENT_KINDS } from "@/lib/projects/activity";
import * as repo from "@/server/repositories/project-repository";
import * as timelineRepo from "@/server/repositories/project-timeline-repository";
import { recordProjectAudit, recordProjectEvent } from "./project-events";
import { ServiceError } from "./service-error";

async function requireAccess(access: "read" | "write") {
  const auth = authorizeProjectSession(await getCurrentSession(), access);
  if (!auth.ok) throw new ServiceError("forbidden", "Você não tem acesso a Projetos.");
  return auth.context;
}
function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "form")] = issue.message;
  throw new ServiceError("validation", "Revise os campos informados.", fields);
}
function validId(raw: unknown) {
  const parsed = projectIdSchema.safeParse(raw);
  if (!parsed.success) throw new ServiceError("not_found", "Projeto não encontrado.");
  return parsed.data;
}
/** Drizzle wraps driver errors in cause. Do not expose either layer's SQL text. */
async function safe<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) {
    if (error instanceof ServiceError) throw error;
    let cause: unknown = error;
    for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
      const e = cause as { code?: string; message?: string; constraint?: string; constraint_name?: string; cause?: unknown };
      if (e.code === "23514" && e.message?.includes("invalid project owner")) throw new ServiceError("invalid_owner", "Responsável indisponível.");
      if (e.code === "23503" && (e.constraint ?? e.constraint_name) === "projects_client_fkey") throw new ServiceError("invalid_client", "Cliente indisponível.");
      if (e.code === "40001" || e.code === "40P01") throw conflict();
      cause = e.cause;
    }
    throw new ServiceError("database_error", "Não foi possível concluir a operação. Tente novamente.");
  }
}
function conflict() { return new ServiceError("conflict", "Este projeto foi atualizado por outro usuário. Atualize a página antes de salvar novamente."); }
async function ensureClient(db: DbClient, orgId: string, raw: unknown) {
  const id = projectIdSchema.safeParse(raw);
  if (!id.success) throw new ServiceError("invalid_client", "Cliente indisponível.");
  const client = await repo.getProjectClient(db, orgId, id.data);
  if (!client) throw new ServiceError("invalid_client", "Cliente indisponível.");
  return client;
}
async function ensureOwner(db: DbClient, orgId: string, id: string | null) {
  if (id && !await repo.findAvailableOwner(db, orgId, id)) throw new ServiceError("invalid_owner", "Responsável indisponível.", { ownerUserId: "Selecione um membro ativo desta organização." });
}
const final = isFinalProjectStatus;

export async function listProjects(raw: unknown = {}) {
  const actor = await requireAccess("read"), filters = parse(projectFiltersSchema, raw);
  return safe(async () => {
    if (filters.clientId) await ensureClient(getDb(), actor.orgId, filters.clientId);
    return repo.listProjects(getDb(), actor.orgId, filters);
  });
}
/**
 * A listagem de /projetos precisa das linhas + KPIs + responsáveis disponíveis na
 * mesma renderização; agregados aqui para resolver a sessão uma única vez (mesmo
 * motivo de `getClientsPageData`).
 */
export async function getProjectsPageData(raw: unknown = {}) {
  const actor = await requireAccess("read"), filters = parse(projectFiltersSchema, raw);
  return safe(async () => {
    if (filters.clientId) await ensureClient(getDb(), actor.orgId, filters.clientId);
    const db = getDb();
    const [list, kpis, owners] = await Promise.all([
      repo.listProjects(db, actor.orgId, filters),
      repo.getProjectCounts(db, actor.orgId, filters.clientId ?? undefined),
      repo.listAvailableOwners(db, actor.orgId),
    ]);
    return { ...list, filters, kpis, owners };
  });
}
export async function getProjectDetail(rawId: unknown) {
  const actor = await requireAccess("read"), id = validId(rawId);
  return safe(async () => {
    const row = await repo.getProjectById(getDb(), actor.orgId, id);
    if (!row) throw new ServiceError("not_found", "Projeto não encontrado.");
    return row;
  });
}
export async function listProjectTimeline(rawId: unknown, rawPage: unknown = 1) {
  const actor = await requireAccess("read"), id = validId(rawId), { page } = parse(projectPaginationSchema, { page: rawPage });
  return safe(async () => {
    if (!await repo.getProjectById(getDb(), actor.orgId, id)) throw new ServiceError("not_found", "Projeto não encontrado.");
    return timelineRepo.listProjectTimeline(getDb(), actor.orgId, id, page);
  });
}
/** A Ficha de Projeto precisa do projeto + timeline na mesma renderização (mesmo motivo de `getClientWorkspace`). */
export async function getProjectWorkspace(rawId: unknown, rawPage: unknown = 1) {
  const actor = await requireAccess("read"), id = validId(rawId), { page } = parse(projectPaginationSchema, { page: rawPage });
  return safe(async () => {
    const db = getDb();
    const project = await repo.getProjectById(db, actor.orgId, id);
    if (!project) throw new ServiceError("not_found", "Projeto não encontrado.");
    const timeline = await timelineRepo.listProjectTimeline(db, actor.orgId, id, page);
    return { project, timeline };
  });
}
export async function listProjectClients(raw: unknown = {}) {
  const actor = await requireAccess("read"), input = parse(projectClientSelectorSchema, raw);
  return safe(() => repo.listProjectClients(getDb(), actor.orgId, input.q, input.page));
}
export async function getProjectClient(rawId: unknown) {
  const actor = await requireAccess("read");
  return safe(() => ensureClient(getDb(), actor.orgId, rawId));
}
export async function listAvailableProjectOwners() {
  const actor = await requireAccess("read");
  return safe(() => repo.listAvailableOwners(getDb(), actor.orgId));
}
export async function getProjectCounts(rawClientId?: unknown) {
  const actor = await requireAccess("read");
  return safe(async () => {
    const client = rawClientId === undefined ? undefined : await ensureClient(getDb(), actor.orgId, rawClientId);
    return repo.getProjectCounts(getDb(), actor.orgId, client?.id);
  });
}
export async function createProject(raw: unknown) {
  const actor = await requireAccess("write"), data = parse(projectCreateSchema, raw);
  return safe(() => getDb().transaction(async tx => {
    await ensureClient(tx, actor.orgId, data.clientId);
    await ensureOwner(tx, actor.orgId, data.ownerUserId);
    const { clientId, ...fields } = data;
    const project = await repo.createProject(tx, actor.orgId, actor.userId, clientId, { ...fields,
      progress: data.status === "completed" ? 100 : data.progress,
      completedAt: data.status === "completed" ? new Date() : null });
    await recordProjectEvent(tx, actor, project, PROJECT_EVENT_KINDS.created, `Projeto ${project.name} criado · ${PROJECT_STATUS_LABELS[project.status]}`);
    await recordProjectAudit(tx, actor, project);
    return { id: project.id, version: project.version };
  }));
}
type Mutation = { mode: "edit"; data: z.output<typeof projectUpdateSchema> }
  | { mode: "status"; status: ProjectStatus } | { mode: "reopen" };
async function mutate(actor: Awaited<ReturnType<typeof requireAccess>>, id: string, version: number, change: Mutation) {
  return safe(() => getDb().transaction(async tx => {
    const before = await repo.lockProject(tx, actor.orgId, id);
    if (!before) throw new ServiceError("not_found", "Projeto não encontrado.");
    if (before.version !== version) throw conflict(); // Even a no-op must reject stale forms.
    await ensureClient(tx, actor.orgId, before.clientId);
    let data: repo.ProjectWrite = { name: before.name, description: before.description, status: before.status,
      priority: before.priority, ownerUserId: before.ownerUserId, startDate: before.startDate, dueDate: before.dueDate,
      progress: before.progress, completedAt: before.completedAt };
    if (change.mode === "reopen") {
      if (!final(before.status)) throw new ServiceError("invalid_transition", "Somente projetos concluídos ou cancelados podem ser reabertos.");
      data = { ...data, status: "active", completedAt: null, progress: null };
    } else {
      const nextStatus = change.mode === "status" ? change.status : change.data.status;
      if (nextStatus !== before.status && final(before.status)) throw new ServiceError("invalid_transition", "Use a operação Reabrir projeto.");
      if (change.mode === "edit" && nextStatus !== before.status && final(nextStatus)) throw new ServiceError("invalid_transition", "Use a operação explícita de conclusão ou cancelamento.");
      if (change.mode === "edit") data = { ...data, ...change.data };
      data.status = nextStatus;
      if (nextStatus === "completed" && before.status !== "completed") {
        data.progress = 100; data.completedAt = new Date();
      } else if (nextStatus === "completed" && data.progress !== 100) {
        throw new ServiceError("validation", "Projeto concluído deve manter progresso de 100%.", { progress: "Reabra o projeto para alterar o progresso." });
      } else if (nextStatus !== "completed") data.completedAt = null;
    }
    if (data.ownerUserId !== before.ownerUserId) await ensureOwner(tx, actor.orgId, data.ownerUserId);
    const generic = (["name", "description", "startDate", "dueDate"] as const).filter(k => data[k] !== before[k]);
    const specific = (["status", "priority", "ownerUserId", "progress"] as const).filter(k => data[k] !== before[k]);
    if (!generic.length && !specific.length) return { id, version: before.version };
    const after = await repo.updateProject(tx, actor.orgId, id, version, data);
    if (!after) throw conflict();
    for (const field of specific) {
      const kind = { status: PROJECT_EVENT_KINDS.statusChanged, priority: PROJECT_EVENT_KINDS.priorityChanged,
        ownerUserId: PROJECT_EVENT_KINDS.ownerChanged, progress: PROJECT_EVENT_KINDS.progressChanged }[field];
      const summary = field === "status" ? `${PROJECT_STATUS_LABELS[before.status]} → ${PROJECT_STATUS_LABELS[after.status]}`
        : field === "priority" ? `${PROJECT_PRIORITY_LABELS[before.priority]} → ${PROJECT_PRIORITY_LABELS[after.priority]}`
        : field === "progress" ? `${before.progress === null ? "Não informado" : `${before.progress}%`} → ${after.progress === null ? "Não informado" : `${after.progress}%`}`
        : after.ownerUserId ? "Responsável principal alterado" : "Responsável principal removido";
      await recordProjectEvent(tx, actor, after, kind, summary, { before: before[field], after: after[field] });
    }
    if (generic.length) {
      const labels = { name: "nome", description: "descrição", startDate: "início", dueDate: "prazo" };
      await recordProjectEvent(tx, actor, after, PROJECT_EVENT_KINDS.updated, `Campos alterados: ${generic.map(k => labels[k]).join(", ")}`);
    }
    await recordProjectAudit(tx, actor, after, before);
    return { id, version: after.version };
  }));
}
export async function updateProject(rawId: unknown, raw: unknown, rawVersion: unknown) {
  const actor = await requireAccess("write"), id = validId(rawId), version = parse(projectVersionSchema, rawVersion);
  return mutate(actor, id, version, { mode: "edit", data: parse(projectUpdateSchema, raw) });
}
export async function changeProjectStatus(raw: unknown) {
  const actor = await requireAccess("write"), input = parse(projectStatusActionSchema, raw);
  return mutate(actor, input.projectId, input.version, { mode: "status", status: input.status });
}
export async function reopenProject(raw: unknown) {
  const actor = await requireAccess("write"), input = parse(projectReopenSchema, raw);
  return mutate(actor, input.projectId, input.version, { mode: "reopen" });
}
