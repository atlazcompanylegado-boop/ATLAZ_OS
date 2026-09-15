import "server-only";
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeClientSession } from "@/lib/auth/client-access";
import { getDb } from "@/server/db/client";
import { ServiceError } from "./service-error";
import { recordClientAudit, recordClientEvent } from "./client-events";
import { CLIENT_EVENT_KINDS } from "@/lib/clients/activity";
import {
  CLIENT_STATUS_LABELS,
  parseClientContactInput,
  parseClientFilters,
  parseClientInput,
  parseVersion,
  type ClientContactFieldErrors,
  type ClientFilters,
  type NormalizedClientContactInput,
  type NormalizedClientInput,
} from "@/lib/validation/client";
import * as clientRepo from "@/server/repositories/client-repository";
import * as contactRepo from "@/server/repositories/client-contact-repository";
import * as timelineRepo from "@/server/repositories/client-timeline-repository";
import type { ClientDetailRow, ClientKpis, ClientListRow, OwnerOption } from "@/server/repositories/client-repository";
import type { ClientContactRow } from "@/server/repositories/client-contact-repository";
import type { ClientTimelineEntry } from "@/server/repositories/client-timeline-repository";

/**
 * Service de Clientes: única camada que fala com `getCurrentSession()` +
 * `authorizeClientSession()` antes de tocar qualquer repository (ver
 * docs/clientes-checkpoint-1.md §A). Nunca aceita orgId/actorId/permissions vindos
 * do formulário — tudo deriva da sessão do servidor (ver §4 do Checkpoint 2).
 */

interface Actor {
  orgId: string;
  userId: string;
  membershipId: string;
  actorLabel: string;
}

async function requireAccess(access: "read" | "write"): Promise<Actor> {
  const session = await getCurrentSession();
  const auth = authorizeClientSession(session, access);
  if (!auth.ok) {
    throw new ServiceError("forbidden", "Você não tem acesso a Clientes.");
  }
  return auth.context;
}

/** Traduz falhas do Postgres (defesa em profundidade — a validação prévia cobre o caminho feliz). */
function translateDatabaseError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  const pgError = error as { code?: string; constraint_name?: string; message?: string } | undefined;
  if (pgError?.code === "23505" && pgError.constraint_name === "clients_org_document_key") {
    return new ServiceError("duplicate_document", "Já existe um cliente com este documento.", {
      document: "Já existe um cliente com este documento.",
    });
  }
  if (pgError?.code === "23514" && pgError.message?.includes("invalid client owner")) {
    return new ServiceError("invalid_owner", "O responsável selecionado não está disponível.", {
      ownerUserId: "O responsável selecionado não está disponível.",
    });
  }
  return new ServiceError("database_error", "Não foi possível concluir a operação. Tente novamente.");
}

async function ensureValidOwner(db: ReturnType<typeof getDb>, orgId: string, ownerUserId: string | null): Promise<OwnerOption | null> {
  if (!ownerUserId) return null;
  const owner = await clientRepo.findActiveOwner(db, orgId, ownerUserId);
  if (!owner) {
    throw new ServiceError("invalid_owner", "O responsável selecionado não está disponível.", {
      ownerUserId: "O responsável selecionado não está disponível.",
    });
  }
  return owner;
}

async function ensureDocumentAvailable(db: ReturnType<typeof getDb>, orgId: string, document: string | null, excludeClientId?: string) {
  if (!document) return;
  const existing = await clientRepo.findClientByDocument(db, orgId, document, excludeClientId);
  if (existing) {
    throw new ServiceError("duplicate_document", "Já existe um cliente com este documento.", {
      document: "Já existe um cliente com este documento.",
    });
  }
}

function serializeContact(row: ClientContactRow) {
  return {
    name: row.name,
    jobTitle: row.jobTitle,
    type: row.type,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    isPrimary: row.isPrimary,
    notes: row.notes,
  };
}

function hasContactInput(raw?: Record<string, unknown>): boolean {
  if (!raw) return false;
  return Object.values(raw).some((v) => typeof v === "string" && v.trim() !== "");
}

function prefixContactErrors(errors: ClientContactFieldErrors): Record<string, string> {
  const prefixed: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (message) prefixed[`contact${key.charAt(0).toUpperCase()}${key.slice(1)}`] = message;
  }
  return prefixed;
}

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

