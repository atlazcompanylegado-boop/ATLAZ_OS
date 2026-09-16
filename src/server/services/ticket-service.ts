import "server-only";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeTicketSession } from "@/lib/auth/ticket-access";
import { can } from "@/config/permissions";
import { getDb } from "@/server/db/client";
import type { DbClient } from "@/server/db/types";
import { ticketCreateSchema, ticketUpdateSchema, ticketFiltersSchema, ticketIdSchema, ticketVersionSchema,
  ticketPaginationSchema, ticketStatusActionSchema, ticketReopenSchema, ticketClientSelectorSchema, ticketProjectSelectorSchema,
  ticketCommentCreateSchema, TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS, isFinalTicketStatus, type TicketFilters, type TicketStatus } from "@/lib/validation/ticket";
import { TICKET_EVENT_KINDS } from "@/lib/support/activity";
import * as repo from "@/server/repositories/ticket-repository";
import * as timelineRepo from "@/server/repositories/ticket-timeline-repository";
import * as commentRepo from "@/server/repositories/ticket-comment-repository";
import { recordCommentAudit, recordCommentEvent, recordTicketAudit, recordTicketEvent } from "./ticket-events";
import { ServiceError } from "./service-error";

async function requireAccess(access: "read" | "write") {
  const session = await getCurrentSession();
  const auth = authorizeTicketSession(session, access);
  if (!auth.ok) throw new ServiceError("forbidden", "Você não tem acesso a Suporte.");
  return { ...auth.context, canReadProjects: can(session?.membership?.permissions, "project:read") };
}
type Actor = Awaited<ReturnType<typeof requireAccess>>;
/**
 * Ver, listar, escolher, trocar, remover, filtrar ou buscar Projeto exige project:read, além do
 * acesso ao chamado. Sempre checado antes de qualquer validação de entrada ou consulta, para
 * que a resposta nunca revele se um Projeto existe (docs/suporte-hotfix-project-masking.md).
 */
function requireProjectAccess(actor: Actor) {
  if (!actor.canReadProjects) throw new ServiceError("forbidden", "Você não tem acesso a Projetos.");
}
/** Sem project:read, um filtro de Projeto vindo da URL é ignorado — nunca vira oráculo de existência. */
function scopeFilters(filters: TicketFilters, actor: Actor): TicketFilters {
  return actor.canReadProjects ? filters : { ...filters, projectId: null };
}
function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "form")] = issue.message;
  throw new ServiceError("validation", "Revise os campos informados.", fields);
}
function validId(raw: unknown) {
  const parsed = ticketIdSchema.safeParse(raw);
  if (!parsed.success) throw new ServiceError("not_found", "Chamado não encontrado.");
  return parsed.data;
}
/** Drizzle wraps driver errors in cause. Do not expose either layer's SQL text. */
async function safe<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) {
    if (error instanceof ServiceError) throw error;
    let cause: unknown = error;
    for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
      const e = cause as { code?: string; message?: string; constraint?: string; constraint_name?: string; cause?: unknown };
      if (e.code === "23514" && e.message?.includes("invalid ticket assignee")) throw new ServiceError("invalid_owner", "Responsável indisponível.");
      if (e.code === "23503" && (e.constraint ?? e.constraint_name) === "support_tickets_client_fkey") throw new ServiceError("invalid_client", "Cliente indisponível.");
      if (e.code === "23503" && (e.constraint ?? e.constraint_name) === "support_tickets_project_fkey") throw new ServiceError("invalid_project", "Projeto indisponível para este cliente.");
      if (e.code === "40001" || e.code === "40P01") throw conflict();
      cause = e.cause;
    }
    throw new ServiceError("database_error", "Não foi possível concluir a operação. Tente novamente.");
  }
}
function conflict() { return new ServiceError("conflict", "Este chamado foi atualizado por outro usuário. Atualize a página antes de salvar novamente."); }
async function ensureClient(db: DbClient, orgId: string, raw: unknown) {
  const id = ticketIdSchema.safeParse(raw);
  if (!id.success) throw new ServiceError("invalid_client", "Cliente indisponível.");
  const client = await repo.getTicketClient(db, orgId, id.data);
  if (!client) throw new ServiceError("invalid_client", "Cliente indisponível.");
  return client;
}
async function ensureProject(db: DbClient, orgId: string, clientId: string, projectId: string | null) {
  if (!projectId) return;
  const id = ticketIdSchema.safeParse(projectId);
  if (!id.success) throw new ServiceError("invalid_project", "Projeto indisponível para este cliente.");
  const project = await repo.getTicketProject(db, orgId, clientId, id.data);
  if (!project) throw new ServiceError("invalid_project", "Projeto indisponível para este cliente.");
  return project;
}
async function ensureAssignee(db: DbClient, orgId: string, id: string | null) {
  if (id && !await repo.findAvailableAssignee(db, orgId, id)) throw new ServiceError("invalid_owner", "Responsável indisponível.", { assignedUserId: "Selecione um membro ativo desta organização." });
}
const final = isFinalTicketStatus;

