// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, auditLog, projects, rolePermissions, supportTickets } from "@/server/db/schema";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); }),
}));

import * as service from "@/server/services/ticket-service";
import { createTicketAction, updateTicketAction } from "@/app/(app)/suporte/actions";
import { EDIT_FORM_FIELDS_WITHOUT_PROJECT } from "../helpers/ticket-form-fields";
import { ORG_A, ORG_B, ticketDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/tickets";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;
let projectA: { id: string; name: string };
let projectB: { id: string; name: string };

const PROJECT_A_NAME = "Projeto Secreto Alfa";
const PROJECT_B_NAME = "Projeto Secreto Beta";
const base = { title: "Chamado", description: "Descrição", priority: "normal", assignedUserId: null, dueAt: null };

function login(actor: { authId: string; email: string }) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } });
}
async function ticketRow(id: string) {
  const [row] = await database.db.select().from(supportTickets).where(eq(supportTickets.id, id));
  return row!;
}
async function projectEvents(ticketId: string) {
  return (await database.db.select().from(activityEvents).where(eq(activityEvents.entityId, ticketId)))
    .filter((e) => e.kind === "ticket.project_changed");
}
/** Mesmo conjunto de campos que o formulário de edição envia a quem não tem project:read. */
function editFormData(ticketId: string, version: number, values: Record<string, string>) {
  const fd = new FormData();
  const defaults: Record<string, string> = { ticketId, version: String(version), title: "Chamado", description: "Descrição", priority: "normal", assignedUserId: "", dueAt: "" };
  for (const field of EDIT_FORM_FIELDS_WITHOUT_PROJECT) fd.set(field, values[field] ?? defaults[field] ?? "");
  return fd;
}
async function expectRedirect(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ message: "NEXT_REDIRECT" });
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
  await database.db.insert(rolePermissions).values([
    { roleId: seed.ownerA.roleId, permissionKey: "ticket:read" },
    { roleId: seed.ownerA.roleId, permissionKey: "ticket:write" },
  ]);
  const inserted = await database.db.insert(projects).values([
    { orgId: ORG_A, clientId: seed.clientA.id, name: PROJECT_A_NAME, createdBy: seed.ownerA.id },
    { orgId: ORG_A, clientId: seed.clientA.id, name: PROJECT_B_NAME, createdBy: seed.ownerA.id },
  ]).returning();
  projectA = inserted[0]!;
  projectB = inserted[1]!;
  login(seed.ownerA); // project:* + client:read + ticket:*
});

async function linkedTicket(extra: Record<string, unknown> = {}) {
  login(seed.ownerA);
  return service.createTicket({ clientId: seed.clientA.id, ...base, projectId: projectA.id, ...extra });
}
async function maskedWriter() {
  const actor = await projectMember(database, { grants: ["ticket:read", "ticket:write", "client:read"] });
  login(actor);
  return actor;
}
async function maskedReader() {
  const actor = await projectMember(database, { grants: ["ticket:read", "client:read"] });
  login(actor);
  return actor;
}