export interface ClientListResult {
  rows: ClientListRow[];
  total: number;
  pageSize: number;
  page: number;
  kpis: ClientKpis;
  filters: ClientFilters;
}

export async function listClients(rawFilters: Record<string, unknown>): Promise<ClientListResult> {
  const { orgId } = await requireAccess("read");
  const filters = parseClientFilters(rawFilters);
  const db = getDb();
  const [{ rows, total, pageSize }, kpis] = await Promise.all([
    clientRepo.listClients(db, orgId, filters),
    clientRepo.getClientKpis(db, orgId),
  ]);
  return { rows, total, pageSize, page: filters.page, kpis, filters };
}

export async function listAvailableOwners(): Promise<OwnerOption[]> {
  const { orgId } = await requireAccess("read");
  return clientRepo.listAvailableOwners(getDb(), orgId);
}

/**
 * A listagem precisa das linhas/KPIs (`listClients`) e do combo de responsáveis
 * (`listAvailableOwners`) na mesma renderização; combinados aqui para resolver a
 * sessão uma única vez em vez de duas (mesmo motivo do `getClientWorkspace`).
 */
export async function getClientsPageData(rawFilters: Record<string, unknown>): Promise<ClientListResult & { owners: OwnerOption[] }> {
  const { orgId } = await requireAccess("read");
  const filters = parseClientFilters(rawFilters);
  const db = getDb();
  const [{ rows, total, pageSize }, kpis, owners] = await Promise.all([
    clientRepo.listClients(db, orgId, filters),
    clientRepo.getClientKpis(db, orgId),
    clientRepo.listAvailableOwners(db, orgId),
  ]);
  return { rows, total, pageSize, page: filters.page, kpis, filters, owners };
}

/** KPIs isolados (sem a listagem) — usado pelo Dashboard principal (Checkpoint 3, Etapa J). */
export async function getClientKpis(): Promise<ClientKpis> {
  const { orgId } = await requireAccess("read");
  return clientRepo.getClientKpis(getDb(), orgId);
}

// ---------------------------------------------------------------------------
// Detalhe / Contatos / Timeline
// ---------------------------------------------------------------------------

export async function getClientDetail(clientId: string): Promise<ClientDetailRow> {
  const { orgId } = await requireAccess("read");
  const client = await clientRepo.getClientById(getDb(), orgId, clientId);
  // ID inexistente, inválido ou de outra org: mesmo erro genérico (nunca revela existência externa).
  if (!client) throw new ServiceError("not_found", "Cliente não encontrado.");
  return client;
}

export async function listClientContacts(clientId: string): Promise<ClientContactRow[]> {
  const { orgId } = await requireAccess("read");
  const db = getDb();
  const client = await clientRepo.getClientById(db, orgId, clientId);
  if (!client) throw new ServiceError("not_found", "Cliente não encontrado.");
  return contactRepo.listClientContacts(db, orgId, clientId);
}

export async function listClientTimeline(
  clientId: string,
  page = 1,
): Promise<{ rows: ClientTimelineEntry[]; total: number; pageSize: number }> {
  const { orgId } = await requireAccess("read");
  const db = getDb();
  const client = await clientRepo.getClientById(db, orgId, clientId);
  if (!client) throw new ServiceError("not_found", "Cliente não encontrado.");
  return timelineRepo.listClientTimeline(db, orgId, clientId, page);
}

export interface ClientWorkspace {
  client: ClientDetailRow;
  contacts: ClientContactRow[];
  timeline: { rows: ClientTimelineEntry[]; total: number; pageSize: number };
}

/**
 * A Ficha Mestre precisa do cliente + contatos + timeline na mesma renderização.
 * Chamar `getClientDetail`/`listClientContacts`/`listClientTimeline` em sequência
 * resolveria a sessão e buscaria o cliente três vezes (redundante, não um bug de
 * autorização — cada função continua correta/independente quando chamada sozinha).
 * Esta função resolve a sessão e o cliente uma única vez e busca contatos/timeline
 * em paralelo (revisão de performance do Checkpoint 3, Etapa L — ver §37).
 */
