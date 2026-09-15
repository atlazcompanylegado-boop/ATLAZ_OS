// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { applyTestMigration, createTestDatabase } from "../helpers/database";
import {
  activityEvents,
  auditLog,
  clientContacts,
  clients,
  memberships,
  orgs,
  permissions,
  rolePermissions,
  roles,
  users,
} from "@/server/db/schema";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));

import * as clientService from "@/server/services/client-service";
import { CLIENT_EVENT_KINDS } from "@/lib/clients/activity";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
let ownerA: Awaited<ReturnType<typeof member>>;
let ownerB: Awaited<ReturnType<typeof member>>;
let readOnlyA: Awaited<ReturnType<typeof member>>;

async function member(options: {
  orgId?: string;
  grants?: string[];
  scope?: string;
  fullName?: string;
} = {}) {
  const orgId = options.orgId ?? orgA;
  const id = crypto.randomUUID();
  const authId = crypto.randomUUID();
  const roleId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const email = `${id}@example.test`;
  const fullName = options.fullName ?? "Pessoa de teste";
  await database.db.insert(users).values({ id, authUserId: authId, email, fullName });
  await database.db.insert(roles).values({ id: roleId, orgId, key: roleId, name: "Papel de teste" });
  await database.db.insert(memberships).values({ id: membershipId, orgId, userId: id, roleId, scope: options.scope ?? "org", createdAt: new Date() });
  for (const permissionKey of options.grants ?? ["client:read", "client:write"]) {
    await database.db.insert(rolePermissions).values({ roleId, permissionKey });
  }
  return { id, authId, email, fullName, roleId, membershipId, orgId };
}

function loginAs(actor: { authId: string; email: string }) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } });
}

async function counts() {
  const result = await database.pg.query<{ clients: number; contacts: number; events: number; audits: number }>(
    "select (select count(*)::int from public.clients) as clients, (select count(*)::int from public.client_contacts) as contacts, (select count(*)::int from public.activity_events) as events, (select count(*)::int from audit.log) as audits",
  );
  return result.rows[0];
}

beforeAll(async () => {
  database = await createTestDatabase();
  await applyTestMigration(database.pg, "0002_clients.sql");
  await applyTestMigration(database.pg, "0003_client_event_security.sql");
  mocks.getDb.mockReturnValue(database.db);
}, 30000);
afterAll(async () => {
  await database?.pg.close();
});
beforeEach(async () => {
  await database.pg.exec("truncate public.orgs, public.users, public.permissions, audit.log cascade");
  await database.db.insert(orgs).values([{ id: orgA, slug: "a", name: "A" }, { id: orgB, slug: "b", name: "B" }]);
  await database.db.insert(permissions).values(
    ["client:read", "client:write", "audit:read"].map((key) => ({ key, resource: key.split(":")[0]!, action: key.split(":")[1]!, description: "Teste" })),
  );
  ownerA = await member({ fullName: "Dona A" });
  ownerB = await member({ orgId: orgB, fullName: "Dona B" });
  readOnlyA = await member({ grants: ["client:read"], fullName: "Leitor A" });
  loginAs(ownerA);
});

