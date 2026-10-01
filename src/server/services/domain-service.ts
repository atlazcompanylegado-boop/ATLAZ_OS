import "server-only";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeDomainSession } from "@/lib/auth/domain-access";
import { can } from "@/config/permissions";
import { getDb } from "@/server/db/client";
import type { DbClient } from "@/server/db/types";
import { domainCreateSchema, domainUpdateSchema, domainFiltersSchema, domainIdSchema, domainVersionSchema,
  domainPaginationSchema, domainClientSelectorSchema, domainProjectSelectorSchema,
  DOMAIN_STATUS_LABELS, DOMAIN_AUTO_RENEW_LABELS, type DomainFilters, type DomainStatus } from "@/lib/validation/domain";
import { DOMAIN_EVENT_KINDS } from "@/lib/domains/activity";
import * as repo from "@/server/repositories/domain-repository";
import * as timelineRepo from "@/server/repositories/domain-timeline-repository";
import { recordDomainAudit, recordDomainEvent } from "./domain-events";
import { ServiceError } from "./service-error";

/**
 * Service de Domínios: única camada que fala com `getCurrentSession()` +
 * `authorizeDomainSession()` antes de tocar qualquer repository. Nasce já com a correção
 * aplicada em Suporte (docs/suporte-hotfix-project-masking.md): `project:read` é checado
 * antes de qualquer consulta/validação de Projeto, filtro/URL não autorizado nunca vira
 * oráculo, e edição usa semântica de PATCH desde o primeiro commit (campo ausente preserva).
 */
async function requireAccess(access: "read" | "write") {
  const session = await getCurrentSession();
  const auth = authorizeDomainSession(session, access);
  if (!auth.ok) throw new ServiceError("forbidden", "Você não tem acesso a Domínios.");
  return { ...auth.context, canReadProjects: can(session?.membership?.permissions, "project:read") };
}
type Actor = Awaited<ReturnType<typeof requireAccess>>;
/**
 * Ver, listar, escolher, trocar, remover, filtrar ou buscar Projeto exige project:read, além do
 * acesso ao domínio. Sempre checado antes de qualquer validação de entrada ou consulta, para que
 * a resposta nunca revele se um Projeto existe.
 */
function requireProjectAccess(actor: Actor) {
  if (!actor.canReadProjects) throw new ServiceError("forbidden", "Você não tem acesso a Projetos.");
}
/** Sem project:read, um filtro de Projeto vindo da URL é ignorado — nunca vira oráculo de existência. */
function scopeFilters(filters: DomainFilters, actor: Actor): DomainFilters {
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
  const parsed = domainIdSchema.safeParse(raw);
  if (!parsed.success) throw new ServiceError("not_found", "Domínio não encontrado.");
  return parsed.data;
}
/** Drizzle wraps driver errors in cause. Do not expose either layer's SQL text. */
async function safe<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) {
    if (error instanceof ServiceError) throw error;
    let cause: unknown = error;
    for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
      const e = cause as { code?: string; message?: string; constraint?: string; constraint_name?: string; cause?: unknown };
      if (e.code === "23514" && e.message?.includes("invalid domain owner")) throw new ServiceError("invalid_owner", "Responsável indisponível.");
      if (e.code === "23503" && (e.constraint ?? e.constraint_name) === "domains_client_fkey") throw new ServiceError("invalid_client", "Cliente indisponível.");
      if (e.code === "23503" && (e.constraint ?? e.constraint_name) === "domains_project_fkey") throw new ServiceError("invalid_project", "Projeto indisponível para este cliente.");
      if (e.code === "23505" && (e.constraint ?? e.constraint_name) === "domains_org_active_name_key") throw new ServiceError("duplicate_domain", "Já existe um domínio ativo com este nome.", { domainName: "Já existe um domínio ativo com este nome." });
      if (e.code === "40001" || e.code === "40P01") throw conflict();
      cause = e.cause;
    }
    throw new ServiceError("database_error", "Não foi possível concluir a operação. Tente novamente.");
  }
}
function conflict() { return new ServiceError("conflict", "Este domínio foi atualizado por outro usuário. Atualize a página antes de salvar novamente."); }
async function ensureClient(db: DbClient, orgId: string, raw: unknown) {
  const id = domainIdSchema.safeParse(raw);
  if (!id.success) throw new ServiceError("invalid_client", "Cliente indisponível.");
  const client = await repo.getDomainClient(db, orgId, id.data);
  if (!client) throw new ServiceError("invalid_client", "Cliente indisponível.");
  return client;
}
async function ensureProject(db: DbClient, orgId: string, clientId: string, projectId: string | null) {
  if (!projectId) return;
  const id = domainIdSchema.safeParse(projectId);
  if (!id.success) throw new ServiceError("invalid_project", "Projeto indisponível para este cliente.");
  const project = await repo.getDomainProject(db, orgId, clientId, id.data);
  if (!project) throw new ServiceError("invalid_project", "Projeto indisponível para este cliente.");
  return project;
}
async function ensureOwner(db: DbClient, orgId: string, id: string | null) {
  if (id && !await repo.findAvailableOwner(db, orgId, id)) throw new ServiceError("invalid_owner", "Responsável indisponível.", { ownerUserId: "Selecione um membro ativo desta organização." });
}