export async function getClientWorkspace(clientId: string, timelinePage = 1): Promise<ClientWorkspace> {
  const { orgId } = await requireAccess("read");
  const db = getDb();
  const client = await clientRepo.getClientById(db, orgId, clientId);
  if (!client) throw new ServiceError("not_found", "Cliente não encontrado.");
  const [contacts, timeline] = await Promise.all([
    contactRepo.listClientContacts(db, orgId, clientId),
    timelineRepo.listClientTimeline(db, orgId, clientId, timelinePage),
  ]);
  return { client, contacts, timeline };
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export async function createClient(
  rawClientInput: Record<string, unknown>,
  rawContactInput?: Record<string, unknown>,
): Promise<{ id: string }> {
  const actor = await requireAccess("write");
  const parsed = parseClientInput(rawClientInput);
  if (!parsed.ok) {
    throw new ServiceError("validation", parsed.formError ?? "Revise os campos destacados.", parsed.fieldErrors);
  }
  const data = parsed.data;

  let contactData: NormalizedClientContactInput | null = null;
  if (hasContactInput(rawContactInput)) {
    // Contato principal do cadastro é sempre marcado como principal (é o único até aqui).
    const contactParsed = parseClientContactInput({ ...rawContactInput, isPrimary: "true" });
    if (!contactParsed.ok) {
      throw new ServiceError(
        "validation",
        contactParsed.formError ?? "Revise os dados do contato principal.",
        prefixContactErrors(contactParsed.fieldErrors),
      );
    }
    contactData = contactParsed.data;
  }

  const db = getDb();
  const owner = await ensureValidOwner(db, actor.orgId, data.ownerUserId);
  await ensureDocumentAvailable(db, actor.orgId, data.document);

  try {
    const clientId = await db.transaction(async (tx) => {
      const created = await clientRepo.createClient(tx, { orgId: actor.orgId, actorUserId: actor.userId, data });

      await recordClientEvent(tx, {
        orgId: actor.orgId,
        clientId: created.id,
        actorUserId: actor.userId,
        kind: CLIENT_EVENT_KINDS.created,
        summary: `Status inicial: ${CLIENT_STATUS_LABELS[data.status]}${owner ? ` · Responsável: ${owner.fullName}` : ""}`,
      });
      await recordClientAudit(tx, {
        orgId: actor.orgId,
        clientId: created.id,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
        action: "client.create",
        after: data,
      });

      if (contactData) {
        const contact = await contactRepo.createClientContact(tx, {
          orgId: actor.orgId,
          clientId: created.id,
          actorUserId: actor.userId,
          data: contactData,
        });
        await recordClientEvent(tx, {
          orgId: actor.orgId,
          clientId: created.id,
          actorUserId: actor.userId,
          kind: CLIENT_EVENT_KINDS.contactAdded,
          summary: contact.name,
        });
        await recordClientAudit(tx, {
          orgId: actor.orgId,
          clientId: created.id,
          actorUserId: actor.userId,
          actorLabel: actor.actorLabel,
          action: "client.contact.create",
          after: contactData,
        });
      }

      return created.id;
    });
    return { id: clientId };
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

// ---------------------------------------------------------------------------
// Edição
// ---------------------------------------------------------------------------

const CLIENT_FIELD_LABELS = {
  name: "nome",
  tradeName: "nome fantasia",
  legalName: "razão social",
  personType: "tipo de pessoa",
  document: "documento",
  source: "origem",
  website: "site",
  notes: "observações",
} as const;

function diffClient(before: ClientDetailRow, data: NormalizedClientInput) {
  const otherFieldsChanged: string[] = [];
  for (const field of Object.keys(CLIENT_FIELD_LABELS) as (keyof typeof CLIENT_FIELD_LABELS)[]) {
    if (before[field] !== data[field]) otherFieldsChanged.push(CLIENT_FIELD_LABELS[field]);
  }
  const statusChanged = before.status !== data.status;
  const ownerChanged = before.ownerUserId !== data.ownerUserId;
  return {
    changed: statusChanged || ownerChanged || otherFieldsChanged.length > 0,
    statusChanged,
    ownerChanged,
    otherFieldsChanged,
  };
}

export async function updateClient(
  clientId: string,
  rawInput: Record<string, unknown>,
  rawVersion: unknown,
): Promise<{ id: string }> {
  const actor = await requireAccess("write");
  const expectedVersion = parseVersion(rawVersion);
  if (!expectedVersion) {
    throw new ServiceError("validation", "Versão do cliente ausente ou inválida. Recarregue a página.");
  }
  const parsed = parseClientInput(rawInput);
  if (!parsed.ok) {
    throw new ServiceError("validation", parsed.formError ?? "Revise os campos destacados.", parsed.fieldErrors);
  }
  const data = parsed.data;
  const db = getDb();

  const before = await clientRepo.getClientById(db, actor.orgId, clientId);
  if (!before) throw new ServiceError("not_found", "Cliente não encontrado.");

  const owner = await ensureValidOwner(db, actor.orgId, data.ownerUserId);
  if (data.document && data.document !== before.document) {
    await ensureDocumentAvailable(db, actor.orgId, data.document, clientId);
  }

  const diff = diffClient(before, data);
  if (!diff.changed) {
    // Nada mudou de fato — idempotente, sem UPDATE, sem versão avançada, sem evento vazio.
    return { id: clientId };
  }

  try {
    await db.transaction(async (tx) => {
      const updated = await clientRepo.updateClient(tx, { orgId: actor.orgId, clientId, expectedVersion, data });
      if (!updated) {
        throw new ServiceError(
          "conflict",
          "Este cliente foi atualizado por outro usuário. Atualize a página antes de salvar novamente.",
        );
      }

      if (diff.statusChanged) {
        await recordClientEvent(tx, {
          orgId: actor.orgId,
          clientId,
          actorUserId: actor.userId,
          kind: CLIENT_EVENT_KINDS.statusChanged,
          summary: `${CLIENT_STATUS_LABELS[before.status]} → ${CLIENT_STATUS_LABELS[data.status]}`,
        });
      }
      if (diff.ownerChanged) {
        await recordClientEvent(tx, {
          orgId: actor.orgId,
          clientId,
          actorUserId: actor.userId,
          kind: CLIENT_EVENT_KINDS.ownerChanged,
          summary: `${before.ownerName ?? "Sem responsável"} → ${owner?.fullName ?? "Sem responsável"}`,
        });
      }
      if (diff.otherFieldsChanged.length > 0) {
        await recordClientEvent(tx, {
          orgId: actor.orgId,
          clientId,
          actorUserId: actor.userId,
          kind: CLIENT_EVENT_KINDS.updated,
          summary: `Campos alterados: ${diff.otherFieldsChanged.join(", ")}`,
        });
      }
      await recordClientAudit(tx, {
        orgId: actor.orgId,
        clientId,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
        action: "client.update",
        before: {
          name: before.name,
          tradeName: before.tradeName,
          legalName: before.legalName,
          personType: before.personType,
          document: before.document,
          status: before.status,
          source: before.source,
          ownerUserId: before.ownerUserId,
          website: before.website,
          notes: before.notes,
        },
        after: data,
      });
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }

  return { id: clientId };
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------

export async function createClientContact(clientId: string, rawInput: Record<string, unknown>): Promise<{ id: string }> {
  const actor = await requireAccess("write");
  const parsed = parseClientContactInput(rawInput);
  if (!parsed.ok) {
    throw new ServiceError("validation", parsed.formError ?? "Revise os campos destacados.", parsed.fieldErrors);
  }
  const data = parsed.data;
  const db = getDb();
  const client = await clientRepo.getClientById(db, actor.orgId, clientId);
  if (!client) throw new ServiceError("not_found", "Cliente não encontrado.");

  try {
    const contactId = await db.transaction(async (tx) => {
      const contact = await contactRepo.createClientContact(tx, { orgId: actor.orgId, clientId, actorUserId: actor.userId, data });
      await clientRepo.bumpClientVersion(tx, actor.orgId, clientId);
      await recordClientEvent(tx, {
        orgId: actor.orgId,
        clientId,
        actorUserId: actor.userId,
        kind: CLIENT_EVENT_KINDS.contactAdded,
        summary: contact.name,
      });
      await recordClientAudit(tx, {
        orgId: actor.orgId,
        clientId,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
        action: "client.contact.create",
        after: data,
      });
      return contact.id;
    });
    return { id: contactId };
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export async function updateClientContact(
  clientId: string,
  contactId: string,
  rawInput: Record<string, unknown>,
): Promise<{ id: string }> {
  const actor = await requireAccess("write");
  const parsed = parseClientContactInput(rawInput);
  if (!parsed.ok) {
    throw new ServiceError("validation", parsed.formError ?? "Revise os campos destacados.", parsed.fieldErrors);
  }
  const data = parsed.data;
  const db = getDb();
  const client = await clientRepo.getClientById(db, actor.orgId, clientId);
  if (!client) throw new ServiceError("not_found", "Cliente não encontrado.");
  const before = await contactRepo.getClientContactById(db, actor.orgId, clientId, contactId);
  if (!before) throw new ServiceError("not_found", "Contato não encontrado.");

  const primaryChanged = before.isPrimary !== data.isPrimary;
  const otherFieldsChanged = (["name", "jobTitle", "type", "email", "phone", "whatsapp", "notes"] as const).some(
    (field) => before[field] !== data[field],
  );

  try {
    await db.transaction(async (tx) => {
      const updated = await contactRepo.updateClientContact(tx, { orgId: actor.orgId, clientId, contactId, data });
      if (!updated) throw new ServiceError("not_found", "Contato não encontrado.");
      await clientRepo.bumpClientVersion(tx, actor.orgId, clientId);

      if (otherFieldsChanged) {
        await recordClientEvent(tx, {
          orgId: actor.orgId,
          clientId,
          actorUserId: actor.userId,
          kind: CLIENT_EVENT_KINDS.contactUpdated,
          summary: updated.name,
        });
      }
      if (primaryChanged) {
        await recordClientEvent(tx, {
          orgId: actor.orgId,
          clientId,
          actorUserId: actor.userId,
          kind: CLIENT_EVENT_KINDS.primaryContactChanged,
          summary: updated.isPrimary ? `${updated.name} definido como principal` : `${updated.name} deixou de ser principal`,
        });
      }
      await recordClientAudit(tx, {
        orgId: actor.orgId,
        clientId,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
        action: "client.contact.update",
        before: serializeContact(before),
        after: data,
      });
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }

  return { id: contactId };
}

export async function deleteClientContact(clientId: string, contactId: string): Promise<void> {
  const actor = await requireAccess("write");
  const db = getDb();
  const client = await clientRepo.getClientById(db, actor.orgId, clientId);
  if (!client) throw new ServiceError("not_found", "Cliente não encontrado.");
  const existing = await contactRepo.getClientContactById(db, actor.orgId, clientId, contactId);
  if (!existing) throw new ServiceError("not_found", "Contato não encontrado.");

  try {
    await db.transaction(async (tx) => {
      const deleted = await contactRepo.deleteClientContact(tx, actor.orgId, clientId, contactId);
      if (!deleted) throw new ServiceError("not_found", "Contato não encontrado.");
      await clientRepo.bumpClientVersion(tx, actor.orgId, clientId);
      // Nunca promove outro contato a principal automaticamente (contrato do Checkpoint 1).
      await recordClientEvent(tx, {
        orgId: actor.orgId,
        clientId,
        actorUserId: actor.userId,
        kind: CLIENT_EVENT_KINDS.contactRemoved,
        summary: deleted.name,
      });
      await recordClientAudit(tx, {
        orgId: actor.orgId,
        clientId,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
        action: "client.contact.delete",
        before: serializeContact(deleted),
      });
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export async function setPrimaryClientContact(clientId: string, contactId: string): Promise<void> {
  const actor = await requireAccess("write");
  const db = getDb();
  const client = await clientRepo.getClientById(db, actor.orgId, clientId);
  if (!client) throw new ServiceError("not_found", "Cliente não encontrado.");
  const existing = await contactRepo.getClientContactById(db, actor.orgId, clientId, contactId);
  if (!existing) throw new ServiceError("not_found", "Contato não encontrado.");
  if (existing.isPrimary) return; // já é o principal — idempotente, sem evento espúrio

  try {
    await db.transaction(async (tx) => {
      const updated = await contactRepo.setPrimaryContact(tx, actor.orgId, clientId, contactId);
      if (!updated) throw new ServiceError("not_found", "Contato não encontrado.");
      await clientRepo.bumpClientVersion(tx, actor.orgId, clientId);
      await recordClientEvent(tx, {
        orgId: actor.orgId,
        clientId,
        actorUserId: actor.userId,
        kind: CLIENT_EVENT_KINDS.primaryContactChanged,
        summary: `${updated.name} definido como principal`,
      });
      await recordClientAudit(tx, {
        orgId: actor.orgId,
        clientId,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
        action: "client.contact.set_primary",
        before: serializeContact(existing),
        after: serializeContact(updated),
      });
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }
}
