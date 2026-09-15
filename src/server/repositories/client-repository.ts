import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { clientContacts, clients, memberships, users } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import type { ClientFilters, ClientStatus, NormalizedClientInput } from "@/lib/validation/client";
import { CLIENT_PAGE_SIZE } from "@/lib/validation/client";

/** Só acesso a dado — nenhuma regra de negócio aqui (ver docs/arquitetura.md §3). Todo
 * método recebe `orgId` explicitamente; a conexão Drizzle tem BYPASSRLS, então o
 * isolamento organizacional é responsabilidade exclusiva de cada WHERE abaixo. */

export interface ClientListRow {
  id: string;
  name: string;
  status: ClientStatus;
  ownerUserId: string | null;
  ownerName: string | null;
  primaryContactName: string | null;
  updatedAt: Date;
}

export interface ClientDetailRow {
  id: string;
  orgId: string;
  name: string;
  tradeName: string | null;
  legalName: string | null;
  personType: "individual" | "company" | null;
  document: string | null;
  status: ClientStatus;
  source: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  website: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ClientKpis {
  total: number;
  active: number;
  onboarding: number;
  paused: number;
}

export interface OwnerOption {
  userId: string;
  fullName: string;
}

const detailColumns = {
  id: clients.id,
  orgId: clients.orgId,
  name: clients.name,
  tradeName: clients.tradeName,
  legalName: clients.legalName,
  personType: clients.personType,
  document: clients.document,
  status: clients.status,
  source: clients.source,
  ownerUserId: clients.ownerUserId,
  ownerName: users.fullName,
  website: clients.website,
  notes: clients.notes,
  createdBy: clients.createdBy,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
  version: clients.version,
} as const;

function buildFilterConditions(orgId: string, filters: Pick<ClientFilters, "q" | "status" | "ownerUserId">) {
  const conditions = [eq(clients.orgId, orgId)];
  if (filters.status) conditions.push(eq(clients.status, filters.status));
  if (filters.ownerUserId) conditions.push(eq(clients.ownerUserId, filters.ownerUserId));
  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(clients.name, term),
        ilike(clients.tradeName, term),
        ilike(clients.legalName, term),
        ilike(clients.document, term),
      )!,
    );
  }
  return and(...conditions)!;
}

export async function listClients(
  db: DbClient,
  orgId: string,
  filters: ClientFilters,
): Promise<{ rows: ClientListRow[]; total: number; pageSize: number }> {
  const where = buildFilterConditions(orgId, filters);
  const pageSize = CLIENT_PAGE_SIZE;
  const offset = (filters.page - 1) * pageSize;

  const orderBy =
    filters.sort === "name"
      ? [asc(clients.name), asc(clients.id)]
      : filters.sort === "updated"
        ? [desc(clients.updatedAt), asc(clients.id)]
        : [desc(clients.createdAt), asc(clients.id)];

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        status: clients.status,
        ownerUserId: clients.ownerUserId,
        ownerName: users.fullName,
        primaryContactName: clientContacts.name,
        updatedAt: clients.updatedAt,
      })
      .from(clients)
      .leftJoin(users, eq(users.id, clients.ownerUserId))
      .leftJoin(
        clientContacts,
        and(eq(clientContacts.orgId, clients.orgId), eq(clientContacts.clientId, clients.id), eq(clientContacts.isPrimary, true)),
      )
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset),
    db.select({ value: sql<number>`count(*)` }).from(clients).where(where),
  ]);

  return { rows, total: Number(totalRow?.value ?? 0), pageSize };
}

export async function getClientKpis(db: DbClient, orgId: string): Promise<ClientKpis> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${clients.status} = 'active')`,
      onboarding: sql<number>`count(*) filter (where ${clients.status} = 'onboarding')`,
      paused: sql<number>`count(*) filter (where ${clients.status} = 'paused')`,
    })
    .from(clients)
    .where(eq(clients.orgId, orgId));

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    onboarding: Number(row?.onboarding ?? 0),
    paused: Number(row?.paused ?? 0),
  };
}

export async function getClientById(db: DbClient, orgId: string, clientId: string): Promise<ClientDetailRow | null> {
  const [row] = await db
    .select(detailColumns)
    .from(clients)
    .leftJoin(users, eq(users.id, clients.ownerUserId))
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)));
  return row ?? null;
}

export async function findClientByDocument(
  db: DbClient,
  orgId: string,
  document: string,
  excludeClientId?: string,
): Promise<{ id: string } | null> {
  const conditions = [eq(clients.orgId, orgId), eq(clients.document, document)];
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(excludeClientId ? and(...conditions, sql`${clients.id} <> ${excludeClientId}`) : and(...conditions));
  return row ?? null;
}

/** Só membership ativa + usuário ativo da própria org — mesma regra do trigger `validate_client_write`. */
export async function findActiveOwner(db: DbClient, orgId: string, ownerUserId: string): Promise<OwnerOption | null> {
  const [row] = await db
    .select({ userId: users.id, fullName: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, ownerUserId), eq(memberships.isActive, true), eq(users.isActive, true)));
  return row ?? null;
}

export async function listAvailableOwners(db: DbClient, orgId: string): Promise<OwnerOption[]> {
  return db
    .select({ userId: users.id, fullName: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.isActive, true), eq(users.isActive, true)))
    .orderBy(asc(users.fullName));
}

export async function createClient(
  db: DbClient,
  params: { orgId: string; actorUserId: string; data: NormalizedClientInput },
): Promise<{ id: string; version: number; createdAt: Date }> {
  const [row] = await db
    .insert(clients)
    .values({
      orgId: params.orgId,
      name: params.data.name,
      tradeName: params.data.tradeName,
      legalName: params.data.legalName,
      personType: params.data.personType,
      document: params.data.document,
      status: params.data.status,
      source: params.data.source,
      ownerUserId: params.data.ownerUserId,
      website: params.data.website,
      notes: params.data.notes,
      createdBy: params.actorUserId,
    })
    .returning({ id: clients.id, version: clients.version, createdAt: clients.createdAt });
  return row!;
}

/** UPDATE condicionado a org+id+version; retorna `null` em conflito de versão (nenhuma linha afetada). */
export async function updateClient(
  db: DbClient,
  params: { orgId: string; clientId: string; expectedVersion: number; data: NormalizedClientInput },
): Promise<{ version: number; updatedAt: Date } | null> {
  const [row] = await db
    .update(clients)
    .set({
      name: params.data.name,
      tradeName: params.data.tradeName,
      legalName: params.data.legalName,
      personType: params.data.personType,
      document: params.data.document,
      status: params.data.status,
      source: params.data.source,
      ownerUserId: params.data.ownerUserId,
      website: params.data.website,
      notes: params.data.notes,
      version: sql`${clients.version} + 1`,
    })
    .where(and(eq(clients.orgId, params.orgId), eq(clients.id, params.clientId), eq(clients.version, params.expectedVersion)))
    .returning({ version: clients.version, updatedAt: clients.updatedAt });
  return row ?? null;
}

/** Usado pelas mutações de contato para avançar a versão do cliente pai na mesma transação. */
export async function bumpClientVersion(db: DbClient, orgId: string, clientId: string): Promise<number | null> {
  const [row] = await db
    .update(clients)
    .set({ version: sql`${clients.version} + 1` })
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)))
    .returning({ version: clients.version });
  return row?.version ?? null;
}