/**
 * Nunca vaza nome/metadata do Projeto vinculado sem `project:read` (Checkpoint A §5,
 * Opção A aprovada): `hasProject` é sempre seguro de expor (só diz "existe vínculo"),
 * mas `projectId`/`projectName` só saem daqui quando `canReadProjects` é verdadeiro.
 */
function maskProjectVisibility<T extends { projectId: string | null; projectName: string | null }>(row: T, canReadProjects: boolean): T & { hasProject: boolean } {
  return { ...row, hasProject: row.projectId !== null, projectId: canReadProjects ? row.projectId : null, projectName: canReadProjects ? row.projectName : null };
}

export async function listTickets(raw: unknown = {}) {
  const actor = await requireAccess("read"), filters = scopeFilters(parse(ticketFiltersSchema, raw), actor);
  return safe(async () => {
    if (filters.clientId) await ensureClient(getDb(), actor.orgId, filters.clientId);
    const list = await repo.listTickets(getDb(), actor.orgId, filters, { canReadProjects: actor.canReadProjects });
    return { ...list, rows: list.rows.map(r => maskProjectVisibility(r, actor.canReadProjects)) };
  });
}
/** Listagem + KPIs + responsáveis disponíveis na mesma renderização (mesmo motivo de `getProjectsPageData`). */
export async function getTicketsPageData(raw: unknown = {}) {
  const actor = await requireAccess("read"), filters = scopeFilters(parse(ticketFiltersSchema, raw), actor);
  return safe(async () => {
    if (filters.clientId) await ensureClient(getDb(), actor.orgId, filters.clientId);
    const db = getDb();
    const [list, kpis, assignees] = await Promise.all([
      repo.listTickets(db, actor.orgId, filters, { canReadProjects: actor.canReadProjects }),
      repo.getTicketCounts(db, actor.orgId, filters.clientId ?? undefined),
      repo.listAvailableAssignees(db, actor.orgId),
    ]);
    return { ...list, rows: list.rows.map(r => maskProjectVisibility(r, actor.canReadProjects)), filters, kpis, assignees };
  });
}
export async function getTicketDetail(rawId: unknown) {
  const actor = await requireAccess("read"), id = validId(rawId);
  return safe(async () => {
    const row = await repo.getTicketById(getDb(), actor.orgId, id);
    if (!row) throw new ServiceError("not_found", "Chamado não encontrado.");
    return maskProjectVisibility(row, actor.canReadProjects);
  });
}
export async function listTicketTimeline(rawId: unknown, rawPage: unknown = 1) {
  const actor = await requireAccess("read"), id = validId(rawId), { page } = parse(ticketPaginationSchema, { page: rawPage });
  return safe(async () => {
    if (!await repo.getTicketById(getDb(), actor.orgId, id)) throw new ServiceError("not_found", "Chamado não encontrado.");
    return timelineRepo.listTicketTimeline(getDb(), actor.orgId, id, page);
  });
}
/** Ficha do chamado precisa de ticket + timeline + comentários na mesma renderização. */
export async function getTicketWorkspace(rawId: unknown, rawPage: unknown = 1) {
  const actor = await requireAccess("read"), id = validId(rawId), { page } = parse(ticketPaginationSchema, { page: rawPage });
  return safe(async () => {
    const db = getDb();
    const row = await repo.getTicketById(db, actor.orgId, id);
    if (!row) throw new ServiceError("not_found", "Chamado não encontrado.");
    const [timeline, comments] = await Promise.all([
      timelineRepo.listTicketTimeline(db, actor.orgId, id, page),
      commentRepo.listTicketComments(db, actor.orgId, id),
    ]);
    return { ticket: maskProjectVisibility(row, actor.canReadProjects), timeline, comments };
  });
}
export async function listTicketClients(raw: unknown = {}) {
  const actor = await requireAccess("read"), input = parse(ticketClientSelectorSchema, raw);
  return safe(() => repo.listTicketClients(getDb(), actor.orgId, input.q, input.page));
}
export async function getTicketClient(rawId: unknown) {
  const actor = await requireAccess("read");
  return safe(() => ensureClient(getDb(), actor.orgId, rawId));
}
/** Seletor de Projeto sempre restrito ao Cliente escolhido — nunca carrega os projetos de outros clientes. */
export async function listTicketProjects(raw: unknown) {
  const actor = await requireAccess("read");
  requireProjectAccess(actor);
  const input = parse(ticketProjectSelectorSchema, raw);
  return safe(async () => {
    await ensureClient(getDb(), actor.orgId, input.clientId);
    return repo.listTicketProjects(getDb(), actor.orgId, input.clientId, input.q, input.page);
  });
}
export async function getTicketProject(rawClientId: unknown, rawProjectId: unknown) {
  const actor = await requireAccess("read");
  requireProjectAccess(actor);
  return safe(async () => {
    const client = await ensureClient(getDb(), actor.orgId, rawClientId);
    return ensureProject(getDb(), actor.orgId, client.id, validId(rawProjectId));
  });
}
export async function listAvailableTicketAssignees() {
  const actor = await requireAccess("read");
  return safe(() => repo.listAvailableAssignees(getDb(), actor.orgId));
}
export async function getTicketCounts(rawClientId?: unknown) {
  const actor = await requireAccess("read");
  return safe(async () => {
    const client = rawClientId === undefined ? undefined : await ensureClient(getDb(), actor.orgId, rawClientId);
    return repo.getTicketCounts(getDb(), actor.orgId, client?.id);
  });
}
export async function createTicket(raw: unknown) {
  const actor = await requireAccess("write"), data = parse(ticketCreateSchema, raw);
  // Vincular Projeto na criação exige project:read; checado antes de consultar o Projeto.
  if (data.projectId !== null) requireProjectAccess(actor);
  return safe(() => getDb().transaction(async tx => {
    await ensureClient(tx, actor.orgId, data.clientId);
    if (data.projectId) await ensureProject(tx, actor.orgId, data.clientId, data.projectId);
    if (data.assignedUserId) await ensureAssignee(tx, actor.orgId, data.assignedUserId);
    const { clientId, ...fields } = data;
    const ticket = await repo.createTicket(tx, actor.orgId, actor.userId, clientId, { ...fields,
      resolvedAt: data.status === "resolved" ? new Date() : null });
    await recordTicketEvent(tx, actor, ticket, TICKET_EVENT_KINDS.created, `Chamado #${ticket.ticketNumber} criado · ${TICKET_STATUS_LABELS[ticket.status]}`);
    await recordTicketAudit(tx, actor, ticket);
    return { id: ticket.id, ticketNumber: ticket.ticketNumber, version: ticket.version };
  }));
}
type Mutation = { mode: "edit"; data: z.output<typeof ticketUpdateSchema> }
  | { mode: "status"; status: TicketStatus } | { mode: "reopen" };
