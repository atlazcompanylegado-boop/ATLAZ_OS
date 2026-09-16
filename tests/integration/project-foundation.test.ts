// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, memberships, projects, roles, users } from "@/server/db/schema";
import { asProjectUser, ORG_A, ORG_B, projectDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/projects";
let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;
let projectId: string;
beforeAll(async () => { database = await projectDatabase(); }, 60000);
afterAll(async () => { await database?.pg.close(); });
beforeEach(async () => {
  seed = await seedProjects(database);
  const [row] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "Projeto", createdBy: seed.ownerA.id }).returning();
  projectId = row!.id;
});
async function insert(extra: Record<string, unknown> = {}) {
  const values = { org_id: ORG_A, client_id: seed.clientA.id, name: "Outro", created_by: seed.ownerA.id, ...extra };
  const keys = Object.keys(values);
  return database.pg.query(`insert into projects (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`, Object.values(values));
}
describe("Projects migration — constraints", () => {
  it("defaults e cliente encerrado", async () => {
    const row = (await database.db.select().from(projects))[0];
    expect(row).toMatchObject({ status: "planning", priority: "normal", progress: null, completedAt: null, version: 1, clientId: seed.clientA.id });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });
  it.each([
    { name: "" }, { name: " Nome " }, { name: "x".repeat(161) }, { description: " " }, { description: "x".repeat(10001) },
    { status: "invalid" }, { priority: "critical" }, { progress: -1 }, { progress: 101 }, { version: 0 }, { version: 2 },
    { start_date: "2026-09-15", due_date: "2026-09-14" },
    { status: "completed" }, { status: "completed", progress: 100 },
    { status: "completed", progress: null, completed_at: "2026-09-15" },
    { status: "completed", progress: 99, completed_at: "2026-09-15" }, { completed_at: "2026-09-15" },
  ])("rejeita invariantes %j", async invalid => { await expect(insert(invalid)).rejects.toMatchObject({ code: "23514" }); });
  it("aceita conclusão íntegra e 100% ainda em revisão", async () => {
    await insert({ status: "completed", progress: 100, completed_at: "2026-09-15" });
    await insert({ status: "review", progress: 100 });
  });
  it("cliente obrigatório, calendário e inteiro estrutural", async () => {
    await expect(insert({ client_id: null })).rejects.toMatchObject({ code: "23502" });
    await expect(insert({ start_date: "2026-02-30" })).rejects.toMatchObject({ code: "22008" });
    await expect(insert({ progress: "1.5" })).rejects.toMatchObject({ code: "22P02" });
  });
  it("nega cliente/owner/criador cross-org", async () => {
    await expect(insert({ client_id: seed.clientB.id })).rejects.toMatchObject({ code: "23503" });
    await expect(insert({ owner_user_id: seed.ownerB.id })).rejects.toMatchObject({ code: "23514" });
    await expect(insert({ created_by: seed.ownerB.id })).rejects.toMatchObject({ code: "23503" });
  });
  it.each(["id", "org_id", "client_id", "created_by", "created_at"])("identidade imutável %s", async field => {
    const value = field === "created_at" ? "2000-01-01" : crypto.randomUUID();
    await expect(database.pg.query(`update projects set ${field}=$1, version=version+1 where id=$2`, [value, projectId])).rejects.toMatchObject({ code: "23514" });
  });
  it("UPDATE exige avanço exato e atualiza timestamp", async () => {
    await expect(database.pg.query("update projects set name='Mudou' where id=$1", [projectId])).rejects.toMatchObject({ code: "23514" });
    await expect(database.pg.query("update projects set version=version+2 where id=$1", [projectId])).rejects.toMatchObject({ code: "23514" });
    await database.pg.query("update projects set name='Mudou', version=version+1 where id=$1", [projectId]);
    const [row] = await database.db.select().from(projects).where(eq(projects.id, projectId));
    expect(row?.version).toBe(2); expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(row!.createdAt.getTime());
  });
  it.each(["user", "membership"])("owner inativo (%s) só é negado na atribuição", async mode => {
    await database.pg.query("update projects set owner_user_id=$1,version=2 where id=$2", [seed.ownerA.id, projectId]);
    if (mode === "user") await database.db.update(users).set({ isActive: false }).where(eq(users.id, seed.ownerA.id));
    else await database.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, seed.ownerA.membershipId));
    await expect(insert({ owner_user_id: seed.ownerA.id })).rejects.toMatchObject({ code: "23514" });
    await database.pg.query("update projects set name='Histórico',version=3 where id=$1", [projectId]);
    expect((await database.db.select().from(projects))[0]?.ownerUserId).toBe(seed.ownerA.id);
  });
});

