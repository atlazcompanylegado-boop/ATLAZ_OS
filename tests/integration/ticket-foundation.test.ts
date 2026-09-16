// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, clients, memberships, projects, roles, supportTickets, ticketComments, users } from "@/server/db/schema";
import { asProjectUser, ORG_A, ORG_B, ticketDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/tickets";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;
let projectId: string;
let ticketId: string;

beforeAll(async () => { database = await ticketDatabase(); }, 60000);
afterAll(async () => { await database?.pg.close(); });
beforeEach(async () => {
  seed = await seedProjects(database);
  const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "Projeto", createdBy: seed.ownerA.id }).returning();
  projectId = project!.id;
  const [ticket] = await database.db.insert(supportTickets).values({ orgId: ORG_A, clientId: seed.clientA.id, title: "Chamado", description: "Descrição", createdBy: seed.ownerA.id }).returning();
  ticketId = ticket!.id;
});
async function insert(extra: Record<string, unknown> = {}) {
  const values = { org_id: ORG_A, client_id: seed.clientA.id, title: "Outro", description: "Desc", created_by: seed.ownerA.id, ...extra };
  const keys = Object.keys(values);
  return database.pg.query<Record<string, unknown>>(`insert into support_tickets (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`, Object.values(values));
}

describe("Support tickets migration — constraints", () => {
  it("defaults, ticket_number sequencial e cliente", async () => {
    const row = (await database.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)))[0];
    expect(row).toMatchObject({ status: "open", priority: "normal", assignedUserId: null, resolvedAt: null, version: 1, clientId: seed.clientA.id, projectId: null });
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(typeof row?.ticketNumber).toBe("number");
    const { rows: [second] } = await insert();
    expect(second!.ticket_number).toBeGreaterThan(row!.ticketNumber);
  });
  it.each([
    { title: "" }, { title: " Nome " }, { title: "x".repeat(161) }, { description: "" }, { description: " " }, { description: "x".repeat(10001) },
    { status: "invalid" }, { priority: "urgent" }, { version: 0 }, { version: 2 },
    { status: "resolved" }, { resolved_at: "2026-09-15" },
    { status: "cancelled", resolved_at: "2026-09-15" },
  ])("rejeita invariantes %j", async invalid => { await expect(insert(invalid)).rejects.toMatchObject({ code: "23514" }); });
  it("aceita resolução íntegra e cancelamento sem resolved_at", async () => {
    await insert({ status: "resolved", resolved_at: "2026-09-15" });
    await insert({ status: "cancelled" });
  });
  it("cliente obrigatório e ticket_number gerado pelo banco (não aceita valor manual)", async () => {
    await expect(insert({ client_id: null })).rejects.toMatchObject({ code: "23502" });
    await expect(insert({ ticket_number: 999999 })).rejects.toMatchObject({ code: "428C9" });
  });
  it("nega cliente/criador cross-org", async () => {
    await expect(insert({ client_id: seed.clientB.id })).rejects.toMatchObject({ code: "23503" });
    await expect(insert({ created_by: seed.ownerB.id })).rejects.toMatchObject({ code: "23503" });
  });
  it("FK tripla: projeto precisa pertencer exatamente ao mesmo cliente do chamado", async () => {
    // Projeto de outro cliente da MESMA org.
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    const [projectOtherClient] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: clientA2!.id, name: "Projeto de A2", createdBy: seed.ownerA.id }).returning();
    await expect(insert({ project_id: projectOtherClient!.id })).rejects.toMatchObject({ code: "23503" });
    // Projeto de outra org inteira.
    const [projectOrgB] = await database.db.insert(projects).values({ orgId: ORG_B, clientId: seed.clientB.id, name: "Projeto B", createdBy: seed.ownerB.id }).returning();
    await expect(insert({ project_id: projectOrgB!.id })).rejects.toMatchObject({ code: "23503" });
    // Projeto do MESMO cliente é aceito.
    const { rows: [ok] } = await insert({ project_id: projectId });
    expect(ok!.project_id).toBe(projectId);
  });
  it("chamado sem projeto continua válido (project_id NULL não é avaliado pela FK tripla)", async () => {
    const { rows: [row] } = await insert({ project_id: null });
    expect(row!.project_id).toBeNull();
  });
  it.each(["id", "org_id", "client_id", "created_by", "created_at"])("identidade imutável %s", async field => {
    const value = field === "created_at" ? "2000-01-01" : crypto.randomUUID();
    await expect(database.pg.query(`update support_tickets set ${field}=$1, version=version+1 where id=$2`, [value, ticketId])).rejects.toMatchObject({ code: "23514" });
  });
  it("ticket_number é GENERATED ALWAYS — o próprio Postgres rejeita antes do trigger rodar", async () => {
    await expect(database.pg.query("update support_tickets set ticket_number=555, version=version+1 where id=$1", [ticketId])).rejects.toMatchObject({ code: "428C9" });
  });
  it("UPDATE exige avanço exato e atualiza timestamp", async () => {
    await expect(database.pg.query("update support_tickets set title='Mudou' where id=$1", [ticketId])).rejects.toMatchObject({ code: "23514" });
    await expect(database.pg.query("update support_tickets set version=version+2 where id=$1", [ticketId])).rejects.toMatchObject({ code: "23514" });
    await database.pg.query("update support_tickets set title='Mudou', version=version+1 where id=$1", [ticketId]);
    const [row] = await database.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(row?.version).toBe(2); expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(row!.createdAt.getTime());
  });
  it("project_id pode ser vinculado, trocado e removido livremente (não é imutável)", async () => {
    await database.pg.query("update support_tickets set project_id=$1, version=2 where id=$2", [projectId, ticketId]);
    await database.pg.query("update support_tickets set project_id=null, version=3 where id=$1", [ticketId]);
    const [row] = await database.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(row?.projectId).toBeNull();
  });
  it.each(["user", "membership"])("responsável inativo (%s) só é negado na atribuição", async mode => {
    await database.pg.query("update support_tickets set assigned_user_id=$1,version=2 where id=$2", [seed.ownerA.id, ticketId]);
    if (mode === "user") await database.db.update(users).set({ isActive: false }).where(eq(users.id, seed.ownerA.id));
    else await database.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, seed.ownerA.membershipId));
    await expect(insert({ assigned_user_id: seed.ownerA.id })).rejects.toMatchObject({ code: "23514" });
    await database.pg.query("update support_tickets set title='Histórico',version=3 where id=$1", [ticketId]);
    expect((await database.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)))[0]?.assignedUserId).toBe(seed.ownerA.id);
  });
});

