// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activityEvents, clients, rolePermissions } from "@/server/db/schema";
import { ORG_A, ticketDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/tickets";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));

import * as clientService from "@/server/services/client-service";
import * as projectService from "@/server/services/project-service";
import * as ticketService from "@/server/services/ticket-service";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;

function login(actor: { authId: string; email: string }) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } });
}
async function grantTicket(roleId: string) {
  await database.db.insert(rolePermissions).values([{ roleId, permissionKey: "ticket:read" }, { roleId, permissionKey: "ticket:write" }]);
}

beforeAll(async () => {
  database = await ticketDatabase();
  mocks.getDb.mockReturnValue(database.db);
}, 60000);
afterAll(async () => {
  await database?.pg.close();
});
beforeEach(async () => {
  seed = await seedProjects(database);
  await grantTicket(seed.ownerA.roleId); // ownerA já tem project:read+write+client:read; soma ticket:*
  login(seed.ownerA);
});

async function insertClientEvent(clientId: string, kind: string, summary: string, occurredAt?: Date) {
  const [row] = await database.db.insert(activityEvents).values({
    orgId: ORG_A, entityType: "client", entityId: clientId, kind, summary, actorUserId: seed.ownerA.id, occurredAt,
  }).returning();
  return row!;
}
async function insertRawTicketEvent(orgId: string, ticketId: string, kind: string, summary: string, occurredAt?: Date) {
  const [row] = await database.db.insert(activityEvents).values({ orgId, entityType: "ticket", entityId: ticketId, kind, summary, occurredAt }).returning();
  return row!;
}

