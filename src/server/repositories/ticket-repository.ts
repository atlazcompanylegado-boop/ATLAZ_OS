import "server-only";
import { and, asc, count, desc, eq, getTableColumns, ilike, isNull, or, sql } from "drizzle-orm";
import { clients, memberships, projects, supportTickets, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { TICKET_PAGE_SIZE, type TicketFilters, type TicketPriority, type TicketStatus } from "@/lib/validation/ticket";
import { escapeTicketSearch } from "@/lib/validation/ticket-normalize";

export type TicketRow = typeof supportTickets.$inferSelect;
/** Linha completa a gravar — sem campos opcionais: o service resolve a semântica de PATCH antes. */
export interface TicketWrite {
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  projectId: string | null;
  assignedUserId: string | null;
  dueAt: Date | null;
  resolvedAt: Date | null;
}
/** Sem project:read, filtro e busca nunca tocam Projetos (nem para inferir existência ou nome). */
export interface TicketQueryAccess {
  canReadProjects: boolean;
}
export interface AssigneeOption {
  userId: string;
  fullName: string;
}
export interface TicketClientOption {
  id: string;
  name: string;
  status: string;
}
export interface TicketProjectOption {
  id: string;
  name: string;
  status: string;
}
export function ticketPage(page: number, total: number, size = TICKET_PAGE_SIZE) {
  return Math.min(page, Math.max(1, Math.ceil(total / size)));
}
const overdue = sql`${supportTickets.dueAt} < now() and ${supportTickets.status} not in ('resolved','cancelled')`;
function conditions(orgId: string, f: TicketFilters, access: TicketQueryAccess) {
  const items = [eq(supportTickets.orgId, orgId), eq(clients.orgId, orgId)];
  if (f.clientId) items.push(eq(supportTickets.clientId, f.clientId));
  if (f.projectId && access.canReadProjects) items.push(eq(supportTickets.projectId, f.projectId));
  if (f.status) items.push(eq(supportTickets.status, f.status));
  if (f.priority) items.push(eq(supportTickets.priority, f.priority));
  if (f.assignedUserId) items.push(f.assignedUserId === "unassigned" ? isNull(supportTickets.assignedUserId) : eq(supportTickets.assignedUserId, f.assignedUserId));
  if (f.overdue) items.push(overdue);
  if (f.q) {
    const term = `%${escapeTicketSearch(f.q)}%`;
    // Termo puramente numérico (com ou sem "#") também compara por igualdade com ticket_number —
    // não só ILIKE no título (Checkpoint C2 §7: busca precisa cobrir o número do chamado).
    const numeric = f.q.trim().replace(/^#/, "");
    const matches = [ilike(supportTickets.title, term), ilike(clients.name, term)];
    if (access.canReadProjects) matches.push(ilike(projects.name, term));
    if (/^\d+$/.test(numeric)) matches.push(eq(supportTickets.ticketNumber, Number(numeric)));
    items.push(or(...matches)!);
  }
  return and(...items)!;
}
const clientJoin = and(eq(clients.orgId, supportTickets.orgId), eq(clients.id, supportTickets.clientId));
const projectJoin = and(eq(projects.orgId, supportTickets.orgId), eq(projects.id, supportTickets.projectId));
const assigneeJoin = and(eq(memberships.orgId, supportTickets.orgId), eq(memberships.userId, supportTickets.assignedUserId));

export async function countTickets(db: DbClient, orgId: string, filters: TicketFilters, access: TicketQueryAccess) {
  const [row] = await db.select({ total: count() }).from(supportTickets)
    .innerJoin(clients, clientJoin).leftJoin(projects, projectJoin)
    .where(conditions(orgId, filters, access));
  return Number(row?.total ?? 0);
}
export async function listTickets(db: DbClient, orgId: string, filters: TicketFilters, access: TicketQueryAccess) {
  const total = await countTickets(db, orgId, filters, access);
  const page = ticketPage(filters.page, total);
  const order = filters.sort === "ticketNumber" ? asc(supportTickets.ticketNumber) : filters.sort === "updated" ? desc(supportTickets.updatedAt)
    : filters.sort === "due" ? sql`${supportTickets.dueAt} asc nulls last`
    : filters.sort === "priority" ? sql`case ${supportTickets.priority} when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end asc`
    : desc(supportTickets.createdAt);
  const rows = await db.select({ ...getTableColumns(supportTickets), clientName: clients.name, projectName: projects.name, assigneeName: users.fullName })
    .from(supportTickets).innerJoin(clients, clientJoin).leftJoin(projects, projectJoin)
    .leftJoin(memberships, assigneeJoin).leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(conditions(orgId, filters, access)).orderBy(order, asc(supportTickets.id)).limit(TICKET_PAGE_SIZE).offset((page - 1) * TICKET_PAGE_SIZE);
  return { rows, total, page, pageSize: TICKET_PAGE_SIZE };
}
export async function getTicketById(db: DbClient, orgId: string, ticketId: string) {
  const [row] = await db.select({ ...getTableColumns(supportTickets), clientName: clients.name, projectName: projects.name, assigneeName: users.fullName })
    .from(supportTickets).innerJoin(clients, clientJoin).leftJoin(projects, projectJoin)
    .leftJoin(memberships, assigneeJoin).leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(and(eq(supportTickets.orgId, orgId), eq(clients.orgId, orgId), eq(supportTickets.id, ticketId)));
  return row ?? null;
}
/** Locks only the ticket row; called inside the business transaction. */
export async function lockTicket(db: DbClient, orgId: string, ticketId: string) {
  const [row] = await db.select().from(supportTickets).where(and(eq(supportTickets.orgId, orgId), eq(supportTickets.id, ticketId))).for("update");
  return row ?? null;
}
export async function getTicketClient(db: DbClient, orgId: string, clientId: string) {
  const [row] = await db.select({ id: clients.id, name: clients.name, status: clients.status }).from(clients)
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)));
  return row ?? null;
}
/** Confirma que o projeto existe, é da org e pertence exatamente ao cliente informado (defesa em camadas — a FK tripla já garante isso no banco). */
export async function getTicketProject(db: DbClient, orgId: string, clientId: string, projectId: string) {
  const [row] = await db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.clientId, clientId), eq(projects.id, projectId)));
  return row ?? null;
}
export async function findAvailableAssignee(db: DbClient, orgId: string, userId: string) {
  const [row] = await db.select({ userId: users.id, fullName: users.fullName }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId), eq(memberships.isActive, true), eq(users.isActive, true)));
  return row ?? null;
}
export async function listAvailableAssignees(db: DbClient, orgId: string) {
  return db.select({ userId: users.id, fullName: users.fullName }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.isActive, true), eq(users.isActive, true))).orderBy(asc(users.fullName), asc(users.id));
}
export async function listTicketClients(db: DbClient, orgId: string, q: string, requestedPage: number) {
  const term = `%${escapeTicketSearch(q)}%`;
  const where = and(eq(clients.orgId, orgId), q ? or(ilike(clients.name, term), ilike(clients.tradeName, term), ilike(clients.legalName, term), ilike(clients.document, term)) : undefined);
  const [n] = await db.select({ total: count() }).from(clients).where(where);
  const total = Number(n?.total ?? 0), page = ticketPage(requestedPage, total);
  const rows = await db.select({ id: clients.id, name: clients.name, status: clients.status }).from(clients).where(where)
    .orderBy(asc(clients.name), asc(clients.id)).limit(TICKET_PAGE_SIZE).offset((page - 1) * TICKET_PAGE_SIZE);
  return { rows, total, page, pageSize: TICKET_PAGE_SIZE };
}
/** Seletor de Projeto sempre restrito ao Cliente já escolhido — nunca carrega os projetos de outros clientes. */
export async function listTicketProjects(db: DbClient, orgId: string, clientId: string, q: string, requestedPage: number) {
  const term = `%${escapeTicketSearch(q)}%`;
  const where = and(eq(projects.orgId, orgId), eq(projects.clientId, clientId), q ? ilike(projects.name, term) : undefined);
  const [n] = await db.select({ total: count() }).from(projects).where(where);
  const total = Number(n?.total ?? 0), page = ticketPage(requestedPage, total);
  const rows = await db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects).where(where)
    .orderBy(asc(projects.name), asc(projects.id)).limit(TICKET_PAGE_SIZE).offset((page - 1) * TICKET_PAGE_SIZE);
  return { rows, total, page, pageSize: TICKET_PAGE_SIZE };
}
export async function getTicketCounts(db: DbClient, orgId: string, clientId?: string) {
  // "Abertos" no KPI = qualquer status não-terminal (aberto/triagem/em atendimento/aguardando
  // cliente) — mais amplo que o status literal `open` (decisão explícita do Checkpoint C2,
  // já que "Em atendimento" é reportado como um KPI separado logo abaixo).
  const [row] = await db.select({ total: count(),
    open: sql<number>`count(*) filter (where ${supportTickets.status} not in ('resolved','cancelled'))`,
    inProgress: sql<number>`count(*) filter (where ${supportTickets.status} = 'in_progress')`,
    critical: sql<number>`count(*) filter (where ${supportTickets.priority} = 'critical' and ${supportTickets.status} not in ('resolved','cancelled'))`,
    overdue: sql<number>`count(*) filter (where ${overdue})`,
  }).from(supportTickets).innerJoin(clients, clientJoin)
    .where(and(eq(supportTickets.orgId, orgId), eq(clients.orgId, orgId), clientId ? eq(supportTickets.clientId, clientId) : undefined));
  return { total: Number(row?.total ?? 0), open: Number(row?.open ?? 0), inProgress: Number(row?.inProgress ?? 0),
    critical: Number(row?.critical ?? 0), overdue: Number(row?.overdue ?? 0) };
}
export async function createTicket(db: DbClient, orgId: string, actorUserId: string, clientId: string, data: TicketWrite) {
  const [row] = await db.insert(supportTickets).values({ ...data, orgId, clientId, createdBy: actorUserId }).returning();
  return row!;
}
export async function updateTicket(db: DbClient, orgId: string, ticketId: string, version: number, data: TicketWrite) {
  const [row] = await db.update(supportTickets).set({ ...data, version: sql`${supportTickets.version} + 1` })
    .where(and(eq(supportTickets.orgId, orgId), eq(supportTickets.id, ticketId), eq(supportTickets.version, version))).returning();
  return row ?? null;
}