describe("Projects RLS e eventos", () => {
  beforeEach(async () => {
    await database.db.insert(activityEvents).values([
      { orgId: ORG_A, entityType: "project", entityId: projectId, kind: "project.created", summary: "Projeto" },
      { orgId: ORG_A, entityType: "project", entityId: crypto.randomUUID(), kind: "legacy", summary: "Órfão" },
      { orgId: ORG_A, entityType: "client", entityId: seed.clientA.id, kind: "client.created", summary: "Cliente" },
      { orgId: ORG_A, entityType: "other", entityId: crypto.randomUUID(), kind: "legacy", summary: "Outro" },
      { orgId: ORG_B, entityType: "project", entityId: projectId, kind: "legacy", summary: "Org forjada" },
    ]);
  });
  it.each([
    { name: "sem grants", grants: [], allowed: false },
    { name: "somente escrita", grants: ["project:write"], allowed: false },
    { name: "sem client:read", grants: ["project:read"], allowed: false },
    { name: "somente client:read", grants: ["client:read"], allowed: false },
    { name: "leitura", grants: ["client:read", "project:read"], allowed: true },
    { name: "escrita", grants: ["client:read", "project:read", "project:write"], allowed: true },
    { name: "assigned", scope: "assigned", allowed: false },
    { name: "super admin", roleKey: "super_admin", grants: [], allowed: true },
    { name: "super admin assigned", roleKey: "super_admin", scope: "assigned", grants: [], allowed: false },
    { name: "perfil inativo", userActive: false, allowed: false },
    { name: "membership inativa", membershipActive: false, allowed: false },
    { name: "cross-org", orgId: ORG_B, allowed: false },
  ])("$name", async options => {
    const member = await projectMember(database, options);
    const result = await asProjectUser(database, member.authId, async tx => ({
      rows: (await tx.query("select id from projects")).rows,
      events: (await tx.query("select summary from activity_events where entity_type='project'")).rows,
    }));
    expect(result.rows).toHaveLength(options.allowed ? 1 : 0);
    expect(result.events).toEqual(options.allowed ? [{ summary: "Projeto" }] : []);
  });
  it("papel de outra org e sem membership não leem projetos", async () => {
    await database.db.update(roles).set({ orgId: ORG_B }).where(eq(roles.id, seed.ownerA.roleId));
    expect((await asProjectUser(database, seed.ownerA.authId, tx => tx.query("select id from projects"))).rows).toEqual([]);
    const stranger = await projectMember(database);
    await database.db.delete(memberships).where(eq(memberships.id, stranger.membershipId));
    expect((await asProjectUser(database, stranger.authId, tx => tx.query("select id from projects"))).rows).toEqual([]);
  });
  it("preserva eventos de Clientes, outros tipos e órfãos físicos", async () => {
    const member = await projectMember(database, { grants: ["client:read"] });
    const visible = await asProjectUser(database, member.authId, tx => tx.query<{ summary: string }>("select summary from activity_events order by summary"));
    expect(visible.rows.map(r => r.summary)).toEqual(["Cliente", "Outro"]);
    const denied = await projectMember(database, { grants: [] });
    expect((await asProjectUser(database, denied.authId, tx => tx.query("select id from activity_events where entity_type='client'"))).rows).toEqual([]);
    expect((await database.pg.query("select id from activity_events where summary='Órfão'")).rows).toHaveLength(1);
  });
  it.each(["authenticated", "anon"])("%s não escreve projetos/eventos/audit", async role => {
    for (const query of [
      "insert into projects(name) values ('Ataque')", "update projects set name='Ataque'", "delete from projects",
      "insert into activity_events(summary) values ('Ataque')", "insert into audit.log(action) values ('Ataque')",
    ]) await expect(asProjectUser(database, seed.ownerA.authId, tx => tx.exec(query), role)).rejects.toMatchObject({ code: "42501" });
  });
  it("service_role sem DELETE e uma única policy de eventos", async () => {
    await expect(asProjectUser(database, null, tx => tx.exec("delete from projects"), "service_role")).rejects.toMatchObject({ code: "42501" });
    const policies = await database.pg.query("select policyname from pg_policies where tablename='activity_events'");
    expect(policies.rows).toEqual([{ policyname: "activity_select" }]);
  });
});