describe("Timeline consolidada do Cliente — eventos de Suporte (Checkpoint B)", () => {
  it("A. client:read sem ticket:read: só eventos do Cliente, sem número/evento/contagem de chamados", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    const ticket = await ticketService.createTicket({ clientId: seed.clientA.id, title: "Chamado sigiloso", description: "x" });

    const readerOnlyClient = await projectMember(database, { grants: ["client:read"] });
    login(readerOnlyClient);
    const timeline = await clientService.listClientTimeline(seed.clientA.id);

    expect(timeline.rows.map((r) => r.kind)).toEqual(["client.created"]);
    expect(timeline.rows.every((r) => r.ticketNumber === null)).toBe(true);
    expect(timeline.total).toBe(1);
    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain("Chamado sigiloso");
    expect(serialized).not.toContain(ticket.id);
  });

  it("B. client:read + ticket:read: eventos do Cliente e dos chamados daquele cliente juntos", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    const ticket = await ticketService.createTicket({ clientId: seed.clientA.id, title: "Chamado", description: "x" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id); // ownerA tem client:read + ticket:read
    expect(timeline.rows.map((r) => r.kind).sort()).toEqual(["client.created", "ticket.created"]);
    const ticketEntry = timeline.rows.find((r) => r.kind === "ticket.created");
    expect(ticketEntry?.ticketNumber).toBe(ticket.ticketNumber);
  });

  it("C/D. chamado do mesmo cliente aparece; chamado de outro cliente da mesma org não aparece", async () => {
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    const t1 = await ticketService.createTicket({ clientId: seed.clientA.id, title: "Do Cliente A", description: "x" });
    await ticketService.createTicket({ clientId: clientA2!.id, title: "Do Outro Cliente", description: "x" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.ticketNumber === t1.ticketNumber)).toBe(true);
    expect(timeline.rows.some((r) => r.summary.includes("Do Outro Cliente"))).toBe(false);
  });

  it("E. evento de chamado de outra org nunca aparece, mesmo forjando activity_events.org_id para a org atual", async () => {
    login(seed.ownerB);
    await grantTicket(seed.ownerB.roleId);
    const ticketB = await ticketService.createTicket({ clientId: seed.clientB.id, title: "Chamado Org B", description: "x" });

    login(seed.ownerA);
    await insertRawTicketEvent(ORG_A, ticketB.id, "ticket.created", "Tentativa de vazamento cross-org");
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.summary.includes("vazamento"))).toBe(false);
  });

  it("F. evento de chamado órfão (sem linha correspondente em support_tickets) não aparece", async () => {
    await insertRawTicketEvent(ORG_A, crypto.randomUUID(), "ticket.created", "Evento órfão");
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.summary.includes("órfão"))).toBe(false);
    expect(timeline.total).toBe(0);
  });

  it("G. paginação consolidada: 20 itens no total por página, nunca somando por fonte", async () => {
    for (let i = 0; i < 15; i++) await insertClientEvent(seed.clientA.id, "client.updated", `Evento de cliente ${i}`);
    for (let i = 0; i < 15; i++) await ticketService.createTicket({ clientId: seed.clientA.id, title: `Chamado ${i}`, description: "x" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id, 1);
    expect(timeline.rows).toHaveLength(20);
    expect(timeline.total).toBe(30);
  });

  it("H. ordenação cronológica única — eventos de Cliente e de Suporte competem pela mesma ordem", async () => {
    const ticket = await ticketService.createTicket({ clientId: seed.clientA.id, title: "T1", description: "x" });
    const base = Date.now();
    await insertClientEvent(seed.clientA.id, "client.updated", "Cliente e1", new Date(base + 1000));
    await insertRawTicketEvent(ORG_A, ticket.id, "ticket.status_changed", "Chamado e2", new Date(base + 2000));
    await insertClientEvent(seed.clientA.id, "client.updated", "Cliente e3", new Date(base + 3000));
    await insertRawTicketEvent(ORG_A, ticket.id, "ticket.priority_changed", "Chamado e4", new Date(base + 4000));

    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.map((r) => r.summary).slice(0, 4)).toEqual(["Chamado e4", "Cliente e3", "Chamado e2", "Cliente e1"]);
  });

  it("I. sem duplicação: cada evento aparece uma única vez", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await ticketService.createTicket({ clientId: seed.clientA.id, title: "Único", description: "x" });
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(new Set(timeline.rows.map((r) => r.id)).size).toBe(timeline.rows.length);
  });

  it("J. regressão: getClientWorkspace continua compondo cliente + contatos + timeline consolidada", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await ticketService.createTicket({ clientId: seed.clientA.id, title: "Workspace", description: "x" });
    const workspace = await clientService.getClientWorkspace(seed.clientA.id);
    expect(workspace.client.id).toBe(seed.clientA.id);
    expect(workspace.timeline.rows.map((r) => r.kind).sort()).toEqual(["client.created", "ticket.created"]);
  });

  it("K. três fontes juntas: Cliente + Projeto + Suporte no mesmo stream, cada um com seu identificador próprio", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await projectService.createProject({ clientId: seed.clientA.id, name: "Projeto X" });
    const ticket = await ticketService.createTicket({ clientId: seed.clientA.id, title: "Chamado X", description: "x" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.map((r) => r.kind).sort()).toEqual(["client.created", "project.created", "ticket.created"]);
    const projectEntry = timeline.rows.find((r) => r.kind === "project.created")!;
    const ticketEntry = timeline.rows.find((r) => r.kind === "ticket.created")!;
    expect(projectEntry.projectName).toBe("Projeto X");
    expect(projectEntry.ticketNumber).toBeNull();
    expect(ticketEntry.ticketNumber).toBe(ticket.ticketNumber);
    expect(ticketEntry.projectName).toBeNull();
  });

  it("L. ticket.project_changed nunca vaza nome/ID do Projeto na timeline consolidada, mesmo sem project:read", async () => {
    const project = await projectService.createProject({ clientId: seed.clientA.id, name: "Projeto Secreto" });
    const ticket = await ticketService.createTicket({ clientId: seed.clientA.id, title: "Chamado com projeto", description: "x" });
    await ticketService.updateTicket(
      ticket.id,
      { title: "Chamado com projeto", description: "x", status: "open", priority: "normal", projectId: project.id, assignedUserId: null, dueAt: null },
      ticket.version,
    );

    const readerNoProject = await projectMember(database, { grants: ["client:read", "ticket:read"] });
    login(readerNoProject);
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    const changed = timeline.rows.find((r) => r.kind === "ticket.project_changed");
    expect(changed).toBeDefined();
    expect(changed?.summary).toBe("Projeto vinculado");
    expect(changed?.projectName).toBeNull();
    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain("Projeto Secreto");
    expect(serialized).not.toContain(project.id);
  });
});