describe("Ticket comments — imutabilidade", () => {
  it("aceita criação, nega update/delete até para service_role", async () => {
    const [comment] = await database.db.insert(ticketComments).values({ orgId: ORG_A, ticketId, authorUserId: seed.ownerA.id, content: "Olá" }).returning();
    await expect(asProjectUser(database, null, tx => tx.exec(`update ticket_comments set content='editado' where id='${comment!.id}'`), "service_role")).rejects.toMatchObject({ code: "42501" });
    await expect(asProjectUser(database, null, tx => tx.exec(`delete from ticket_comments where id='${comment!.id}'`), "service_role")).rejects.toMatchObject({ code: "42501" });
  });
  it.each([{ content: "" }, { content: " " }, { content: "x".repeat(10001) }])("rejeita conteúdo inválido %j", async invalid => {
    await expect(database.pg.query("insert into ticket_comments(org_id,ticket_id,author_user_id,content) values ($1,$2,$3,$4)",
      [ORG_A, ticketId, seed.ownerA.id, invalid.content])).rejects.toMatchObject({ code: "23514" });
  });
});

describe("Support tickets RLS e eventos", () => {
  beforeEach(async () => {
    await database.db.insert(activityEvents).values([
      { orgId: ORG_A, entityType: "ticket", entityId: ticketId, kind: "ticket.created", summary: "Chamado" },
      { orgId: ORG_A, entityType: "ticket", entityId: crypto.randomUUID(), kind: "legacy", summary: "Órfão" },
      { orgId: ORG_A, entityType: "client", entityId: seed.clientA.id, kind: "client.created", summary: "Cliente" },
      { orgId: ORG_A, entityType: "project", entityId: projectId, kind: "project.created", summary: "Projeto" },
      { orgId: ORG_A, entityType: "other", entityId: crypto.randomUUID(), kind: "legacy", summary: "Outro" },
      { orgId: ORG_B, entityType: "ticket", entityId: ticketId, kind: "legacy", summary: "Org forjada" },
    ]);
    await database.db.insert(ticketComments).values({ orgId: ORG_A, ticketId, authorUserId: seed.ownerA.id, content: "Comentário real" });
  });
  it.each([
    { name: "sem grants", grants: [], allowed: false },
    { name: "somente escrita", grants: ["ticket:write"], allowed: false },
    { name: "sem client:read", grants: ["ticket:read"], allowed: false },
    { name: "somente client:read", grants: ["client:read"], allowed: false },
    { name: "leitura", grants: ["client:read", "ticket:read"], allowed: true },
    { name: "escrita", grants: ["client:read", "ticket:read", "ticket:write"], allowed: true },
    // project:read NUNCA é exigido para o chamado em si (Checkpoint A §5/§9, Opção A).
    { name: "leitura sem project:read continua vendo o chamado", grants: ["client:read", "ticket:read"], allowed: true },
    { name: "assigned", scope: "assigned", allowed: false },
    { name: "super admin", roleKey: "super_admin", grants: [], allowed: true },
    { name: "super admin assigned", roleKey: "super_admin", scope: "assigned", grants: [], allowed: false },
    { name: "perfil inativo", userActive: false, allowed: false },
    { name: "membership inativa", membershipActive: false, allowed: false },
    { name: "cross-org", orgId: ORG_B, allowed: false },
  ])("$name", async options => {
    const member = await projectMember(database, options);
    const result = await asProjectUser(database, member.authId, async tx => ({
      rows: (await tx.query("select id from support_tickets")).rows,
      events: (await tx.query("select summary from activity_events where entity_type='ticket'")).rows,
      comments: (await tx.query("select content from ticket_comments")).rows,
    }));
    expect(result.rows).toHaveLength(options.allowed ? 1 : 0);
    expect(result.events).toEqual(options.allowed ? [{ summary: "Chamado" }] : []);
    expect(result.comments).toEqual(options.allowed ? [{ content: "Comentário real" }] : []);
  });
  it("papel de outra org e sem membership não leem chamados/comentários", async () => {
    await database.db.update(roles).set({ orgId: ORG_B }).where(eq(roles.id, seed.ownerA.roleId));
    expect((await asProjectUser(database, seed.ownerA.authId, tx => tx.query("select id from support_tickets"))).rows).toEqual([]);
    const stranger = await projectMember(database);
    await database.db.delete(memberships).where(eq(memberships.id, stranger.membershipId));
    expect((await asProjectUser(database, stranger.authId, tx => tx.query("select id from support_tickets"))).rows).toEqual([]);
    expect((await asProjectUser(database, stranger.authId, tx => tx.query("select id from ticket_comments"))).rows).toEqual([]);
  });
  it("preserva eventos de Clientes/Projetos, outros tipos e órfãos físicos", async () => {
    const member = await projectMember(database, { grants: ["client:read"] });
    const visible = await asProjectUser(database, member.authId, tx => tx.query<{ summary: string }>("select summary from activity_events order by summary"));
    expect(visible.rows.map(r => r.summary)).toEqual(["Cliente", "Outro"]);
    expect((await database.pg.query("select id from activity_events where summary='Órfão'")).rows).toHaveLength(1);
    expect((await database.pg.query("select id from activity_events where summary='Org forjada'")).rows).toHaveLength(1);
  });
  it.each(["authenticated", "anon"])("%s não escreve chamados/comentários/eventos/audit", async role => {
    for (const query of [
      "insert into support_tickets(title,description) values ('Ataque','Desc')", "update support_tickets set title='Ataque'", "delete from support_tickets",
      "insert into ticket_comments(content) values ('Ataque')",
      "insert into activity_events(summary) values ('Ataque')", "insert into audit.log(action) values ('Ataque')",
    ]) await expect(asProjectUser(database, seed.ownerA.authId, tx => tx.exec(query), role)).rejects.toMatchObject({ code: "42501" });
  });
  it("service_role sem DELETE em support_tickets, sem UPDATE/DELETE em ticket_comments, e uma única policy de eventos", async () => {
    await expect(asProjectUser(database, null, tx => tx.exec("delete from support_tickets"), "service_role")).rejects.toMatchObject({ code: "42501" });
    await expect(asProjectUser(database, null, tx => tx.exec("update ticket_comments set content='x'"), "service_role")).rejects.toMatchObject({ code: "42501" });
    await expect(asProjectUser(database, null, tx => tx.exec("delete from ticket_comments"), "service_role")).rejects.toMatchObject({ code: "42501" });
    const policies = await database.pg.query("select policyname from pg_policies where tablename='activity_events'");
    expect(policies.rows).toEqual([{ policyname: "activity_select" }]);
  });
});