describe("Hotfix — sem project:read, leitura continua e nada do Projeto vaza", () => {
  it("A/B/C. lista, detalhe, workspace e page data: tickets acessíveis, sem nome/UUID do Projeto", async () => {
    const linked = await linkedTicket({ title: "Com projeto" });
    await service.createTicket({ clientId: seed.clientA.id, ...base, title: "Sem projeto", projectId: null });
    await maskedReader();

    const list = await service.listTickets();
    const page = await service.getTicketsPageData();
    const detail = await service.getTicketDetail(linked.id);
    const workspace = await service.getTicketWorkspace(linked.id);

    expect(list.total).toBe(2);
    expect(page.total).toBe(2);
    expect(detail).toMatchObject({ hasProject: true, projectId: null, projectName: null });
    for (const payload of [list, page, detail, workspace]) {
      const json = JSON.stringify(payload);
      expect(json).not.toContain(PROJECT_A_NAME);
      expect(json).not.toContain(projectA.id);
    }
  });

  it("D. seletor/lookup de Projeto negados antes de qualquer validação ou consulta", async () => {
    await maskedReader();
    await expect(service.listTicketProjects({ clientId: seed.clientA.id })).rejects.toMatchObject({ code: "forbidden" });
    // Entrada inválida ainda é "forbidden": a permissão é checada antes de parse/consulta.
    await expect(service.listTicketProjects({ clientId: "invalido" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.getTicketProject(seed.clientA.id, projectA.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.getTicketProject("invalido", "invalido")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("E/F. filtro de Projeto vindo da URL é ignorado (sem oráculo de existência)", async () => {
    await linkedTicket({ title: "Com projeto" });
    await service.createTicket({ clientId: seed.clientA.id, ...base, title: "Sem projeto", projectId: null });
    await maskedReader();

    const unfiltered = await service.getTicketsPageData();
    const realProject = await service.getTicketsPageData({ projectId: projectA.id });
    const unknownProject = await service.getTicketsPageData({ projectId: crypto.randomUUID() });
    const legacyParam = await service.getTicketsPageData({ project: projectA.id });

    for (const result of [realProject, unknownProject, legacyParam]) {
      expect(result.total).toBe(unfiltered.total);
      expect(result.rows.map((r) => r.id).sort()).toEqual(unfiltered.rows.map((r) => r.id).sort());
      expect(result.filters.projectId).toBeNull();
    }
    expect((await service.listTickets({ projectId: projectA.id })).total).toBe(2);
  });

  it("G. busca pelo nome do Projeto não encontra o chamado", async () => {
    await linkedTicket({ title: "Chamado neutro" });
    await maskedReader();
    expect((await service.listTickets({ q: "Secreto Alfa" })).total).toBe(0);
    expect((await service.getTicketsPageData({ q: "Secreto" })).total).toBe(0);
    // Busca pelos demais campos continua funcionando.
    expect((await service.listTickets({ q: "neutro" })).total).toBe(1);
    expect((await service.listTickets({ q: "Cliente A" })).total).toBe(1);
  });
});

describe("Hotfix — sem project:read, escrita não toca o vínculo", () => {
  it("I. criação com projectId forjado é rejeitada (projeto real ou inexistente, mesmo código)", async () => {
    await maskedWriter();
    for (const projectId of [projectA.id, crypto.randomUUID()]) {
      await expect(service.createTicket({ clientId: seed.clientA.id, ...base, projectId })).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await database.db.select().from(supportTickets)).toHaveLength(0);
  });

  it("criação sem projectId funciona e nasce sem projeto (service e Server Action)", async () => {
    await maskedWriter();
    const created = await service.createTicket({ clientId: seed.clientA.id, ...base });
    expect((await ticketRow(created.id)).projectId).toBeNull();

    const fd = new FormData();
    for (const [key, value] of Object.entries({ clientId: seed.clientA.id, title: "Via formulário", description: "x", priority: "high", assignedUserId: "", dueAt: "" })) fd.set(key, value);
    await expectRedirect(createTicketAction(undefined, fd));
    const [viaForm] = await database.db.select().from(supportTickets).where(eq(supportTickets.title, "Via formulário"));
    expect(viaForm).toMatchObject({ projectId: null, priority: "high", status: "open" });
  });

  it("J. editar título preserva project_id", async () => {
    const t = await linkedTicket();
    await maskedWriter();
    await service.updateTicket(t.id, { ...base, title: "Título novo" }, 1);
    expect(await ticketRow(t.id)).toMatchObject({ title: "Título novo", projectId: projectA.id, version: 2 });
    expect(await projectEvents(t.id)).toHaveLength(0);
  });

  it("K. editar descrição preserva project_id e o status atual", async () => {
    const t = await linkedTicket({ status: "in_progress" });
    await maskedWriter();
    await service.updateTicket(t.id, { ...base, description: "Descrição nova" }, 1);
    expect(await ticketRow(t.id)).toMatchObject({ description: "Descrição nova", projectId: projectA.id, status: "in_progress" });
    expect(await projectEvents(t.id)).toHaveLength(0);
  });

  it("L. não consegue remover nem trocar o vínculo (null, vazio ou outro projeto)", async () => {
    const t = await linkedTicket();
    await maskedWriter();
    for (const projectId of [null, "", projectB.id]) {
      await expect(service.updateTicket(t.id, { ...base, title: "Tentativa", projectId }, 1)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await ticketRow(t.id)).toMatchObject({ title: "Chamado", projectId: projectA.id, version: 1 });
    expect(await projectEvents(t.id)).toHaveLength(0);
  });

  it("17. BUG DE PRODUÇÃO: formulário real (sem status, sem projectId) → só prioridade muda; status e vínculo intactos", async () => {
    const t = await linkedTicket({ status: "in_progress", priority: "normal" });
    expect(await ticketRow(t.id)).toMatchObject({ status: "in_progress", priority: "normal", projectId: projectA.id, version: 1 });
    await maskedWriter();

    // Mesmos campos que o <form> renderizado envia: nenhum status, nenhum projectId.
    await expectRedirect(updateTicketAction(undefined, editFormData(t.id, 1, { priority: "high" })));

    expect(await ticketRow(t.id)).toMatchObject({ priority: "high", status: "in_progress", projectId: projectA.id, version: 2 });
    const kinds = (await database.db.select().from(activityEvents).where(eq(activityEvents.entityId, t.id))).map((e) => e.kind).sort();
    expect(kinds).toEqual(["ticket.created", "ticket.priority_changed"]);
    const audits = await database.db.select().from(auditLog).where(eq(auditLog.entityId, t.id));
    expect(audits.map((a) => a.action).sort()).toEqual(["ticket.create", "ticket.update"]);
    const update = audits.find((a) => a.action === "ticket.update")!;
    expect(update.before).toMatchObject({ priority: "normal", status: "in_progress", projectId: projectA.id, version: 1 });
    expect(update.after).toMatchObject({ priority: "high", status: "in_progress", projectId: projectA.id, version: 2 });
  });

  it("Server Action com projectId forjado no FormData é rejeitada e nada muda", async () => {
    const t = await linkedTicket();
    await maskedWriter();
    for (const forged of ["", projectB.id]) {
      const fd = editFormData(t.id, 1, { title: "Forjado" });
      fd.set("projectId", forged);
      const result = await updateTicketAction(undefined, fd);
      expect(result).toMatchObject({ code: "forbidden" });
    }
    expect(await ticketRow(t.id)).toMatchObject({ title: "Chamado", projectId: projectA.id, version: 1 });
  });

  it("ações de status e comentário continuam funcionando e preservam o vínculo", async () => {
    const t = await linkedTicket();
    await maskedWriter();
    await service.changeTicketStatus({ ticketId: t.id, version: 1, status: "in_progress" });
    await service.createTicketComment({ ticketId: t.id, content: "Atualização" });
    expect(await ticketRow(t.id)).toMatchObject({ status: "in_progress", projectId: projectA.id });
  });
});

describe("Hotfix — com project:read, o vínculo continua gerenciável", () => {
  it("H. busca e filtro por Projeto continuam funcionando", async () => {
    await linkedTicket({ title: "Chamado neutro" });
    await service.createTicket({ clientId: seed.clientA.id, ...base, title: "Sem projeto", projectId: null });
    expect((await service.listTickets({ q: "Secreto Alfa" })).total).toBe(1);
    const filtered = await service.getTicketsPageData({ projectId: projectA.id });
    expect(filtered.total).toBe(1);
    expect(filtered.filters.projectId).toBe(projectA.id);
    expect((await service.listTicketProjects({ clientId: seed.clientA.id })).rows.map((r) => r.name)).toEqual([PROJECT_A_NAME, PROJECT_B_NAME]);
  });

  it("M/N/O. vincular, trocar e remover (service), e ausência preserva", async () => {
    const t = await service.createTicket({ clientId: seed.clientA.id, ...base });
    await service.updateTicket(t.id, { ...base, projectId: projectA.id }, 1);
    expect((await ticketRow(t.id)).projectId).toBe(projectA.id);
    await service.updateTicket(t.id, { ...base, projectId: projectB.id }, 2);
    expect((await ticketRow(t.id)).projectId).toBe(projectB.id);
    await service.updateTicket(t.id, { ...base, title: "Sem campo de projeto" }, 3);
    expect((await ticketRow(t.id)).projectId).toBe(projectB.id);
    await service.updateTicket(t.id, { ...base, title: "Sem campo de projeto", projectId: null }, 4);
    expect((await ticketRow(t.id)).projectId).toBeNull();
    expect(await projectEvents(t.id)).toHaveLength(3);
  });

  it("Server Action: projectId presente e vazio remove; UUID vincula", async () => {
    const t = await linkedTicket();
    const link = editFormData(t.id, 1, {});
    link.set("projectId", projectB.id);
    await expectRedirect(updateTicketAction(undefined, link));
    expect((await ticketRow(t.id)).projectId).toBe(projectB.id);

    const unlink = editFormData(t.id, 2, {});
    unlink.set("projectId", "");
    await expectRedirect(updateTicketAction(undefined, unlink));
    expect((await ticketRow(t.id)).projectId).toBeNull();
  });

  it("P. projeto de outra org ou de outro cliente continua rejeitado", async () => {
    const [foreign] = await database.db.insert(projects).values({ orgId: ORG_B, clientId: seed.clientB.id, name: "Externo", createdBy: seed.ownerB.id }).returning();
    const t = await service.createTicket({ clientId: seed.clientA.id, ...base });
    await expect(service.updateTicket(t.id, { ...base, projectId: foreign!.id }, 1)).rejects.toMatchObject({ code: "invalid_project" });
    await expect(service.createTicket({ clientId: seed.clientA.id, ...base, projectId: foreign!.id })).rejects.toMatchObject({ code: "invalid_project" });
    await expect(service.listTicketProjects({ clientId: seed.clientB.id })).rejects.toMatchObject({ code: "invalid_client" });
    await expect(service.getTicketProject(seed.clientA.id, foreign!.id)).rejects.toMatchObject({ code: "invalid_project" });
    expect((await ticketRow(t.id)).projectId).toBeNull();
  });
});
