import "server-only";
import { and, asc, count, desc, eq, getTableColumns, ilike, isNull, or, sql } from "drizzle-orm";
import { clients, domains, memberships, projects, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { DOMAIN_PAGE_SIZE, type DomainAutoRenewStatus, type DomainFilters, type DomainStatus } from "@/lib/validation/domain";
import { escapeTicketSearch } from "@/lib/validation/ticket-normalize";

export type DomainRow = typeof domains.$inferSelect;
/** Linha completa a gravar — sem campos opcionais: o service resolve a semântica de PATCH antes (mesma lição do hotfix de Suporte). */
export interface DomainWrite {
  projectId: string | null;
  registrar: string | null;
  registrationDate: string | null;
  expirationDate: string;
  autoRenewStatus: DomainAutoRenewStatus;
  status: DomainStatus;
  ownerUserId: string | null;
  notes: string | null;
}
/** Sem project:read, filtro e busca nunca tocam Projetos (nem para inferir existência ou nome) — corrigido desde a fundação (docs/suporte-hotfix-project-masking.md). */
export interface DomainQueryAccess {
  canReadProjects: boolean;
}
export interface AvailableOwnerOption { userId: string; fullName: string }
export interface DomainClientOption { id: string; name: string; status: string }
export interface DomainProjectOption { id: string; name: string; status: string }

export function domainPage(page: number, total: number, size = DOMAIN_PAGE_SIZE) {
  return Math.min(page, Math.max(1, Math.ceil(total / size)));
}

const today = sql`(now() at time zone 'America/Sao_Paulo')::date`;
/** `inactive` nunca conta como urgência de vencimento (Checkpoint A §31, decisão D31 aprovada). */
const notInactive = sql`${domains.status} <> 'inactive'`;
const expired = sql`${domains.expirationDate} < ${today} and ${notInactive}`;
function expiringWithin(maxDays: number) {
  // `date + integer` é ambíguo para o Postgres quando o inteiro chega como parâmetro sem tipo
  // (`$1`) — `maxDays` é sempre um número interno controlado (7/15/30/60), nunca entrada bruta
  // do usuário, então interpolar como literal via `sql.raw` é seguro (nunca é `f.q`/string).
  return sql`${domains.expirationDate} >= ${today} and ${domains.expirationDate} <= (${today} + ${sql.raw(String(Math.trunc(maxDays)))}) and ${notInactive}`;
}

function conditions(orgId: string, f: DomainFilters, access: DomainQueryAccess) {
  const items = [eq(domains.orgId, orgId), eq(clients.orgId, orgId)];
  if (f.clientId) items.push(eq(domains.clientId, f.clientId));
  if (f.projectId && access.canReadProjects) items.push(eq(domains.projectId, f.projectId));
  if (f.status) items.push(eq(domains.status, f.status));
  if (f.autoRenewStatus) items.push(eq(domains.autoRenewStatus, f.autoRenewStatus));
  if (f.ownerUserId) items.push(f.ownerUserId === "unassigned" ? isNull(domains.ownerUserId) : eq(domains.ownerUserId, f.ownerUserId));
  if (f.expirationWindow) items.push(expiringWithin(Number(f.expirationWindow)));
  if (f.expired) items.push(expired);
  if (f.q) {
    const term = `%${escapeTicketSearch(f.q)}%`;
    const matches = [ilike(domains.domainName, term), ilike(clients.name, term), ilike(domains.registrar, term)];
    if (access.canReadProjects) matches.push(ilike(projects.name, term));
    items.push(or(...matches)!);
  }
  return and(...items)!;
}
const clientJoin = and(eq(clients.orgId, domains.orgId), eq(clients.id, domains.clientId));
const projectJoin = and(eq(projects.orgId, domains.orgId), eq(projects.id, domains.projectId));
const ownerJoin = and(eq(memberships.orgId, domains.orgId), eq(memberships.userId, domains.ownerUserId));

export async function countDomains(db: DbClient, orgId: string, filters: DomainFilters, access: DomainQueryAccess) {
  const [row] = await db.select({ total: count() }).from(domains)
    .innerJoin(clients, clientJoin).leftJoin(projects, projectJoin)
    .where(conditions(orgId, filters, access));
  return Number(row?.total ?? 0);
}
export async function listDomains(db: DbClient, orgId: string, filters: DomainFilters, access: DomainQueryAccess) {
  const total = await countDomains(db, orgId, filters, access);
  const page = domainPage(filters.page, total);
  const order = filters.sort === "domainName" ? asc(domains.domainName) : filters.sort === "updated" ? desc(domains.updatedAt)
    : filters.sort === "created" ? desc(domains.createdAt)
    : sql`${domains.expirationDate} asc`; // "expiration" (default): mais próximo do vencimento primeiro
  const rows = await db.select({ ...getTableColumns(domains), clientName: clients.name, projectName: projects.name, ownerName: users.fullName })
    .from(domains).innerJoin(clients, clientJoin).leftJoin(projects, projectJoin)
    .leftJoin(memberships, ownerJoin).leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(conditions(orgId, filters, access)).orderBy(order, asc(domains.id)).limit(DOMAIN_PAGE_SIZE).offset((page - 1) * DOMAIN_PAGE_SIZE);
  return { rows, total, page, pageSize: DOMAIN_PAGE_SIZE };
}
export async function getDomainById(db: DbClient, orgId: string, domainId: string) {
  const [row] = await db.select({ ...getTableColumns(domains), clientName: clients.name, projectName: projects.name, ownerName: users.fullName })
    .from(domains).innerJoin(clients, clientJoin).leftJoin(projects, projectJoin)
    .leftJoin(memberships, ownerJoin).leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(and(eq(domains.orgId, orgId), eq(clients.orgId, orgId), eq(domains.id, domainId)));
  return row ?? null;
}
/** Só a linha do domínio, para lock em transação de edição (mesmo padrão de `lockTicket`). */
export async function lockDomain(db: DbClient, orgId: string, domainId: string) {
  const [row] = await db.select().from(domains).where(and(eq(domains.orgId, orgId), eq(domains.id, domainId))).for("update");
  return row ?? null;
}
export async function getDomainClient(db: DbClient, orgId: string, clientId: string) {
  const [row] = await db.select({ id: clients.id, name: clients.name, status: clients.status }).from(clients)
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)));
  return row ?? null;
}
/** Confirma que o projeto existe, é da org e pertence exatamente ao cliente informado (defesa em camadas — a FK tripla já garante isso no banco). */
export async function getDomainProject(db: DbClient, orgId: string, clientId: string, projectId: string) {
  const [row] = await db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.clientId, clientId), eq(projects.id, projectId)));
  return row ?? null;
}
export async function findAvailableOwner(db: DbClient, orgId: string, userId: string) {
  const [row] = await db.select({ userId: users.id, fullName: users.fullName }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId), eq(memberships.isActive, true), eq(users.isActive, true)));
  return row ?? null;
}
export async function listAvailableOwners(db: DbClient, orgId: string) {
  return db.select({ userId: users.id, fullName: users.fullName }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.isActive, true), eq(users.isActive, true))).orderBy(asc(users.fullName), asc(users.id));
}
export async function listDomainClients(db: DbClient, orgId: string, q: string, requestedPage: number) {
  const term = `%${escapeTicketSearch(q)}%`;
  const where = and(eq(clients.orgId, orgId), q ? or(ilike(clients.name, term), ilike(clients.tradeName, term), ilike(clients.legalName, term), ilike(clients.document, term)) : undefined);
  const [n] = await db.select({ total: count() }).from(clients).where(where);
  const total = Number(n?.total ?? 0), page = domainPage(requestedPage, total);
  const rows = await db.select({ id: clients.id, name: clients.name, status: clients.status }).from(clients).where(where)
    .orderBy(asc(clients.name), asc(clients.id)).limit(DOMAIN_PAGE_SIZE).offset((page - 1) * DOMAIN_PAGE_SIZE);
  return { rows, total, page, pageSize: DOMAIN_PAGE_SIZE };
}
/** Seletor de Projeto sempre restrito ao Cliente já escolhido — nunca carrega os projetos de outros clientes. */
export async function listDomainProjects(db: DbClient, orgId: string, clientId: string, q: string, requestedPage: number) {
  const term = `%${escapeTicketSearch(q)}%`;
  const where = and(eq(projects.orgId, orgId), eq(projects.clientId, clientId), q ? ilike(projects.name, term) : undefined);
  const [n] = await db.select({ total: count() }).from(projects).where(where);
  const total = Number(n?.total ?? 0), page = domainPage(requestedPage, total);
  const rows = await db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects).where(where)
    .orderBy(asc(projects.name), asc(projects.id)).limit(DOMAIN_PAGE_SIZE).offset((page - 1) * DOMAIN_PAGE_SIZE);
  return { rows, total, page, pageSize: DOMAIN_PAGE_SIZE };
}
export async function getDomainCounts(db: DbClient, orgId: string, clientId?: string) {
  const [row] = await db.select({ total: count(),
    active: sql<number>`count(*) filter (where ${domains.status} = 'active')`,
    expiring30: sql<number>`count(*) filter (where ${expiringWithin(30)})`,
    expiring7: sql<number>`count(*) filter (where ${expiringWithin(7)})`,
    expired: sql<number>`count(*) filter (where ${expired})`,
  }).from(domains).innerJoin(clients, clientJoin)
    .where(and(eq(domains.orgId, orgId), eq(clients.orgId, orgId), clientId ? eq(domains.clientId, clientId) : undefined));
  return { total: Number(row?.total ?? 0), active: Number(row?.active ?? 0), expiring30: Number(row?.expiring30 ?? 0),
    expiring7: Number(row?.expiring7 ?? 0), expired: Number(row?.expired ?? 0) };
}
export async function createDomain(db: DbClient, orgId: string, actorUserId: string, clientId: string, domainName: string, data: DomainWrite) {
  const [row] = await db.insert(domains).values({ ...data, orgId, clientId, domainName, createdBy: actorUserId }).returning();
  return row!;
}
export async function updateDomain(db: DbClient, orgId: string, domainId: string, version: number, data: DomainWrite) {
  const [row] = await db.update(domains).set({ ...data, version: sql`${domains.version} + 1` })
    .where(and(eq(domains.orgId, orgId), eq(domains.id, domainId), eq(domains.version, version))).returning();
  return row ?? null;
}