describe("client-service — listagem e KPIs", () => {
  it("lista só clientes da própria organização", async () => {
    await database.db.insert(clients).values([
      { orgId: orgA, name: "Cliente A", createdBy: ownerA.id },
      { orgId: orgB, name: "Cliente B", createdBy: ownerB.id },
    ]);
    const result = await clientService.listClients({});
    expect(result.rows.map((r) => r.name)).toEqual(["Cliente A"]);
    expect(result.kpis.total).toBe(1);
  });

  it("nega listagem sem client:read", async () => {
    const denied = await member({ grants: [] });
    loginAs(denied);
    await expect(clientService.listClients({})).rejects.toMatchObject({ code: "forbidden" });
  });

  it("nega para scope assigned", async () => {
    const assigned = await member({ scope: "assigned" });
    loginAs(assigned);
    await expect(clientService.listClients({})).rejects.toMatchObject({ code: "forbidden" });
  });

  it("filtra por busca textual (nome, documento)", async () => {
    await database.db.insert(clients).values([
      { orgId: orgA, name: "Atlaz Studio", createdBy: ownerA.id },
      { orgId: orgA, name: "Outra Empresa", createdBy: ownerA.id, personType: "individual", document: "52998224725" },
    ]);
    expect((await clientService.listClients({ q: "atlaz" })).rows.map((r) => r.name)).toEqual(["Atlaz Studio"]);
    expect((await clientService.listClients({ q: "52998224725" })).rows.map((r) => r.name)).toEqual(["Outra Empresa"]);
  });

  it("filtra por status e por responsável", async () => {
    await database.db.insert(clients).values([
      { orgId: orgA, name: "Ativo", status: "active", createdBy: ownerA.id, ownerUserId: ownerA.id },
      { orgId: orgA, name: "Lead", status: "lead", createdBy: ownerA.id },
    ]);
    expect((await clientService.listClients({ status: "active" })).rows.map((r) => r.name)).toEqual(["Ativo"]);
    expect((await clientService.listClients({ responsavel: ownerA.id })).rows.map((r) => r.name)).toEqual(["Ativo"]);
  });

  it("ordena por nome (name) com A–Z", async () => {
    await database.db.insert(clients).values([
      { orgId: orgA, name: "Zebra", createdBy: ownerA.id },
      { orgId: orgA, name: "Abelha", createdBy: ownerA.id },
    ]);
    expect((await clientService.listClients({ sort: "name" })).rows.map((r) => r.name)).toEqual(["Abelha", "Zebra"]);
  });

  it("calcula KPIs agregados reais", async () => {
    await database.db.insert(clients).values([
      { orgId: orgA, name: "1", status: "active", createdBy: ownerA.id },
      { orgId: orgA, name: "2", status: "active", createdBy: ownerA.id },
      { orgId: orgA, name: "3", status: "onboarding", createdBy: ownerA.id },
      { orgId: orgA, name: "4", status: "paused", createdBy: ownerA.id },
      { orgId: orgA, name: "5", status: "lead", createdBy: ownerA.id },
    ]);
    expect((await clientService.listClients({})).kpis).toEqual({ total: 5, active: 2, onboarding: 1, paused: 1 });
  });

  it("lista responsáveis disponíveis só da própria org, ativos", async () => {
    const owners = await clientService.listAvailableOwners();
    expect(owners.map((o) => o.userId).sort()).toEqual([ownerA.id, readOnlyA.id].sort());
  });
});

