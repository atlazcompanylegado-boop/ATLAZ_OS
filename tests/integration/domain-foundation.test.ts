// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, clients, domains, memberships, projects, roles, users } from "@/server/db/schema";
import { asProjectUser, ORG_A, ORG_B, domainDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/domains";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;
let projectId: string;
let domainId: string;

beforeAll(async () => { database = await domainDatabase(); }, 60000);
afterAll(async () => { await database?.pg.close(); });
beforeEach(async () => {
  seed = await seedProjects(database);
  const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "Projeto", createdBy: seed.ownerA.id }).returning();
  projectId = project!.id;
  const [domain] = await database.db.insert(domains).values({ orgId: ORG_A, clientId: seed.clientA.id, domainName: "example.com", expirationDate: "2027-01-01", createdBy: seed.ownerA.id }).returning();
  domainId = domain!.id;
});
async function insert(extra: Record<string, unknown> = {}) {
  const values = { org_id: ORG_A, client_id: seed.clientA.id, domain_name: "outro.com", expiration_date: "2027-06-01", created_by: seed.ownerA.id, ...extra };
  const keys = Object.keys(values);
  return database.pg.query<Record<string, unknown>>(`insert into domains (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`, Object.values(values));
}

describe("Domains migration — constraints", () => {
  it("defaults e cliente", async () => {
    const row = (await database.db.select().from(domains).where(eq(domains.id, domainId)))[0];
    expect(row).toMatchObject({ status: "active", autoRenewStatus: "unknown", ownerUserId: null, version: 1, clientId: seed.clientA.id, projectId: null, registrar: null, registrationDate: null, notes: null });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });
  it.each([
    { domain_name: "EXAMPLE.COM" }, { domain_name: "example.com." }, { domain_name: "" }, { domain_name: "x".repeat(254) },
    { registrar: "" }, { registrar: " " }, { registrar: "x".repeat(161) },
    { notes: "" }, { notes: " " }, { notes: "x".repeat(2001) },
    { status: "expired" }, { auto_renew_status: "enabled" }, { version: 0 }, { version: 2 },
    { registration_date: "2027-12-01", expiration_date: "2027-06-01" },
  ])("rejeita invariantes %j", async invalid => { await expect(insert(invalid)).rejects.toMatchObject({ code: "23514" }); });
  it("aceita registration_date igual a expiration_date", async () => {
    const { rows: [row] } = await insert({ registration_date: "2027-06-01", expiration_date: "2027-06-01" });
    expect(new Date(row!.registration_date as string).toISOString().slice(0, 10)).toBe("2027-06-01");
  });
  it("cliente obrigatório", async () => {
    await expect(insert({ client_id: null })).rejects.toMatchObject({ code: "23502" });
  });
  it("nega cliente/criador cross-org", async () => {
    await expect(insert({ client_id: seed.clientB.id })).rejects.toMatchObject({ code: "23503" });
    await expect(insert({ created_by: seed.ownerB.id })).rejects.toMatchObject({ code: "23503" });
  });
  it("FK tripla: projeto precisa pertencer exatamente ao mesmo cliente do domínio", async () => {
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    const [projectOtherClient] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: clientA2!.id, name: "Projeto de A2", createdBy: seed.ownerA.id }).returning();
    await expect(insert({ project_id: projectOtherClient!.id })).rejects.toMatchObject({ code: "23503" });
    const [projectOrgB] = await database.db.insert(projects).values({ orgId: ORG_B, clientId: seed.clientB.id, name: "Projeto B", createdBy: seed.ownerB.id }).returning();
    await expect(insert({ project_id: projectOrgB!.id })).rejects.toMatchObject({ code: "23503" });
    const { rows: [ok] } = await insert({ project_id: projectId });
    expect(ok!.project_id).toBe(projectId);
  });
  it("domínio sem projeto continua válido (project_id NULL não é avaliado pela FK tripla)", async () => {
    const { rows: [row] } = await insert({ project_id: null });
    expect(row!.project_id).toBeNull();
  });
  it.each(["id", "org_id", "client_id", "domain_name", "created_by", "created_at"])("identidade imutável %s", async field => {
    const value = field === "created_at" ? "2000-01-01" : field === "domain_name" ? "outro-nome.com" : crypto.randomUUID();
    await expect(database.pg.query(`update domains set ${field}=$1, version=version+1 where id=$2`, [value, domainId])).rejects.toMatchObject({ code: "23514" });
  });
  it("UPDATE exige avanço exato e atualiza timestamp", async () => {
    await expect(database.pg.query("update domains set registrar='Registro.br' where id=$1", [domainId])).rejects.toMatchObject({ code: "23514" });
    await expect(database.pg.query("update domains set version=version+2 where id=$1", [domainId])).rejects.toMatchObject({ code: "23514" });
    await database.pg.query("update domains set registrar='Registro.br', version=version+1 where id=$1", [domainId]);
    const [row] = await database.db.select().from(domains).where(eq(domains.id, domainId));
    expect(row?.version).toBe(2); expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(row!.createdAt.getTime());
  });
  it("project_id pode ser vinculado, trocado e removido livremente (não é imutável)", async () => {
    await database.pg.query("update domains set project_id=$1, version=2 where id=$2", [projectId, domainId]);
    await database.pg.query("update domains set project_id=null, version=3 where id=$1", [domainId]);
    const [row] = await database.db.select().from(domains).where(eq(domains.id, domainId));
    expect(row?.projectId).toBeNull();
  });
  it.each(["user", "membership"])("responsável inativo (%s) só é negado na atribuição", async mode => {
    await database.pg.query("update domains set owner_user_id=$1,version=2 where id=$2", [seed.ownerA.id, domainId]);
    if (mode === "user") await database.db.update(users).set({ isActive: false }).where(eq(users.id, seed.ownerA.id));
    else await database.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, seed.ownerA.membershipId));
    await expect(insert({ owner_user_id: seed.ownerA.id })).rejects.toMatchObject({ code: "23514" });
    await database.pg.query("update domains set registrar='Histórico',version=3 where id=$1", [domainId]);
    expect((await database.db.select().from(domains).where(eq(domains.id, domainId)))[0]?.ownerUserId).toBe(seed.ownerA.id);
  });
});

