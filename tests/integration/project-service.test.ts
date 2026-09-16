// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, auditLog, clients, memberships, projects, roles, users } from "@/server/db/schema";
import { ORG_A, ORG_B, projectDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/projects";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
import * as service from "@/server/services/project-service";
import { authorizeProjectSession } from "@/lib/auth/project-access";
import { getCurrentSession } from "@/lib/auth/session";
let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;
function login(actor: { authId: string; email: string }) { mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } }); }
const edit = { name: "Projeto", description: null, status: "planning", priority: "normal", ownerUserId: null, startDate: null, dueDate: null, progress: null };
async function create(extra: Record<string, unknown> = {}) { return service.createProject({ clientId: seed.clientA.id, ...edit, ...extra }); }
async function counts() {
  return (await database.pg.query("select (select count(*)::int from projects) as projects, (select count(*)::int from activity_events) as events, (select count(*)::int from audit.log) as audits")).rows[0];
}
beforeAll(async () => { database = await projectDatabase(); mocks.getDb.mockReturnValue(database.db); }, 60000);
afterAll(async () => { await database?.pg.close(); });
beforeEach(async () => { seed = await seedProjects(database); login(seed.ownerA); });

describe("Projects autorização usando sessão e SQL reais", () => {
  it.each([
    { name: "sem grants", grants: [], read: false, write: false },
    { name: "write sem read", grants: ["project:write", "client:read"], read: false, write: false },
    { name: "sem client:read", grants: ["project:read", "project:write"], read: false, write: false },
    { name: "read only", grants: ["project:read", "client:read"], read: true, write: false },
    { name: "read write sem client:write", read: true, write: true },
    { name: "assigned", scope: "assigned", read: false, write: false },
    { name: "super admin", roleKey: "super_admin", grants: [], read: true, write: true },
    { name: "super admin assigned", roleKey: "super_admin", grants: [], scope: "assigned", read: false, write: false },
    { name: "user inativo", userActive: false, read: false, write: false },
    { name: "membership inativa", membershipActive: false, read: false, write: false },
  ])("$name", async options => {
    const actor = await projectMember(database, options); login(actor);
    const session = await getCurrentSession();
    expect(authorizeProjectSession(session).ok).toBe(options.read);
    expect(authorizeProjectSession(session, "write").ok).toBe(options.write);
    if (options.read) await expect(service.listProjects()).resolves.toMatchObject({ total: 0 });
    else await expect(service.listProjects()).rejects.toMatchObject({ code: "forbidden" });
    if (options.write) await expect(create()).resolves.toHaveProperty("id");
    else await expect(create()).rejects.toMatchObject({ code: "forbidden" });
  });
  it("sem sessão, sem membership e role cross-org", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(service.listProjects()).rejects.toMatchObject({ code: "forbidden" });
    const actor = await projectMember(database); login(actor);
    await database.db.update(roles).set({ orgId: ORG_B }).where(eq(roles.id, actor.roleId));
    await expect(create()).rejects.toMatchObject({ code: "forbidden" });
    await database.db.delete(memberships).where(eq(memberships.id, actor.membershipId));
    await expect(create()).rejects.toMatchObject({ code: "forbidden" });
  });
  it("toda leitura/mutação pública nega antes de procurar entidade", async () => {
    login(await projectMember(database, { grants: [] }));
    for (const call of [() => service.getProjectDetail("bad"), () => service.listProjectTimeline("bad"),
      () => service.listProjectClients(), () => service.getProjectClient("bad"), () => service.listAvailableProjectOwners(),
      () => service.getProjectCounts(), () => service.updateProject("bad", {}, 1),
      () => service.changeProjectStatus({}), () => service.reopenProject({})]) {
      await expect(call()).rejects.toMatchObject({ code: "forbidden" });
    }
  });
});
describe("Projects service — transações e regras", () => {
  it("cria para cliente encerrado; descarta autoridade forjada", async () => {
    const result = await create({ orgId: ORG_B, createdBy: seed.ownerB.id, actorId: seed.ownerB.id, permissions: ["injected"], completedAt: "2000-01-01", version: 8 });
    const row = await service.getProjectDetail(result.id);
    expect(row).toMatchObject({ orgId: ORG_A, clientId: seed.clientA.id, createdBy: seed.ownerA.id, version: 1, completedAt: null });
    expect(await counts()).toEqual({ projects: 1, events: 1, audits: 1 });
    const event = (await database.db.select().from(activityEvents))[0]!;
    expect(event).toMatchObject({ entityType: "project", entityId: result.id, orgId: ORG_A, actorUserId: seed.ownerA.id, payload: { clientId: seed.clientA.id } });
    expect(JSON.stringify((await database.db.select().from(auditLog))[0])).not.toContain("injected");
    expect((await database.db.select().from(clients).where(eq(clients.id, seed.clientA.id)))[0]?.version).toBe(1);
  });
  it("cliente inválido/inexistente/cross-org e owner inválido", async () => {
    await expect(create({ clientId: "bad" })).rejects.toMatchObject({ code: "validation" });
    for (const clientId of [crypto.randomUUID(), seed.clientB.id]) await expect(create({ clientId })).rejects.toMatchObject({ code: "invalid_client" });
    await expect(create({ ownerUserId: seed.ownerB.id })).rejects.toMatchObject({ code: "invalid_owner" });
    await expect(create({ ownerUserId: "bad" })).rejects.toMatchObject({ code: "validation" });
    expect(await counts()).toEqual({ projects: 0, events: 0, audits: 0 });
  });
  it("UUID de rota inválido vira not_found antes da query e não vaza cross-org", async () => {
    const p = await create(); login(seed.ownerB);
    for (const id of ["bad", crypto.randomUUID(), p.id]) {
      await expect(service.getProjectDetail(id)).rejects.toMatchObject({ code: "not_found" });
      await expect(service.updateProject(id, edit, 1)).rejects.toMatchObject({ code: "not_found" });
      await expect(service.listProjectTimeline(id)).rejects.toMatchObject({ code: "not_found" });
    }
  });
  it("diff por campo, uma auditoria e versão incrementada", async () => {
    const p = await create();
    await service.updateProject(p.id, { ...edit, name: " Novo ", status: "active", priority: "high", ownerUserId: seed.ownerA.id, progress: 0 }, 1);
    const events = await database.db.select().from(activityEvents);
    expect(events.map(e => e.kind).sort()).toEqual(["project.created", "project.status_changed", "project.priority_changed", "project.owner_changed", "project.progress_changed", "project.updated"].sort());
    expect(await counts()).toEqual({ projects: 1, events: 6, audits: 2 });
    const audit = (await database.db.select().from(auditLog)).find(a => a.action === "project.update")!;
    expect(audit.before).toMatchObject({ name: "Projeto", version: 1 });
    expect(audit.after).toMatchObject({ name: "Novo", progress: 0, version: 2 });
  });
  it("no-op normalizado não escreve; versão antiga nunca passa", async () => {
    const p = await create();
    await service.updateProject(p.id, { ...edit, name: " Projeto ", description: " " }, "1");
    expect(await counts()).toEqual({ projects: 1, events: 1, audits: 1 });
    await service.updateProject(p.id, { ...edit, name: "Novo" }, 1);
    await expect(service.updateProject(p.id, { ...edit, name: "Novo" }, 1)).rejects.toMatchObject({ code: "conflict" });
    await expect(service.updateProject(p.id, edit, 0)).rejects.toMatchObject({ code: "validation" });
    expect(await counts()).toEqual({ projects: 1, events: 2, audits: 2 });
  });
  it("owner histórico inativo não bloqueia edição", async () => {
    const owner = await projectMember(database);
    const p = await create({ ownerUserId: owner.id });
    await database.db.update(users).set({ isActive: false }).where(eq(users.id, owner.id));
    await database.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, owner.membershipId));
    await service.updateProject(p.id, { ...edit, name: "Histórico", ownerUserId: owner.id }, 1);
    expect((await service.getProjectDetail(p.id)).ownerUserId).toBe(owner.id);
    await expect(create({ ownerUserId: owner.id })).rejects.toMatchObject({ code: "invalid_owner" });
    await service.updateProject(p.id, { ...edit, name: "Histórico" }, 2);
    await expect(service.updateProject(p.id, { ...edit, ownerUserId: owner.id }, 3)).rejects.toMatchObject({ code: "invalid_owner" });
  });
  it("conclusão explícita, invariantes, reabertura e histórico", async () => {
    const p = await create({ progress: 40 });
    await expect(service.updateProject(p.id, { ...edit, status: "completed" }, 1)).rejects.toMatchObject({ code: "invalid_transition" });
    await service.changeProjectStatus({ projectId: p.id, version: 1, status: "completed", completedAt: "2000-01-01" });
    const completed = await service.getProjectDetail(p.id);
    expect(completed).toMatchObject({ status: "completed", progress: 100, version: 2 });
    expect(completed.completedAt).toBeInstanceOf(Date);
    await expect(service.changeProjectStatus({ projectId: p.id, version: 2, status: "active" })).rejects.toMatchObject({ code: "invalid_transition" });
    await expect(service.updateProject(p.id, { ...edit, status: "completed", progress: 5 }, 2)).rejects.toMatchObject({ code: "validation" });
    await service.reopenProject({ projectId: p.id, version: 2, progress: 100 });
    expect(await service.getProjectDetail(p.id)).toMatchObject({ status: "active", progress: null, completedAt: null, version: 3 });
    await expect(service.reopenProject({ projectId: p.id, version: 3 })).rejects.toMatchObject({ code: "invalid_transition" });
    const kinds = (await database.db.select().from(activityEvents)).map(e => e.kind);
    expect(kinds.filter(k => k === "project.status_changed")).toHaveLength(2);
    expect(kinds).not.toContain("project.completed");
  });
  it("cancelar preserva progresso e reabrir o limpa", async () => {
    const p = await create({ progress: 25 });
    await service.changeProjectStatus({ projectId: p.id, version: 1, status: "cancelled" });
    expect(await service.getProjectDetail(p.id)).toMatchObject({ status: "cancelled", completedAt: null, progress: 25 });
    await service.reopenProject({ projectId: p.id, version: 2 });
    expect(await service.getProjectDetail(p.id)).toMatchObject({ status: "active", progress: null });
  });
  it("cadastro concluído normaliza progresso e timestamp no servidor", async () => {
    const p = await create({ status: "completed", progress: 2 });
    expect(await service.getProjectDetail(p.id)).toMatchObject({ status: "completed", progress: 100 });
  });
  it("não muda cliente", async () => {
    const p = await create();
    await expect(service.updateProject(p.id, { ...edit, clientId: seed.clientB.id }, 1)).rejects.toMatchObject({ code: "validation" });
  });
  it.each(["activity_events", "audit.log"])("falha em %s reverte CREATE e UPDATE", async table => {
    const p = await create();
    await database.pg.exec(`create function public.fail_project_test() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$; create trigger fail_project_test before insert on ${table} for each row execute function public.fail_project_test()`);
    try {
      await expect(create()).rejects.toMatchObject({ code: "database_error" });
      await expect(service.updateProject(p.id, { ...edit, name: "Não persistir" }, 1)).rejects.toMatchObject({ code: "database_error" });
      expect(await counts()).toEqual({ projects: 1, events: 1, audits: 1 });
      expect(await service.getProjectDetail(p.id)).toMatchObject({ name: "Projeto", version: 1 });
    } finally { await database.pg.exec(`drop trigger fail_project_test on ${table}; drop function public.fail_project_test()`); }
  });
  it("duas submissões simultâneas da mesma versão: uma vence sem eventos órfãos", async () => {
    const p = await create();
    const results = await Promise.allSettled([
      service.updateProject(p.id, { ...edit, name: "Edição A" }, 1), service.updateProject(p.id, { ...edit, name: "Edição B" }, 1),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "conflict" } });
    expect(await counts()).toEqual({ projects: 1, events: 2, audits: 2 });
    expect((await service.getProjectDetail(p.id)).version).toBe(2);
  });
});

