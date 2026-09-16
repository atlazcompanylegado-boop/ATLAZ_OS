import "server-only";
import { and, asc, count, desc, eq, getTableColumns, ilike, isNull, or, sql } from "drizzle-orm";
import { clients, memberships, projects, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import { PROJECT_PAGE_SIZE, type ProjectFilters, type ProjectUpdate } from "@/lib/validation/project";
import { escapeProjectSearch } from "@/lib/validation/project-normalize";

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectWrite = Omit<ProjectUpdate, "clientId"> & { completedAt: Date | null };
export interface OwnerOption {
  userId: string;
  fullName: string;
}
export function projectPage(page: number, total: number, size = PROJECT_PAGE_SIZE) {
  return Math.min(page, Math.max(1, Math.ceil(total / size)));
}
const overdue = sql`${projects.dueDate} < (now() at time zone 'America/Sao_Paulo')::date and ${projects.status} not in ('completed','cancelled')`;
function conditions(orgId: string, f: ProjectFilters) {
  const items = [eq(projects.orgId, orgId), eq(clients.orgId, orgId)];
  if (f.clientId) items.push(eq(projects.clientId, f.clientId));
  if (f.status) items.push(eq(projects.status, f.status));
  if (f.priority) items.push(eq(projects.priority, f.priority));
  if (f.ownerUserId) items.push(f.ownerUserId === "unassigned" ? isNull(projects.ownerUserId) : eq(projects.ownerUserId, f.ownerUserId));
  if (f.overdue) items.push(overdue);
  if (f.q) {
    const term = `%${escapeProjectSearch(f.q)}%`;
    items.push(or(ilike(projects.name, term), ilike(clients.name, term))!);
  }
  return and(...items)!;
}
const clientJoin = and(eq(clients.orgId, projects.orgId), eq(clients.id, projects.clientId));

export async function countProjects(db: DbClient, orgId: string, filters: ProjectFilters) {
  const [row] = await db.select({ total: count() }).from(projects).innerJoin(clients, clientJoin).where(conditions(orgId, filters));
  return Number(row?.total ?? 0);
}
export async function listProjects(db: DbClient, orgId: string, filters: ProjectFilters) {
  const total = await countProjects(db, orgId, filters);
  const page = projectPage(filters.page, total);
  const order = filters.sort === "name" ? asc(projects.name) : filters.sort === "updated" ? desc(projects.updatedAt)
    : filters.sort === "due" ? sql`${projects.dueDate} asc nulls last` : desc(projects.createdAt);
  const rows = await db.select({ ...getTableColumns(projects), clientName: clients.name, ownerName: users.fullName })
    .from(projects).innerJoin(clients, clientJoin)
    .leftJoin(memberships, and(eq(memberships.orgId, orgId), eq(memberships.orgId, projects.orgId), eq(memberships.userId, projects.ownerUserId)))
    .leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(conditions(orgId, filters)).orderBy(order, asc(projects.id)).limit(PROJECT_PAGE_SIZE).offset((page - 1) * PROJECT_PAGE_SIZE);
  return { rows, total, page, pageSize: PROJECT_PAGE_SIZE };
}
export async function getProjectById(db: DbClient, orgId: string, projectId: string) {
  const [row] = await db.select({ ...getTableColumns(projects), clientName: clients.name, ownerName: users.fullName })
    .from(projects).innerJoin(clients, clientJoin)
    .leftJoin(memberships, and(eq(memberships.orgId, orgId), eq(memberships.orgId, projects.orgId), eq(memberships.userId, projects.ownerUserId)))
    .leftJoin(users, and(eq(users.id, memberships.userId), eq(memberships.orgId, orgId)))
    .where(and(eq(projects.orgId, orgId), eq(clients.orgId, orgId), eq(projects.id, projectId)));
  return row ?? null;
}
/** Locks only the project row; called inside the business transaction. */
export async function lockProject(db: DbClient, orgId: string, projectId: string) {
  const [row] = await db.select().from(projects).where(and(eq(projects.orgId, orgId), eq(projects.id, projectId))).for("update");
  return row ?? null;
}
export async function getProjectClient(db: DbClient, orgId: string, clientId: string) {
  const [row] = await db.select({ id: clients.id, name: clients.name, status: clients.status }).from(clients)
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)));
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
export async function listProjectClients(db: DbClient, orgId: string, q: string, requestedPage: number) {
  const term = `%${escapeProjectSearch(q)}%`;
  const where = and(eq(clients.orgId, orgId), q ? or(ilike(clients.name, term), ilike(clients.tradeName, term), ilike(clients.legalName, term), ilike(clients.document, term)) : undefined);
  const [n] = await db.select({ total: count() }).from(clients).where(where);
  const total = Number(n?.total ?? 0), page = projectPage(requestedPage, total);
  const rows = await db.select({ id: clients.id, name: clients.name, status: clients.status }).from(clients).where(where)
    .orderBy(asc(clients.name), asc(clients.id)).limit(PROJECT_PAGE_SIZE).offset((page - 1) * PROJECT_PAGE_SIZE);
  return { rows, total, page, pageSize: PROJECT_PAGE_SIZE };
}
export async function getProjectCounts(db: DbClient, orgId: string, clientId?: string) {
  const [row] = await db.select({ total: count(),
    active: sql<number>`count(*) filter (where ${projects.status} = 'active')`,
    review: sql<number>`count(*) filter (where ${projects.status} = 'review')`,
    completed: sql<number>`count(*) filter (where ${projects.status} = 'completed')`,
    overdue: sql<number>`count(*) filter (where ${overdue})`,
  }).from(projects).innerJoin(clients, clientJoin)
    .where(and(eq(projects.orgId, orgId), eq(clients.orgId, orgId), clientId ? eq(projects.clientId, clientId) : undefined));
  return { total: Number(row?.total ?? 0), active: Number(row?.active ?? 0), review: Number(row?.review ?? 0),
    completed: Number(row?.completed ?? 0), overdue: Number(row?.overdue ?? 0) };
}
export async function createProject(db: DbClient, orgId: string, actorUserId: string, clientId: string, data: ProjectWrite) {
  const [row] = await db.insert(projects).values({ ...data, orgId, clientId, createdBy: actorUserId }).returning();
  return row!;
}
export async function updateProject(db: DbClient, orgId: string, projectId: string, version: number, data: ProjectWrite) {
  const [row] = await db.update(projects).set({ ...data, version: sql`${projects.version} + 1` })
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId), eq(projects.version, version))).returning();
  return row ?? null;
}