async function mutate(actor: Actor, id: string, version: number, change: Mutation) {
  return safe(() => getDb().transaction(async tx => {
    const before = await repo.lockTicket(tx, actor.orgId, id);
    if (!before) throw new ServiceError("not_found", "Chamado não encontrado.");
    if (before.version !== version) throw conflict(); // Even a no-op must reject stale forms.
    await ensureClient(tx, actor.orgId, before.clientId);
    let data: repo.TicketWrite = { title: before.title, description: before.description, status: before.status,
      priority: before.priority, projectId: before.projectId, assignedUserId: before.assignedUserId,
      dueAt: before.dueAt, resolvedAt: before.resolvedAt };
    if (change.mode === "reopen") {
      if (!final(before.status)) throw new ServiceError("invalid_transition", "Somente chamados resolvidos ou cancelados podem ser reabertos.");
      data = { ...data, status: "in_progress", resolvedAt: null };
    } else {
      const nextStatus = change.mode === "status" ? change.status : (change.data.status ?? before.status);
      if (nextStatus !== before.status && final(before.status)) throw new ServiceError("invalid_transition", "Use a operação Reabrir chamado.");
      if (change.mode === "edit" && nextStatus !== before.status && final(nextStatus)) throw new ServiceError("invalid_transition", "Use a operação explícita de resolução ou cancelamento.");
      if (change.mode === "edit") {
        // Allowlist explícita: projectId ausente preserva o vínculo atual (nunca vira NULL).
        const { title, description, priority, assignedUserId, dueAt, projectId } = change.data;
        data = { ...data, title, description, priority, assignedUserId, dueAt };
        if (projectId !== undefined) data.projectId = projectId;
      }
      data.status = nextStatus;
      if (nextStatus === "resolved" && before.status !== "resolved") data.resolvedAt = new Date();
      else if (nextStatus !== "resolved") data.resolvedAt = null; // cancelled nunca finge resolução; não-finais não têm resolvedAt
    }
    if (data.projectId !== before.projectId) await ensureProject(tx, actor.orgId, before.clientId, data.projectId);
    if (data.assignedUserId !== before.assignedUserId) await ensureAssignee(tx, actor.orgId, data.assignedUserId);
    const generic = (["title", "description"] as const).filter(k => data[k] !== before[k]);
    const dueChanged = (data.dueAt?.getTime() ?? null) !== (before.dueAt?.getTime() ?? null);
    const specific = (["status", "priority", "assignedUserId", "projectId"] as const).filter(k => data[k] !== before[k]);
    if (!generic.length && !specific.length && !dueChanged) return { id, version: before.version };
    const after = await repo.updateTicket(tx, actor.orgId, id, version, data);
    if (!after) throw conflict();
    for (const field of specific) {
      const kind = { status: TICKET_EVENT_KINDS.statusChanged, priority: TICKET_EVENT_KINDS.priorityChanged,
        assignedUserId: TICKET_EVENT_KINDS.assigneeChanged, projectId: TICKET_EVENT_KINDS.projectChanged }[field];
      const summary = field === "status" ? `${TICKET_STATUS_LABELS[before.status]} → ${TICKET_STATUS_LABELS[after.status]}`
        : field === "priority" ? `${TICKET_PRIORITY_LABELS[before.priority]} → ${TICKET_PRIORITY_LABELS[after.priority]}`
        : field === "assignedUserId" ? (after.assignedUserId ? "Responsável alterado" : "Responsável removido")
        : after.projectId ? "Projeto vinculado" : "Projeto desvinculado";
      await recordTicketEvent(tx, actor, after, kind, summary, { before: before[field], after: after[field] });
    }
    if (dueChanged) {
      const summary = after.dueAt ? `Prazo definido para ${after.dueAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Prazo removido";
      await recordTicketEvent(tx, actor, after, TICKET_EVENT_KINDS.dueDateChanged, summary, { before: before.dueAt?.toISOString() ?? null, after: after.dueAt?.toISOString() ?? null });
    }
    if (generic.length) {
      const labels = { title: "título", description: "descrição" };
      await recordTicketEvent(tx, actor, after, TICKET_EVENT_KINDS.updated, `Campos alterados: ${generic.map(k => labels[k]).join(", ")}`);
    }
    await recordTicketAudit(tx, actor, after, before);
    return { id, version: after.version };
  }));
}
export async function updateTicket(rawId: unknown, raw: unknown, rawVersion: unknown) {
  const actor = await requireAccess("write"), id = validId(rawId), version = parse(ticketVersionSchema, rawVersion);
  const data = parse(ticketUpdateSchema, raw);
  // Vincular, trocar ou remover Projeto exige project:read; editar os demais campos, não.
  if (data.projectId !== undefined) requireProjectAccess(actor);
  return mutate(actor, id, version, { mode: "edit", data });
}
export async function changeTicketStatus(raw: unknown) {
  const actor = await requireAccess("write"), input = parse(ticketStatusActionSchema, raw);
  return mutate(actor, input.ticketId, input.version, { mode: "status", status: input.status });
}
export async function reopenTicket(raw: unknown) {
  const actor = await requireAccess("write"), input = parse(ticketReopenSchema, raw);
  return mutate(actor, input.ticketId, input.version, { mode: "reopen" });
}
export async function createTicketComment(raw: unknown) {
  const actor = await requireAccess("write"), data = parse(ticketCommentCreateSchema, raw);
  return safe(() => getDb().transaction(async tx => {
    const ticket = await repo.getTicketById(tx, actor.orgId, data.ticketId);
    if (!ticket) throw new ServiceError("not_found", "Chamado não encontrado.");
    const comment = await commentRepo.createTicketComment(tx, actor.orgId, data.ticketId, actor.userId, data.content);
    await recordCommentEvent(tx, actor, ticket, comment);
    await recordCommentAudit(tx, actor, ticket, comment);
    return { id: comment.id };
  }));
}