describe("Projects consultas e paginação", () => {
  it("filtros, busca literal, counts e isolamento", async () => {
    await create({ name: "Site 100%_", status: "active", priority: "urgent", dueDate: "2000-01-01", ownerUserId: seed.ownerA.id });
    await create({ name: "Outro", status: "review" });
    await database.db.insert(projects).values({ orgId: ORG_B, clientId: seed.clientB.id, createdBy: seed.ownerB.id, name: "Segredo" });
    expect((await service.listProjects({ q: "%_" })).total).toBe(1);
    expect((await service.listProjects({ q: "Cliente A" })).total).toBe(2);
    expect((await service.listProjects({ status: "active", priority: "urgent", overdue: "true", ownerUserId: seed.ownerA.id })).total).toBe(1);
    expect((await service.listProjects({ ownerUserId: "unassigned" })).total).toBe(1);
    expect(await service.getProjectCounts(seed.clientA.id)).toEqual({ total: 2, active: 1, review: 1, completed: 0, overdue: 1 });
    await expect(service.getProjectCounts(seed.clientB.id)).rejects.toMatchObject({ code: "invalid_client" });
    expect((await service.listAvailableProjectOwners()).map(o => o.userId)).not.toContain(seed.ownerB.id);
  });
  it("25 linhas por página, clamp e desempate estável", async () => {
    await database.db.insert(projects).values(Array.from({ length: 28 }, () => ({ orgId: ORG_A, clientId: seed.clientA.id, createdBy: seed.ownerA.id, name: "Igual" })));
    const first = await service.listProjects({ sort: "name" }), second = await service.listProjects({ sort: "name", page: 999 });
    expect(first.rows).toHaveLength(25); expect(second.rows).toHaveLength(3); expect(second.page).toBe(2);
    expect(new Set([...first.rows, ...second.rows].map(p => p.id)).size).toBe(28);
    expect((await service.listProjects({ sort: "due" })).rows).toHaveLength(25);
  });
  it("seletor paginado pesquisa nome/fantasia/razão/documento sem cross-org", async () => {
    await database.db.insert(clients).values(Array.from({ length: 26 }, (_, i) => ({ orgId: ORG_A, createdBy: seed.ownerA.id, name: `Empresa ${i}`, tradeName: `Fantasia ${i}`, legalName: `Legal ${i}` })));
    expect((await service.listProjectClients()).rows).toHaveLength(25);
    expect((await service.listProjectClients({ page: 2 })).rows).toHaveLength(2);
    expect((await service.listProjectClients({ q: "Fantasia 20" })).total).toBe(1);
    expect((await service.listProjectClients({ q: "Legal 20" })).total).toBe(1);
    await database.db.insert(clients).values({ orgId: ORG_A, createdBy: seed.ownerA.id, name: "Documento", personType: "company", document: "12345678000195" });
    expect((await service.listProjectClients({ q: "12345678000195" })).total).toBe(1);
    expect((await service.listProjectClients({ q: "Cliente B" })).total).toBe(0);
    await expect(service.getProjectClient(seed.clientB.id)).rejects.toMatchObject({ code: "invalid_client" });
  });
  it("timeline em janelas de 20, sem cumulatividade ou payload como autoridade", async () => {
    const p = await create();
    await database.db.insert(activityEvents).values(Array.from({ length: 24 }, () => ({ orgId: ORG_A, entityType: "project", entityId: p.id, kind: "project.updated", summary: "Teste" })));
    await database.db.insert(activityEvents).values({ orgId: ORG_B, entityType: "project", entityId: p.id, kind: "legacy", summary: "Outro", payload: { clientId: seed.clientA.id } });
    const a = await service.listProjectTimeline(p.id), b = await service.listProjectTimeline(p.id, 2);
    expect(a.rows).toHaveLength(20); expect(b.rows).toHaveLength(5); expect(a.total).toBe(25);
    expect(new Set([...a.rows, ...b.rows].map(e => e.id)).size).toBe(25);
  });
});