/**
 * Nunca vaza nome/metadata do Projeto vinculado sem `project:read` (mesmo contrato de Suporte,
 * Opção A): `hasProject` é sempre seguro de expor (só diz "existe vínculo"), mas
 * `projectId`/`projectName` só saem daqui quando `canReadProjects` é verdadeiro.
 */
function maskProjectVisibility<T extends { projectId: string | null; projectName: string | null }>(row: T, canReadProjects: boolean): T & { hasProject: boolean } {
  return { ...row, hasProject: row.projectId !== null, projectId: canReadProjects ? row.projectId : null, projectName: canReadProjects ? row.projectName : null };
}

/** `inactive` só pode voltar para `active` (reabertura explícita); dos demais, qualquer transição entre eles é edição comum (Checkpoint A §18/§22). */
const ALLOWED_TRANSITIONS: Record<DomainStatus, readonly DomainStatus[]> = {
  active: ["active", "transferring", "inactive"],
  transferring: ["transferring", "active", "inactive"],
  inactive: ["inactive", "active"],
};

export async function listDomains(raw: unknown = {}) {
  const actor = await requireAccess("read"), filters = scopeFilters(parse(domainFiltersSchema, raw), actor);
  return safe(async () => {
    if (filters.clientId) await ensureClient(getDb(), actor.orgId, filters.clientId);
    const list = await repo.listDomains(getDb(), actor.orgId, filters, { canReadProjects: actor.canReadProjects });
    return { ...list, rows: list.rows.map(r => maskProjectVisibility(r, actor.canReadProjects)) };
  });
}
/** Listagem + KPIs + responsáveis disponíveis na mesma renderização (mesmo motivo de `getTicketsPageData`). */
export async function getDomainsPageData(raw: unknown = {}) {
  const actor = await requireAccess("read"), filters = scopeFilters(parse(domainFiltersSchema, raw), actor);
  return safe(async () => {
    if (filters.clientId) await ensureClient(getDb(), actor.orgId, filters.clientId);
    const db = getDb();
    const [list, kpis, owners] = await Promise.all([
      repo.listDomains(db, actor.orgId, filters, { canReadProjects: actor.canReadProjects }),
      repo.getDomainCounts(db, actor.orgId, filters.clientId ?? undefined),
      repo.listAvailableOwners(db, actor.orgId),
    ]);
    return { ...list, rows: list.rows.map(r => maskProjectVisibility(r, actor.canReadProjects)), filters, kpis, owners };
  });
}
export async function getDomainDetail(rawId: unknown) {
  const actor = await requireAccess("read"), id = validId(rawId);
  return safe(async () => {
    const row = await repo.getDomainById(getDb(), actor.orgId, id);
    if (!row) throw new ServiceError("not_found", "Domínio não encontrado.");
    return maskProjectVisibility(row, actor.canReadProjects);
  });
}
export async function listDomainTimeline(rawId: unknown, rawPage: unknown = 1) {
  const actor = await requireAccess("read"), id = validId(rawId), { page } = parse(domainPaginationSchema, { page: rawPage });
  return safe(async () => {
    if (!await repo.getDomainById(getDb(), actor.orgId, id)) throw new ServiceError("not_found", "Domínio não encontrado.");
    return timelineRepo.listDomainTimeline(getDb(), actor.orgId, id, page);
  });
}
/** Ficha do domínio precisa de domínio + timeline na mesma renderização. */
export async function getDomainWorkspace(rawId: unknown, rawPage: unknown = 1) {
  const actor = await requireAccess("read"), id = validId(rawId), { page } = parse(domainPaginationSchema, { page: rawPage });
  return safe(async () => {
    const db = getDb();
    const row = await repo.getDomainById(db, actor.orgId, id);
    if (!row) throw new ServiceError("not_found", "Domínio não encontrado.");
    const timeline = await timelineRepo.listDomainTimeline(db, actor.orgId, id, page);
    return { domain: maskProjectVisibility(row, actor.canReadProjects), timeline };
  });
}
export async function listDomainClients(raw: unknown = {}) {
  const actor = await requireAccess("read"), input = parse(domainClientSelectorSchema, raw);
  return safe(() => repo.listDomainClients(getDb(), actor.orgId, input.q, input.page));
}
export async function getDomainClient(rawId: unknown) {
  const actor = await requireAccess("read");
  return safe(() => ensureClient(getDb(), actor.orgId, rawId));
}
/** Seletor de Projeto sempre restrito ao Cliente escolhido — nunca carrega os projetos de outros clientes. */
export async function listDomainProjects(raw: unknown) {
  const actor = await requireAccess("read");
  requireProjectAccess(actor);
  const input = parse(domainProjectSelectorSchema, raw);
  return safe(async () => {
    await ensureClient(getDb(), actor.orgId, input.clientId);
    return repo.listDomainProjects(getDb(), actor.orgId, input.clientId, input.q, input.page);
  });
}
export async function getDomainProject(rawClientId: unknown, rawProjectId: unknown) {
  const actor = await requireAccess("read");
  requireProjectAccess(actor);
  return safe(async () => {
    const client = await ensureClient(getDb(), actor.orgId, rawClientId);
    return ensureProject(getDb(), actor.orgId, client.id, validId(rawProjectId));
  });
}
export async function listAvailableDomainOwners() {
  const actor = await requireAccess("read");
  return safe(() => repo.listAvailableOwners(getDb(), actor.orgId));
}
export async function getDomainCounts(rawClientId?: unknown) {
  const actor = await requireAccess("read");
  return safe(async () => {
    const client = rawClientId === undefined ? undefined : await ensureClient(getDb(), actor.orgId, rawClientId);
    return repo.getDomainCounts(getDb(), actor.orgId, client?.id);
  });
}
export async function createDomain(raw: unknown) {
  const actor = await requireAccess("write"), data = parse(domainCreateSchema, raw);
  // Vincular Projeto na criação exige project:read; checado antes de consultar o Projeto.
  if (data.projectId !== null) requireProjectAccess(actor);
  return safe(() => getDb().transaction(async tx => {
    await ensureClient(tx, actor.orgId, data.clientId);
    if (data.projectId) await ensureProject(tx, actor.orgId, data.clientId, data.projectId);
    if (data.ownerUserId) await ensureOwner(tx, actor.orgId, data.ownerUserId);
    const { clientId, domainName, ...fields } = data;
    const domain = await repo.createDomain(tx, actor.orgId, actor.userId, clientId, domainName, fields);
    await recordDomainEvent(tx, actor, domain, DOMAIN_EVENT_KINDS.created, `Domínio ${domain.domainName} cadastrado · ${DOMAIN_STATUS_LABELS[domain.status]}`);
    await recordDomainAudit(tx, actor, domain);
    return { id: domain.id, version: domain.version };
  }));
}
export async function updateDomain(rawId: unknown, raw: unknown, rawVersion: unknown) {
  const actor = await requireAccess("write"), id = validId(rawId), version = parse(domainVersionSchema, rawVersion);
  const data = parse(domainUpdateSchema, raw);
  // Vincular, trocar ou remover Projeto exige project:read; editar os demais campos, não.
  if (data.projectId !== undefined) requireProjectAccess(actor);
  return safe(() => getDb().transaction(async tx => {
    const before = await repo.lockDomain(tx, actor.orgId, id);
    if (!before) throw new ServiceError("not_found", "Domínio não encontrado.");
    if (before.version !== version) throw conflict(); // Even a no-op must reject stale forms.
    await ensureClient(tx, actor.orgId, before.clientId);

    // Allowlist explícita, com semântica de PATCH: campo ausente preserva o valor atual
    // (nunca vira NULL/default) — mesma correção aplicada em Suporte, desde o primeiro commit.
    const write: repo.DomainWrite = { projectId: before.projectId, registrar: before.registrar,
      registrationDate: before.registrationDate, expirationDate: before.expirationDate,
      autoRenewStatus: before.autoRenewStatus, status: before.status, ownerUserId: before.ownerUserId, notes: before.notes };
    if (data.registrar !== undefined) write.registrar = data.registrar;
    if (data.registrationDate !== undefined) write.registrationDate = data.registrationDate;
    if (data.expirationDate !== undefined) write.expirationDate = data.expirationDate;
    if (data.autoRenewStatus !== undefined) write.autoRenewStatus = data.autoRenewStatus;
    if (data.ownerUserId !== undefined) write.ownerUserId = data.ownerUserId;
    if (data.notes !== undefined) write.notes = data.notes;
    if (data.projectId !== undefined) write.projectId = data.projectId;
    if (data.status !== undefined) {
      if (!ALLOWED_TRANSITIONS[before.status].includes(data.status)) {
        throw new ServiceError("invalid_transition", "Essa mudança de status não é permitida a partir do status atual.");
      }
      write.status = data.status;
    }

    if (write.projectId !== before.projectId) await ensureProject(tx, actor.orgId, before.clientId, write.projectId);
    if (write.ownerUserId !== before.ownerUserId) await ensureOwner(tx, actor.orgId, write.ownerUserId);

    const specific = (["status", "autoRenewStatus", "ownerUserId", "projectId"] as const).filter(k => write[k] !== before[k]);
    const expirationChanged = write.expirationDate !== before.expirationDate;
    const generic = (["registrar", "registrationDate", "notes"] as const).filter(k => write[k] !== before[k]);
    if (!specific.length && !expirationChanged && !generic.length) return { id, version: before.version };

    const after = await repo.updateDomain(tx, actor.orgId, id, version, write);
    if (!after) throw conflict();

    for (const field of specific) {
      const kind = { status: DOMAIN_EVENT_KINDS.statusChanged, autoRenewStatus: DOMAIN_EVENT_KINDS.autoRenewChanged,
        ownerUserId: DOMAIN_EVENT_KINDS.ownerChanged, projectId: DOMAIN_EVENT_KINDS.projectChanged }[field];
      const summary = field === "status" ? `${DOMAIN_STATUS_LABELS[before.status]} → ${DOMAIN_STATUS_LABELS[after.status]}`
        : field === "autoRenewStatus" ? DOMAIN_AUTO_RENEW_LABELS[after.autoRenewStatus]
        : field === "ownerUserId" ? (after.ownerUserId ? "Responsável alterado" : "Responsável removido")
        : after.projectId ? "Projeto vinculado" : "Projeto desvinculado";
      await recordDomainEvent(tx, actor, after, kind, summary, { before: before[field], after: after[field] });
    }
    if (expirationChanged) {
      await recordDomainEvent(tx, actor, after, DOMAIN_EVENT_KINDS.expirationChanged,
        `Vencimento alterado para ${after.expirationDate}`, { before: before.expirationDate, after: after.expirationDate });
    }
    if (generic.length) {
      // Nunca inclui o conteúdo de `notes` — só o rótulo do campo alterado (Checkpoint A §22/Checkpoint B §34).
      const labels = { registrar: "registrador", registrationDate: "data de registro", notes: "observações" };
      await recordDomainEvent(tx, actor, after, DOMAIN_EVENT_KINDS.updated, `Campos alterados: ${generic.map(k => labels[k]).join(", ")}`);
    }
    await recordDomainAudit(tx, actor, after, before);
    return { id, version: after.version };
  }));
}