describe("Domains — unicidade parcial (org_id, domain_name) WHERE status <> 'inactive'", () => {
  it("dois domínios ativos com o mesmo nome na mesma org: rejeita", async () => {
    await expect(insert({ domain_name: "example.com" })).rejects.toMatchObject({ code: "23505" });
  });
  it("um inativo + um novo ativo com o mesmo nome: permite (histórico preservado)", async () => {
    await database.pg.query("update domains set status='inactive', version=2 where id=$1", [domainId]);
    const { rows: [row] } = await insert({ domain_name: "example.com" });
    expect(row!.domain_name).toBe("example.com");
    expect(row!.status).toBe("active");
  });
  it("reativar o antigo enquanto o novo ativo existe: rejeita por unicidade (Checkpoint A §22)", async () => {
    await database.pg.query("update domains set status='inactive', version=2 where id=$1", [domainId]);
    await insert({ domain_name: "example.com" }); // novo ativo com o mesmo nome
    await expect(database.pg.query("update domains set status='active', version=3 where id=$1", [domainId])).rejects.toMatchObject({ code: "23505" });
  });
  it("outra org permite o mesmo domain_name livremente", async () => {
    const { rows: [row] } = await database.pg.query<Record<string, unknown>>(
      "insert into domains(org_id,client_id,domain_name,expiration_date,created_by) values ($1,$2,'example.com','2027-01-01',$3) returning *",
      [ORG_B, seed.clientB.id, seed.ownerB.id],
    );
    expect(row!.domain_name).toBe("example.com");
  });
});

