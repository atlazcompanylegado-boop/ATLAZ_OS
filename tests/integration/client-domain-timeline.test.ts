// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activityEvents, clients, rolePermissions } from "@/server/db/schema";
import { ORG_A, domainDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/domains";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));

import * as clientService from "@/server/services/client-service";
import * as projectService from "@/server/services/project-service";
import * as ticketService from "@/server/services/ticket-service";
import * as domainService from "@/server/services/domain-service";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;

function login(actor: { authId: string; email: string }) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } });
}
async function grantDomain(roleId: string) {
  await database.db.insert(rolePermissions).values([{ roleId, permissionKey: "domain:read" }, { roleId, permissionKey: "domain:write" }]);
}

beforeAll(async () => {
  database = await domainDatabase();
  mocks.getDb.mockReturnValue(database.db);
}, 60000);
afterAll(async () => {
  await database?.pg.close();
});
beforeEach(async () => {
  seed = await seedProjects(database);
  await grantDomain(seed.ownerA.roleId); // ownerA já tem project:read+write+client:read; soma domain:*
  login(seed.ownerA);
});

async function insertClientEvent(clientId: string, kind: string, summary: string, occurredAt?: Date) {
  const [row] = await database.db.insert(activityEvents).values({
    orgId: ORG_A, entityType: "client", entityId: clientId, kind, summary, actorUserId: seed.ownerA.id, occurredAt,
  }).returning();
  return row!;
}
async function insertRawDomainEvent(orgId: string, domainId: string, kind: string, summary: string, occurredAt?: Date) {
  const [row] = await database.db.insert(activityEvents).values({ orgId, entityType: "domain", entityId: domainId, kind, summary, occurredAt }).returning();
  return row!;
}