describe("client-service — cadastro", () => {
  it("cria cliente com status default e grava evento + auditoria", async () => {
    const { id } = await clientService.createClient({ name: "Novo Cliente" });
    const [row] = await database.db.select().from(clients).where(eq(clients.id, id));
    expect(row).toMatchObject({ name: "Novo Cliente", status: "lead", version: 1, createdBy: ownerA.id, orgId: orgA });

    const events = await database.db.select().from(activityEvents).where(eq(activityEvents.entityId, id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: CLIENT_EVENT_KINDS.created, actorUserId: ownerA.id });

    const audits = await database.db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "client.create", actorLabel: ownerA.email });
  });

  it("cria cliente com contato principal na mesma transação", async () => {
    const { id } = await clientService.createClient(
      { name: "Com contato" },
      { name: "Fulano", email: "fulano@atlaz.test" },
    );
    const contacts = await database.db.select().from(clientContacts).where(eq(clientContacts.clientId, id));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: "Fulano", isPrimary: true });
    const events = await database.db.select({ kind: activityEvents.kind }).from(activityEvents).where(eq(activityEvents.entityId, id));
    expect(events.map((e) => e.kind).sort()).toEqual([CLIENT_EVENT_KINDS.contactAdded, CLIENT_EVENT_KINDS.created].sort());
  });

  it("rejeita nome vazio com erro de validação", async () => {
    await expect(clientService.createClient({ name: "   " })).rejects.toMatchObject({ code: "validation" });
  });

  it("nega cadastro sem client:write", async () => {
    loginAs(readOnlyA);
    await expect(clientService.createClient({ name: "Sem permissão" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejeita documento duplicado na mesma organização", async () => {
    await clientService.createClient({ name: "Primeiro", personType: "individual", document: "52998224725" });
    await expect(
      clientService.createClient({ name: "Segundo", personType: "individual", document: "529.982.247-25" }),
    ).rejects.toMatchObject({ code: "duplicate_document" });
  });

  it("permite o mesmo documento em organizações diferentes", async () => {
    await clientService.createClient({ name: "Primeiro", personType: "individual", document: "52998224725" });
    loginAs(ownerB);
    await expect(
      clientService.createClient({ name: "Segundo", personType: "individual", document: "52998224725" }),
    ).resolves.toBeDefined();
  });

  it("rejeita responsável que não pertence à organização", async () => {
    await expect(clientService.createClient({ name: "Inválido", ownerUserId: ownerB.id })).rejects.toMatchObject({ code: "invalid_owner" });
  });

  it("aceita CNPJ alfanumérico compatível com o Checkpoint 1", async () => {
    const { id } = await clientService.createClient({ name: "Empresa Nova", personType: "company", document: "12ABC34501DE35" });
    const [row] = await database.db.select().from(clients).where(eq(clients.id, id));
    expect(row?.document).toBe("12ABC34501DE35");
  });
});

describe("client-service — edição, versão e diffs", () => {
  it("atualiza campos e grava um único evento client.updated", async () => {
    const { id } = await clientService.createClient({ name: "Original" });
    await clientService.updateClient(id, { name: "Renomeado" }, 1);
    const [row] = await database.db.select().from(clients).where(eq(clients.id, id));
    expect(row).toMatchObject({ name: "Renomeado", version: 2 });
    const events = await database.db
      .select({ kind: activityEvents.kind })
      .from(activityEvents)
      .where(and(eq(activityEvents.entityId, id), eq(activityEvents.kind, CLIENT_EVENT_KINDS.updated)));
    expect(events).toHaveLength(1);
  });

  it("gera client.status_changed quando o status muda", async () => {
    const { id } = await clientService.createClient({ name: "Original" });
    await clientService.updateClient(id, { name: "Original", status: "active" }, 1);
    const events = await database.db.select({ kind: activityEvents.kind }).from(activityEvents).where(eq(activityEvents.entityId, id));
    expect(events.map((e) => e.kind)).toContain(CLIENT_EVENT_KINDS.statusChanged);
  });

  it("gera client.owner_changed quando o responsável muda", async () => {
    const { id } = await clientService.createClient({ name: "Original" });
    await clientService.updateClient(id, { name: "Original", ownerUserId: ownerA.id }, 1);
    const events = await database.db.select({ kind: activityEvents.kind }).from(activityEvents).where(eq(activityEvents.entityId, id));
    expect(events.map((e) => e.kind)).toContain(CLIENT_EVENT_KINDS.ownerChanged);
  });

  it("não grava evento quando nada muda de fato (idempotente)", async () => {
    const { id } = await clientService.createClient({ name: "Original" });
    await clientService.updateClient(id, { name: "Original" }, 1);
    const [row] = await database.db.select().from(clients).where(eq(clients.id, id));
    expect(row?.version).toBe(1);
    const events = await database.db.select().from(activityEvents).where(eq(activityEvents.entityId, id));
    expect(events).toHaveLength(1); // só o client.created
  });

  it("conflito de versão não sobrescreve e não deixa evento/auditoria órfãos", async () => {
    const { id } = await clientService.createClient({ name: "Original" });
    const before = await counts();
    await expect(clientService.updateClient(id, { name: "Tentativa" }, 99)).rejects.toMatchObject({ code: "conflict" });
    const [row] = await database.db.select().from(clients).where(eq(clients.id, id));
    expect(row).toMatchObject({ name: "Original", version: 1 });
    expect(await counts()).toEqual(before);
  });

  it("edição de outra organização é tratada como not_found", async () => {
    const { id } = await clientService.createClient({ name: "Da org A" });
    loginAs(ownerB);
    await expect(clientService.updateClient(id, { name: "Invasão" }, 1)).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejeita documento duplicado na edição, exceto o do próprio cliente", async () => {
    await clientService.createClient({ name: "Um", personType: "individual", document: "52998224725" });
    const { id: secondId } = await clientService.createClient({ name: "Dois", personType: "individual", document: "11144477735" });
    await expect(
      clientService.updateClient(secondId, { name: "Dois", personType: "individual", document: "52998224725" }, 1),
    ).rejects.toMatchObject({ code: "duplicate_document" });
    // manter o próprio documento (sem mudança) não deve disparar duplicidade
    await expect(
      clientService.updateClient(secondId, { name: "Dois renomeado", personType: "individual", document: "11144477735" }, 1),
    ).resolves.toBeDefined();
  });
});

describe("client-service — detalhe e isolamento", () => {
  it("retorna not_found para ID inexistente", async () => {
    await expect(clientService.getClientDetail(crypto.randomUUID())).rejects.toMatchObject({ code: "not_found" });
  });

  it("retorna not_found para cliente de outra organização (não revela existência)", async () => {
    const { id } = await clientService.createClient({ name: "Da org A" });
    loginAs(ownerB);
    await expect(clientService.getClientDetail(id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("inclui o nome do responsável no detalhe", async () => {
    const { id } = await clientService.createClient({ name: "Com dono", ownerUserId: ownerA.id });
    const detail = await clientService.getClientDetail(id);
    expect(detail.ownerName).toBe(ownerA.fullName);
  });
});

describe("client-service — contatos", () => {
  it("adiciona contato e avança a versão do cliente pai", async () => {
    const { id: clientId } = await clientService.createClient({ name: "Cliente" });
    await clientService.createClientContact(clientId, { name: "Contato 1" });
    const [row] = await database.db.select().from(clients).where(eq(clients.id, clientId));
    expect(row?.version).toBe(2);
    const events = await database.db.select({ kind: activityEvents.kind }).from(activityEvents).where(eq(activityEvents.entityId, clientId));
    expect(events.map((e) => e.kind)).toContain(CLIENT_EVENT_KINDS.contactAdded);
  });

  it("mantém no máximo um contato principal — o segundo desmarca o primeiro", async () => {
    const { id: clientId } = await clientService.createClient({ name: "Cliente" });
    const { id: contact1 } = await clientService.createClientContact(clientId, { name: "Um", isPrimary: "true" });
    await clientService.createClientContact(clientId, { name: "Dois", isPrimary: "true" });
    const contacts = await database.db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId));
    const primary = contacts.filter((c) => c.isPrimary);
    expect(primary).toHaveLength(1);
    expect(primary[0]?.name).toBe("Dois");
    expect(contacts.find((c) => c.id === contact1)?.isPrimary).toBe(false);
  });

  it("editar contato para principal desmarca o anterior e gera primary_contact_changed", async () => {
    const { id: clientId } = await clientService.createClient({ name: "Cliente" });
    const { id: c1 } = await clientService.createClientContact(clientId, { name: "Um", isPrimary: "true" });
    const { id: c2 } = await clientService.createClientContact(clientId, { name: "Dois" });
    await clientService.updateClientContact(clientId, c2, { name: "Dois", isPrimary: "true" });
    const contacts = await database.db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId));
    expect(contacts.find((c) => c.id === c1)?.isPrimary).toBe(false);
    expect(contacts.find((c) => c.id === c2)?.isPrimary).toBe(true);
    const events = await database.db.select({ kind: activityEvents.kind }).from(activityEvents).where(eq(activityEvents.entityId, clientId));
    expect(events.map((e) => e.kind)).toContain(CLIENT_EVENT_KINDS.primaryContactChanged);
  });

  it("definir como principal explicitamente troca sem promover automaticamente ao remover", async () => {
    const { id: clientId } = await clientService.createClient({ name: "Cliente" });
    const { id: c1 } = await clientService.createClientContact(clientId, { name: "Um", isPrimary: "true" });
    const { id: c2 } = await clientService.createClientContact(clientId, { name: "Dois" });
    await clientService.setPrimaryClientContact(clientId, c2);
    let contacts = await database.db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId));
    expect(contacts.find((c) => c.id === c2)?.isPrimary).toBe(true);

    await clientService.deleteClientContact(clientId, c2);
    contacts = await database.db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.id).toBe(c1);
    expect(contacts[0]?.isPrimary).toBe(false); // ninguém promovido automaticamente
  });

  it("remover contato gera client.contact_removed e não apaga o cliente", async () => {
    const { id: clientId } = await clientService.createClient({ name: "Cliente" });
    const { id: contactId } = await clientService.createClientContact(clientId, { name: "Removível" });
    await clientService.deleteClientContact(clientId, contactId);
    expect(await database.db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId))).toEqual([]);
    const events = await database.db.select({ kind: activityEvents.kind }).from(activityEvents).where(eq(activityEvents.entityId, clientId));
    expect(events.map((e) => e.kind)).toContain(CLIENT_EVENT_KINDS.contactRemoved);
  });

  it("contato de outra organização é not_found", async () => {
    const { id: clientId } = await clientService.createClient({ name: "Cliente A" });
    const { id: contactId } = await clientService.createClientContact(clientId, { name: "Contato A" });
    loginAs(ownerB);
    await expect(clientService.updateClientContact(clientId, contactId, { name: "Invasão" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("client-service — timeline", () => {
  it("lista só os eventos do cliente correto, mais recente primeiro", async () => {
    const { id: clientA } = await clientService.createClient({ name: "A" });
    const { id: clientB } = await clientService.createClient({ name: "B" });
    await clientService.updateClient(clientA, { name: "A2" }, 1);

    const timelineA = await clientService.listClientTimeline(clientA);
    expect(timelineA.rows.map((r) => r.kind)).toEqual([CLIENT_EVENT_KINDS.updated, CLIENT_EVENT_KINDS.created]);

    const timelineB = await clientService.listClientTimeline(clientB);
    expect(timelineB.rows.map((r) => r.kind)).toEqual([CLIENT_EVENT_KINDS.created]);
  });

  it("inclui o nome do ator em cada evento", async () => {
    const { id } = await clientService.createClient({ name: "Com ator" });
    const timeline = await clientService.listClientTimeline(id);
    expect(timeline.rows[0]?.actorName).toBe(ownerA.fullName);
  });
});

describe("client-service — consolidação de queries (Checkpoint 3, Etapa L)", () => {
  it("getClientWorkspace devolve cliente + contatos + timeline em uma chamada, equivalente às funções isoladas", async () => {
    const { id: clientId } = await clientService.createClient({ name: "Workspace" });
    await clientService.createClientContact(clientId, { name: "Contato" });

    const workspace = await clientService.getClientWorkspace(clientId);
    expect(workspace.client).toMatchObject({ id: clientId, name: "Workspace" });
    expect(workspace.contacts.map((c) => c.name)).toEqual(["Contato"]);
    expect(workspace.timeline.rows.map((r) => r.kind)).toEqual(
      [CLIENT_EVENT_KINDS.contactAdded, CLIENT_EVENT_KINDS.created],
    );
  });

  it("getClientWorkspace é not_found para outra organização, sem vazar contatos/timeline", async () => {
    const { id: clientId } = await clientService.createClient({ name: "Da org A" });
    loginAs(ownerB);
    await expect(clientService.getClientWorkspace(clientId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("getClientsPageData devolve listagem, KPIs e responsáveis coerentes com as funções isoladas", async () => {
    await database.db.insert(clients).values({ orgId: orgA, name: "Cliente único", status: "active", createdBy: ownerA.id });
    const combined = await clientService.getClientsPageData({});
    expect(combined.rows.map((r) => r.name)).toEqual(["Cliente único"]);
    expect(combined.kpis).toEqual({ total: 1, active: 1, onboarding: 0, paused: 0 });
    expect(combined.owners.map((o) => o.userId).sort()).toEqual([ownerA.id, readOnlyA.id].sort());
  });
});
