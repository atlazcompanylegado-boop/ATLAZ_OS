import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { clientContacts } from "@/server/db/schema";
import type { DbClient } from "@/server/db/types";
import type { NormalizedClientContactInput } from "@/lib/validation/client";

/** Só acesso a dado. O avanço da `version` do cliente pai é feito pelo service
 * (via `bumpClientVersion`, na mesma transação) — não duplicado aqui. */

export interface ClientContactRow {
  id: string;
  orgId: string;
  clientId: string;
  name: string;
  jobTitle: string | null;
  type: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function listClientContacts(db: DbClient, orgId: string, clientId: string): Promise<ClientContactRow[]> {
  return db
    .select()
    .from(clientContacts)
    .where(and(eq(clientContacts.orgId, orgId), eq(clientContacts.clientId, clientId)))
    .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name), asc(clientContacts.id));
}

export async function getClientContactById(
  db: DbClient,
  orgId: string,
  clientId: string,
  contactId: string,
): Promise<ClientContactRow | null> {
  const [row] = await db
    .select()
    .from(clientContacts)
    .where(and(eq(clientContacts.orgId, orgId), eq(clientContacts.clientId, clientId), eq(clientContacts.id, contactId)));
  return row ?? null;
}

/** Desmarca o(s) principal(is) atual(is) — exceto o próprio contato, quando ele já é o alvo da troca. */
async function unsetPrimaryContact(db: DbClient, orgId: string, clientId: string, exceptContactId?: string) {
  const conditions = [eq(clientContacts.orgId, orgId), eq(clientContacts.clientId, clientId), eq(clientContacts.isPrimary, true)];
  await db
    .update(clientContacts)
    .set({ isPrimary: false })
    .where(exceptContactId ? and(...conditions, ne(clientContacts.id, exceptContactId)) : and(...conditions));
}

export async function createClientContact(
  db: DbClient,
  params: { orgId: string; clientId: string; actorUserId: string; data: NormalizedClientContactInput },
): Promise<ClientContactRow> {
  if (params.data.isPrimary) {
    await unsetPrimaryContact(db, params.orgId, params.clientId);
  }
  const [row] = await db
    .insert(clientContacts)
    .values({
      orgId: params.orgId,
      clientId: params.clientId,
      name: params.data.name,
      jobTitle: params.data.jobTitle,
      type: params.data.type,
      email: params.data.email,
      phone: params.data.phone,
      whatsapp: params.data.whatsapp,
      isPrimary: params.data.isPrimary,
      notes: params.data.notes,
      createdBy: params.actorUserId,
    })
    .returning();
  return row!;
}

export async function updateClientContact(
  db: DbClient,
  params: { orgId: string; clientId: string; contactId: string; data: NormalizedClientContactInput },
): Promise<ClientContactRow | null> {
  if (params.data.isPrimary) {
    // A troca de principal desmarca o anterior e marca o novo na mesma transação
    // (contrato do Checkpoint 1); nunca dois contatos marcados ao mesmo tempo.
    await unsetPrimaryContact(db, params.orgId, params.clientId, params.contactId);
  }
  const [row] = await db
    .update(clientContacts)
    .set({
      name: params.data.name,
      jobTitle: params.data.jobTitle,
      type: params.data.type,
      email: params.data.email,
      phone: params.data.phone,
      whatsapp: params.data.whatsapp,
      isPrimary: params.data.isPrimary,
      notes: params.data.notes,
    })
    .where(and(eq(clientContacts.orgId, params.orgId), eq(clientContacts.clientId, params.clientId), eq(clientContacts.id, params.contactId)))
    .returning();
  return row ?? null;
}

/** Remove o contato. Nunca promove outro a principal automaticamente. */
export async function deleteClientContact(db: DbClient, orgId: string, clientId: string, contactId: string): Promise<ClientContactRow | null> {
  const [row] = await db
    .delete(clientContacts)
    .where(and(eq(clientContacts.orgId, orgId), eq(clientContacts.clientId, clientId), eq(clientContacts.id, contactId)))
    .returning();
  return row ?? null;
}

/** Troca explícita de principal — nunca automática (ver docs/clientes-checkpoint-1.md §49). */
export async function setPrimaryContact(db: DbClient, orgId: string, clientId: string, contactId: string): Promise<ClientContactRow | null> {
  await unsetPrimaryContact(db, orgId, clientId, contactId);
  const [row] = await db
    .update(clientContacts)
    .set({ isPrimary: true })
    .where(and(eq(clientContacts.orgId, orgId), eq(clientContacts.clientId, clientId), eq(clientContacts.id, contactId)))
    .returning();
  return row ?? null;
}
