// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activityEvents, clients } from "@/server/db/schema";
import { ORG_A, projectDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/projects";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));

import * as clientService from "@/server/services/client-service";
import * as projectService from "@/server/services/project-service";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;

function login(actor: { authId: string; email: string }) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } });
}

beforeAll(async () => {
  database = await projectDatabase();
  mocks.getDb.mockReturnValue(database.db);
}, 60000);
afterAll(async () => {
  await database?.pg.close();
});
beforeEach(async () => {
  seed = await seedProjects(database);
  login(seed.ownerA);
});

/** Insere um evento de Cliente diretamente (sem passar pelo service) — fixture controlada, não o caminho de produção. */
async function insertClientEvent(clientId: string, kind: string, summary: string, occurredAt?: Date) {
  const [row] = await database.db.insert(activityEvents).values({
    orgId: ORG_A, entityType: "client", entityId: clientId, kind, summary, actorUserId: seed.ownerA.id, occurredAt,
  }).returning();
  return row!;
}
/** Insere um evento de Projeto "cru" (sem passar pelo producer real) — usado para simular órfãos/forjados. */
async function insertRawProjectEvent(orgId: string, projectId: string, kind: string, summary: string, occurredAt?: Date) {
  const [row] = await database.db.insert(activityEvents).values({ orgId, entityType: "project", entityId: projectId, kind, summary, occurredAt }).returning();
  return row!;
}

describe("Timeline consolidada do Cliente — eventos de Projetos (Checkpoint D.1)", () => {
  it("A. client:read sem project:read: só eventos do Cliente, sem nome/evento/contagem de Projetos", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    const project = await projectService.createProject({ clientId: seed.clientA.id, name: "Website Institucional" });

    const readerOnlyClient = await projectMember(database, { grants: ["client:read"] });
    login(readerOnlyClient);
    const timeline = await clientService.listClientTimeline(seed.clientA.id);

    expect(timeline.rows.map((r) => r.kind)).toEqual(["client.created"]);
    expect(timeline.rows.every((r) => r.projectName === null)).toBe(true);
    expect(timeline.total).toBe(1);
    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain("Website Institucional");
    expect(serialized).not.toContain(project.id);
  });

  it("B. client:read + project:read: eventos do Cliente e dos Projetos daquele cliente juntos", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await projectService.createProject({ clientId: seed.clientA.id, name: "Website Institucional" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id); // ownerA já tem client:read + project:read
    expect(timeline.rows.map((r) => r.kind).sort()).toEqual(["client.created", "project.created"]);
    const projectEntry = timeline.rows.find((r) => r.kind === "project.created");
    expect(projectEntry?.projectName).toBe("Website Institucional");
    expect(projectEntry?.summary).toContain("Website Institucional");
  });

  it("C/D. projeto do mesmo cliente aparece; projeto de outro cliente da mesma org não aparece", async () => {
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    await projectService.createProject({ clientId: seed.clientA.id, name: "Projeto do Cliente A" });
    await projectService.createProject({ clientId: clientA2!.id, name: "Projeto do Outro Cliente" });

    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.projectName === "Projeto do Cliente A")).toBe(true);
    expect(timeline.rows.some((r) => r.projectName === "Projeto do Outro Cliente")).toBe(false);
  });

  it("E. evento de projeto de outra org nunca aparece, mesmo forjando activity_events.org_id para a org atual", async () => {
    login(seed.ownerB);
    const projectB = await projectService.createProject({ clientId: seed.clientB.id, name: "Projeto Org B" });
    // Simula um evento cujo org_id foi manipulado para a org A, mas o projeto real pertence à org B —
    // o INNER JOIN exige projects.org_id = orgId da sessão, então isso nunca deve casar.
    await insertRawProjectEvent(ORG_A, projectB.id, "project.created", "Tentativa de vazamento cross-org");

    login(seed.ownerA);
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.summary.includes("vazamento"))).toBe(false);
  });

  it("F. evento de projeto órfão (sem linha correspondente em projects) não aparece", async () => {
    await insertRawProjectEvent(ORG_A, crypto.randomUUID(), "project.created", "Evento órfão");
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.some((r) => r.summary.includes("órfão"))).toBe(false);
    expect(timeline.total).toBe(0);
  });

  it("G. paginação consolidada: 20 itens no total por página, nunca 20 de cada fonte somados", async () => {
    for (let i = 0; i < 15; i++) await insertClientEvent(seed.clientA.id, "client.updated", `Evento de cliente ${i}`);
    for (let i = 0; i < 15; i++) await projectService.createProject({ clientId: seed.clientA.id, name: `Projeto ${i}` });

    const timeline = await clientService.listClientTimeline(seed.clientA.id, 1);
    expect(timeline.rows).toHaveLength(20);
    expect(timeline.total).toBe(30);
  });

  it("H. ordenação cronológica única — eventos de Cliente e Projeto competem pela mesma ordem", async () => {
    const project = await projectService.createProject({ clientId: seed.clientA.id, name: "P1" }); // evento mais antigo (now())
    const base = Date.now();
    await insertClientEvent(seed.clientA.id, "client.updated", "Cliente e1", new Date(base + 1000));
    await insertRawProjectEvent(ORG_A, project.id, "project.status_changed", "Projeto e2", new Date(base + 2000));
    await insertClientEvent(seed.clientA.id, "client.updated", "Cliente e3", new Date(base + 3000));
    await insertRawProjectEvent(ORG_A, project.id, "project.priority_changed", "Projeto e4", new Date(base + 4000));

    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(timeline.rows.map((r) => r.summary).slice(0, 4)).toEqual(["Projeto e4", "Cliente e3", "Projeto e2", "Cliente e1"]);
    expect(timeline.rows.at(-1)?.kind).toBe("project.created");
  });

  it("I. sem duplicação: cada evento aparece uma única vez na timeline consolidada", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await projectService.createProject({ clientId: seed.clientA.id, name: "Único" });
    const timeline = await clientService.listClientTimeline(seed.clientA.id);
    expect(new Set(timeline.rows.map((r) => r.id)).size).toBe(timeline.rows.length);
  });

  it("J. regressão: getClientWorkspace continua compondo cliente + contatos + timeline consolidada", async () => {
    await insertClientEvent(seed.clientA.id, "client.created", "Cliente criado");
    await projectService.createProject({ clientId: seed.clientA.id, name: "Workspace" });
    const workspace = await clientService.getClientWorkspace(seed.clientA.id);
    expect(workspace.client.id).toBe(seed.clientA.id);
    expect(workspace.timeline.rows.map((r) => r.kind).sort()).toEqual(["client.created", "project.created"]);
  });
});