describe("Domains RLS e eventos", () => {
  beforeEach(async () => {
    await database.db.insert(activityEvents).values([
      { orgId: ORG_A, entityType: "domain", entityId: domainId, kind: "domain.created", summary: "Domínio" },
      { orgId: ORG_A, entityType: "domain", entityId: crypto.randomUUID(), kind: "legacy", summary: "Órfão" },
      { orgId: ORG_A, entityType: "client", entityId: seed.clientA.id, kind: "client.created", summary: "Cliente" },
      { orgId: ORG_A, entityType: "project", entityId: projectId, kind: "project.created", summary: "Projeto" },
      { orgId: ORG_A, entityType: "other", entityId: crypto.randomUUID(), kind: "legacy", summary: "Outro" },
      { orgId: ORG_B, entityType: "domain", entityId: domainId, kind: "legacy", summary: "Org forjada" },
    ]);
  });
  it.each([
    { name: "sem grants", grants: [], allowed: false },
    { name: "somente escrita", grants: ["domain:write"], allowed: false },
    { name: "sem client:read", grants: ["domain:read"], allowed: false },
    { name: "somente client:read", grants: ["client:read"], allowed: false },
    { name: "leitura", grants: ["client:read", "domain:read"], allowed: true },
    { name: "escrita", grants: ["client:read", "domain:read", "domain:write"], allowed: true },
    // project:read NUNCA é exigido para o domínio em si (Checkpoint A §6).
    { name: "leitura sem project:read continua vendo o domínio", grants: ["client:read", "domain:read"], allowed: true },
    { name: "assigned", scope: "assigned", allowed: false },
    { name: "super admin", roleKey: "super_admin", grants: [], allowed: true },
    { name: "super admin assigned", roleKey: "super_admin", scope: "assigned", grants: [], allowed: false },
    { name: "perfil inativo", userActive: false, allowed: false },
    { name: "membership inativa", membershipActive: false, allowed: false },
    { name: "cross-org", orgId: ORG_B, allowed: false },
  ])("$name", async options => {
    const member = await projectMember(database, options);
    const result = await asProjectUser(database, member.authId, async tx => ({
      rows: (await tx.query("select id from domains")).rows,
      events: (await tx.query("select summary from activity_events where entity_type='domain'")).rows,
    }));
    expect(result.rows).toHaveLength(options.allowed ? 1 : 0);
    expect(result.events).toEqual(options.allowed ? [{ summary: "Domínio" }] : []);
  });
  it("papel de outra org e sem membership não leem domínios", async () => {
    await database.db.update(roles).set({ orgId: ORG_B }).where(eq(roles.id, seed.ownerA.roleId));
    expect((await asProjectUser(database, seed.ownerA.authId, tx => tx.query("select id from domains"))).rows).toEqual([]);
    const stranger = await projectMember(database);
    await database.db.delete(memberships).where(eq(memberships.id, stranger.membershipId));
    expect((await asProjectUser(database, stranger.authId, tx => tx.query("select id from domains"))).rows).toEqual([]);
  });
  it("preserva eventos de Clientes/Projetos, outros tipos e órfãos físicos", async () => {
    const member = await projectMember(database, { grants: ["client:read"] });
    const visible = await asProjectUser(database, member.authId, tx => tx.query<{ summary: string }>("select summary from activity_events order by summary"));
    expect(visible.rows.map(r => r.summary)).toEqual(["Cliente", "Outro"]);
    expect((await database.pg.query("select id from activity_events where summary='Órfão'")).rows).toHaveLength(1);
    expect((await database.pg.query("select id from activity_events where summary='Org forjada'")).rows).toHaveLength(1);
  });
  it.each(["authenticated", "anon"])("%s não escreve domínios/eventos/audit", async role => {
    for (const query of [
      "insert into domains(domain_name,expiration_date) values ('ataque.com','2027-01-01')", "update domains set domain_name='ataque.com'", "delete from domains",
      "insert into activity_events(summary) values ('Ataque')", "insert into audit.log(action) values ('Ataque')",
    ]) await expect(asProjectUser(database, seed.ownerA.authId, tx => tx.exec(query), role)).rejects.toMatchObject({ code: "42501" });
  });
  it("service_role sem DELETE em domains, e uma única policy de eventos", async () => {
    await expect(asProjectUser(database, null, tx => tx.exec("delete from domains"), "service_role")).rejects.toMatchObject({ code: "42501" });
    const policies = await database.pg.query("select policyname from pg_policies where tablename='activity_events'");
    expect(policies.rows).toEqual([{ policyname: "activity_select" }]);
  });
});