describe("Timeline consolidada do Cliente — eventos de Domínios (Checkpoint B)", () => {
  it("A. client:read sem domain:read: só eventos do Cliente, sem nome/evento/contagem de domínios", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    const domain = await domainService.createDomain({ clientId: seed.clientA.id, domainName: "sigiloso.com", expirationDate: "2027-01-01" });

    const readerOnlyClient = await projectMember(database, { grants: ["client:read"] });
    login(readerOnlyClient);
    const timeline = await clientService.listClientTimeline(seed.clientA.id);

    expect(timeline.rows.map((r) => r.kind)).toEqual(["client.created"]);
    expect(timeline.rows.every((r) => r.domainName === null)).toBe(true);
    expect(timeline.total).toBe(1);
    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain("sigiloso.com");
    expect(serialized).not.toContain(domain.id);
  });

  it("B. client:read + domain:read: eventos do Cliente e dos domínios daquele cliente juntos", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await domainService.createDomain({ clientId: seed.clientA.id, domainName: "junto.com", expirationDate: "2027-01-01" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id); // ownerA tem client:read + domain:read
    expect(timeline.rows.map((r) => r.kind).sort()).toEqual(["client.created", "domain.created"]);
    const domainEntry = timeline.rows.find((r) => r.kind === "domain.created");
    expect(domainEntry?.domainName).toBe("junto.com");
  });

  it("C/D. domínio do mesmo cliente aparece; domínio de outro cliente da mesma org não aparece", async () => {
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    await domainService.createDomain({ clientId: seed.clientA.id, domainName: "do-cliente-a.com", expirationDate: "2027-01-01" });
    await domainService.createDomain({ clientId: clientA2!.id, domainName: "do-outro-cliente.com", expirationDate: "2027-01-01" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.domainName === "do-cliente-a.com")).toBe(true);
    expect(timeline.rows.some((r) => r.domainName === "do-outro-cliente.com")).toBe(false);
  });

  it("E. evento de domínio de outra org nunca aparece, mesmo forjando activity_events.org_id para a org atual", async () => {
    login(seed.ownerB);
    await grantDomain(seed.ownerB.roleId);
    const domainB = await domainService.createDomain({ clientId: seed.clientB.id, domainName: "org-b.com", expirationDate: "2027-01-01" });

    login(seed.ownerA);
    await insertRawDomainEvent(ORG_A, domainB.id, "domain.created", "Tentativa de vazamento cross-org");
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.summary.includes("vazamento"))).toBe(false);
  });

  it("F. evento de domínio órfão (sem linha correspondente em domains) não aparece", async () => {
    await insertRawDomainEvent(ORG_A, crypto.randomUUID(), "domain.created", "Evento órfão");
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.summary.includes("órfão"))).toBe(false);
    expect(timeline.total).toBe(0);
  });

  it("G. paginação consolidada: 20 itens no total por página, nunca somando por fonte", async () => {
    for (let i = 0; i < 15; i++) await insertClientEvent(seed.clientA.id, "client.updated", `Evento de cliente ${i}`);
    for (let i = 0; i < 15; i++) await domainService.createDomain({ clientId: seed.clientA.id, domainName: `dominio-${i}.com`, expirationDate: "2027-01-01" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id, 1);
    expect(timeline.rows).toHaveLength(20);
    expect(timeline.total).toBe(30);
  });

  it("H. ordenação cronológica única — eventos de Cliente e de Domínios competem pela mesma ordem", async () => {
    const domain = await domainService.createDomain({ clientId: seed.clientA.id, domainName: "d1.com", expirationDate: "2027-01-01" });
    const base = Date.now();
    await insertClientEvent(seed.clientA.id, "client.updated", "Cliente e1", new Date(base + 1000));
    await insertRawDomainEvent(ORG_A, domain.id, "domain.updated", "Domínio e2", new Date(base + 2000));
    await insertClientEvent(seed.clientA.id, "client.updated", "Cliente e3", new Date(base + 3000));
    await insertRawDomainEvent(ORG_A, domain.id, "domain.expiration_changed", "Domínio e4", new Date(base + 4000));

    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.map((r) => r.summary).slice(0, 4)).toEqual(["Domínio e4", "Cliente e3", "Domínio e2", "Cliente e1"]);
  });

  it("I. sem duplicação: cada evento aparece uma única vez", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await domainService.createDomain({ clientId: seed.clientA.id, domainName: "unico.com", expirationDate: "2027-01-01" });
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(new Set(timeline.rows.map((r) => r.id)).size).toBe(timeline.rows.length);
  });

  it("J. regressão: getClientWorkspace continua compondo cliente + contatos + timeline consolidada", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await domainService.createDomain({ clientId: seed.clientA.id, domainName: "workspace.com", expirationDate: "2027-01-01" });
    const workspace = await clientService.getClientWorkspace(seed.clientA.id);
    expect(workspace.client.id).toBe(seed.clientA.id);
    expect(workspace.timeline.rows.map((r) => r.kind).sort()).toEqual(["client.created", "domain.created"]);
  });

  it("K. quatro fontes juntas: Cliente + Projeto + Suporte + Domínio no mesmo stream, cada um com seu identificador próprio", async () => {
    await database.db.insert(rolePermissions).values([{ roleId: seed.ownerA.roleId, permissionKey: "ticket:read" }, { roleId: seed.ownerA.roleId, permissionKey: "ticket:write" }]);
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await projectService.createProject({ clientId: seed.clientA.id, name: "Projeto X" });
    const ticket = await ticketService.createTicket({ clientId: seed.clientA.id, title: "Chamado X", description: "x" });
    await domainService.createDomain({ clientId: seed.clientA.id, domainName: "dominio-x.com", expirationDate: "2027-01-01" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.map((r) => r.kind).sort()).toEqual(["client.created", "domain.created", "project.created", "ticket.created"]);
    const projectEntry = timeline.rows.find((r) => r.kind === "project.created")!;
    const ticketEntry = timeline.rows.find((r) => r.kind === "ticket.created")!;
    const domainEntry = timeline.rows.find((r) => r.kind === "domain.created")!;
    expect(projectEntry.projectName).toBe("Projeto X");
    expect(projectEntry.ticketNumber).toBeNull(); expect(projectEntry.domainName).toBeNull();
    expect(ticketEntry.ticketNumber).toBe(ticket.ticketNumber);
    expect(ticketEntry.projectName).toBeNull(); expect(ticketEntry.domainName).toBeNull();
    expect(domainEntry.domainName).toBe("dominio-x.com");
    expect(domainEntry.projectName).toBeNull(); expect(domainEntry.ticketNumber).toBeNull();
  });

  it("L. domain.project_changed nunca vaza nome/ID do projeto na timeline consolidada, mesmo sem project:read", async () => {
    const project = await projectService.createProject({ clientId: seed.clientA.id, name: "Projeto Secreto" });
    const domain = await domainService.createDomain({ clientId: seed.clientA.id, domainName: "com-projeto.com", expirationDate: "2027-01-01" });
    await domainService.updateDomain(domain.id, { projectId: project.id }, 1);

    const readerNoProject = await projectMember(database, { grants: ["client:read", "domain:read"] });
    login(readerNoProject);
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    const changed = timeline.rows.find((r) => r.kind === "domain.project_changed");
    expect(changed).toBeDefined();
    expect(changed?.summary).toBe("Projeto vinculado");
    expect(changed?.projectName).toBeNull();
    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain("Projeto Secreto");
    expect(serialized).not.toContain(project.id);
  });

  it("M. quatro combinações independentes de permissão isolam corretamente as fontes", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await projectService.createProject({ clientId: seed.clientA.id, name: "P" });
    await domainService.createDomain({ clientId: seed.clientA.id, domainName: "combinacao.com", expirationDate: "2027-01-01" });

    const onlyClient = await projectMember(database, { grants: ["client:read"] });
    login(onlyClient);
    expect((await clientService.listClientTimeline(seed.clientA.id)).rows.map((r) => r.kind).sort()).toEqual(["client.created"]);

    const clientAndDomain = await projectMember(database, { grants: ["client:read", "domain:read"] });
    login(clientAndDomain);
    expect((await clientService.listClientTimeline(seed.clientA.id)).rows.map((r) => r.kind).sort()).toEqual(["client.created", "domain.created"]);

    const clientAndProject = await projectMember(database, { grants: ["client:read", "project:read"] });
    login(clientAndProject);
    expect((await clientService.listClientTimeline(seed.clientA.id)).rows.map((r) => r.kind).sort()).toEqual(["client.created", "project.created"]);
  });
});