describe("Projects agregadores de UI (Checkpoint C2)", () => {
  it("getProjectsPageData combina listagem, KPIs e responsáveis numa só chamada", async () => {
    await create({ name: "Ativo", status: "active" });
    await create({ name: "Revisão", status: "review" });
    const data = await service.getProjectsPageData({ sort: "name" });
    expect(data.rows.map(r => r.name)).toEqual(["Ativo", "Revisão"]);
    expect(data.kpis).toEqual({ total: 2, active: 1, review: 1, completed: 0, overdue: 0 });
    expect(data.owners.map(o => o.userId)).toContain(seed.ownerA.id);
    expect(data.filters.sort).toBe("name");
    expect(data.page).toBe(1); expect(data.pageSize).toBe(25);
  });
  it("getProjectsPageData nega sem project:read+client:read", async () => {
    login(await projectMember(database, { grants: [] }));
    await expect(service.getProjectsPageData()).rejects.toMatchObject({ code: "forbidden" });
  });
  it("getProjectWorkspace combina projeto e timeline; 404 em cross-org e inexistente", async () => {
    const p = await create({ name: "Projeto X" });
    // `create()` já gera um evento `project.created`; este é um segundo evento real.
    await database.db.insert(activityEvents).values({ orgId: ORG_A, entityType: "project", entityId: p.id, kind: "project.updated", summary: "Editado" });
    const workspace = await service.getProjectWorkspace(p.id);
    expect(workspace.project.name).toBe("Projeto X");
    expect(workspace.timeline.rows).toHaveLength(2);
    await expect(service.getProjectWorkspace("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "not_found" });
    const [crossOrg] = await database.db.insert(projects).values({ orgId: ORG_B, clientId: seed.clientB.id, createdBy: seed.ownerB.id, name: "De outra org" }).returning();
    await expect(service.getProjectWorkspace(crossOrg!.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
