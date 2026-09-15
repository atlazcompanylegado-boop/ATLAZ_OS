// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { applyTestMigration, createTestDatabase } from "../helpers/database";
import { activityEvents, auditLog, clientContacts, clients, memberships, orgs, permissions, rolePermissions, roles, users } from "@/server/db/schema";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
let ownerA: Awaited<ReturnType<typeof member>>;
let ownerB: Awaited<ReturnType<typeof member>>;
let clientA: string;
let clientB: string;

async function member(options: {
  orgId?: string; grants?: string[]; scope?: string; userActive?: boolean;
  membershipActive?: boolean; roleKey?: string;
} = {}) {
  const orgId = options.orgId ?? orgA;
  const id = crypto.randomUUID();
  const authId = crypto.randomUUID();
  const roleId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  await database.db.insert(users).values({ id, authUserId: authId, email: `${id}@example.test`, fullName: "Pessoa de teste", isActive: options.userActive ?? true });
  await database.db.insert(roles).values({ id: roleId, orgId, key: options.roleKey ?? roleId, name: "Papel de teste" });
  await database.db.insert(memberships).values({ id: membershipId, orgId, userId: id, roleId, scope: options.scope ?? "org", isActive: options.membershipActive ?? true });
  for (const permissionKey of options.grants ?? ["client:read", "client:write"]) {
    await database.db.insert(rolePermissions).values({ roleId, permissionKey });
  }
  return { id, authId, roleId, membershipId, orgId };
}

async function asUser<T>(authId: string | null, action: (tx: Transaction) => Promise<T>) {
  return database.pg.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: authId, role: "authenticated" })]);
    return action(tx);
  });
}
async function visibleClientIds(authId: string) {
  const result = await asUser(authId, (tx) => tx.query<{ id: string }>("select id from public.clients order by id"));
  return result.rows.map((row) => row.id);
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
}, 30000);
afterAll(async () => { await database?.pg.close(); });
beforeEach(async () => {
  await database.pg.exec("truncate public.orgs, public.users, public.permissions, audit.log cascade");
  await database.db.insert(orgs).values([{ id: orgA, slug: "a", name: "A" }, { id: orgB, slug: "b", name: "B" }]);
  await database.db.insert(permissions).values(["client:read", "client:write", "audit:read"].map((key) => ({ key, resource: key.split(":")[0]!, action: key.split(":")[1]!, description: "Teste" })));
  ownerA = await member();
  ownerB = await member({ orgId: orgB });
  clientA = crypto.randomUUID();
  clientB = crypto.randomUUID();
  await database.db.insert(clients).values([
    { id: clientA, orgId: orgA, name: "Cliente A", createdBy: ownerA.id, ownerUserId: ownerA.id },
    { id: clientB, orgId: orgB, name: "Cliente B", createdBy: ownerB.id, ownerUserId: ownerB.id },
  ]);
});

describe("migrations Clientes — integridade real no PostgreSQL", () => {
  it("define defaults e permite dados opcionais ausentes", async () => {
    const [row] = await database.db.insert(clients).values({ orgId: orgA, name: "Lead", createdBy: ownerA.id }).returning();
    expect(row).toMatchObject({ status: "lead", version: 1, document: null, ownerUserId: null });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });
  it.each([
    { name: "   " }, { status: "invalid" }, { person_type: "invalid" },
    { version: 0 }, { version: 2 }, { website: "javascript:alert(1)" },
  ])("rejeita cadastro inválido %j", async (invalid) => {
    const [field, value] = Object.entries(invalid)[0]!;
    await expect(database.pg.query(`insert into clients (org_id, name, created_by, ${field === "name" ? "notes" : field}) values ($1, $2, $3, $4)`,
      [orgA, field === "name" ? value : "Inválido", ownerA.id, field === "name" ? null : value])).rejects.toMatchObject({ code: "23514" });
  });
  it("documento opcional é único por organização", async () => {
    const data = { orgId: orgA, name: "Empresa", createdBy: ownerA.id, personType: "company" as const, document: "12345678000195" };
    await database.db.insert(clients).values(data);
    await expect(database.db.insert(clients).values(data)).rejects.toBeDefined();
    await expect(database.db.insert(clients).values({ ...data, orgId: orgB, createdBy: ownerB.id })).resolves.toBeDefined();
  });
  it("aceita CNPJ alfanumérico normalizado, mantendo CPF numérico", async () => {
    await database.db.insert(clients).values({ orgId: orgA, name: "Empresa", createdBy: ownerA.id, personType: "company", document: "12ABC34501DE35" });
    await database.db.insert(clients).values({ orgId: orgA, name: "Pessoa", createdBy: ownerA.id, personType: "individual", document: "12345678909" });
    await expect(database.pg.query("insert into clients(org_id,name,created_by,person_type,document) values ($1,'Inválido',$2,'individual','12ABC34501DE35')", [orgA, ownerA.id])).rejects.toMatchObject({ code: "23514" });
  });
  it.each(["12.345.678/0001-95", "12abc34501de35", "", "123", "123456780001AB"])("rejeita documento não normalizado/formato inválido: %s", async (document) => {
    await expect(database.pg.query("insert into clients(org_id,name,created_by,person_type,document) values ($1,'Inválido',$2,'company',$3)", [orgA, ownerA.id, document])).rejects.toMatchObject({ code: "23514" });
  });
  it("documento exige tipo de pessoa explícito", async () => {
    await expect(database.pg.query("insert into clients(org_id,name,created_by,document) values ($1,'Inválido',$2,'12345678909')", [orgA, ownerA.id])).rejects.toMatchObject({ code: "23514" });
  });
  it("responsável deve pertencer à organização", async () => {
    await expect(database.pg.query("insert into clients(org_id,name,created_by,owner_user_id) values ($1,'Inválido',$2,$3)", [orgA, ownerA.id, ownerB.id])).rejects.toMatchObject({ code: "23514" });
  });
  it.each([{ userActive: false }, { membershipActive: false }])("responsável inativo não pode ser selecionado: %j", async (options) => {
    const inactive = await member(options);
    await expect(database.pg.query("update clients set owner_user_id=$1, version=version+1 where org_id=$2 and id=$3", [inactive.id, orgA, clientA])).rejects.toMatchObject({ code: "23514" });
  });
  it("preserva responsável histórico inativado em edição de outro campo", async () => {
    await database.db.update(users).set({ isActive: false }).where(eq(users.id, ownerA.id));
    await database.db.update(clients).set({ name: "Novo nome", version: 2 }).where(and(eq(clients.orgId, orgA), eq(clients.id, clientA), eq(clients.version, 1)));
    const [row] = await database.db.select().from(clients).where(eq(clients.id, clientA));
    expect(row).toMatchObject({ ownerUserId: ownerA.id, version: 2 });
  });
  it("criador não pode pertencer a outra organização", async () => {
    await expect(database.pg.query("insert into clients(org_id,name,created_by) values ($1,'Inválido',$2)", [orgA, ownerB.id])).rejects.toMatchObject({ code: "23503" });
  });
  it("contato de outra org e criador de outra org são rejeitados", async () => {
    await expect(database.pg.query("insert into client_contacts(org_id,client_id,name,created_by) values ($1,$2,'Contato',$3)", [orgA, clientB, ownerA.id])).rejects.toMatchObject({ code: "23503" });
    await expect(database.pg.query("insert into client_contacts(org_id,client_id,name,created_by) values ($1,$2,'Contato',$3)", [orgA, clientA, ownerB.id])).rejects.toMatchObject({ code: "23503" });
  });
  it("permite múltiplos contatos, um principal e troca atômica", async () => {
    const [first] = await database.db.insert(clientContacts).values({ orgId: orgA, clientId: clientA, name: "Um", createdBy: ownerA.id, isPrimary: true }).returning();
    const [second] = await database.db.insert(clientContacts).values({ orgId: orgA, clientId: clientA, name: "Dois", createdBy: ownerA.id }).returning();
    await expect(database.pg.query("update client_contacts set is_primary=true where id=$1", [second!.id])).rejects.toMatchObject({ code: "23505" });
    await database.db.transaction(async (tx) => {
      await tx.update(clientContacts).set({ isPrimary: false }).where(and(eq(clientContacts.orgId, orgA), eq(clientContacts.id, first!.id)));
      await tx.update(clientContacts).set({ isPrimary: true }).where(and(eq(clientContacts.orgId, orgA), eq(clientContacts.id, second!.id)));
    });
    const primary = await database.db.select().from(clientContacts).where(eq(clientContacts.isPrimary, true));
    expect(primary.map((row) => row.id)).toEqual([second!.id]);
    await database.db.delete(clientContacts).where(and(eq(clientContacts.orgId, orgA), eq(clientContacts.id, second!.id)));
    expect(await database.db.select().from(clientContacts).where(eq(clientContacts.isPrimary, true))).toEqual([]);
  });
  it.each([{ email: "inválido" }, { phone: "+55 (85) 9999-9999" }, { whatsapp: "abc" }])("protege formato de contato: %j", async (invalid) => {
    const [field, value] = Object.entries(invalid)[0]!;
    await expect(database.pg.query(`insert into client_contacts(org_id,client_id,name,created_by,${field}) values ($1,$2,'Inválido',$3,$4)`, [orgA, clientA, ownerA.id, value])).rejects.toMatchObject({ code: "23514" });
  });
  it("edição precisa avançar versão; uma versão antiga não sobrescreve", async () => {
    await expect(database.pg.query("update clients set name='Sem versão' where id=$1", [clientA])).rejects.toMatchObject({ code: "23514" });
    const changed = await database.db.update(clients).set({ name: "Atualizado", version: sql`${clients.version} + 1` }).where(and(eq(clients.orgId, orgA), eq(clients.id, clientA), eq(clients.version, 1))).returning();
    const stale = await database.db.update(clients).set({ name: "Sobrescrito", version: sql`${clients.version} + 1` }).where(and(eq(clients.orgId, orgA), eq(clients.id, clientA), eq(clients.version, 1))).returning();
    expect(changed[0]).toMatchObject({ version: 2, name: "Atualizado" });
    expect(stale).toEqual([]);
  });
  it("não permite transferir cliente de organização nem trocar criador", async () => {
    await expect(database.pg.query("update clients set org_id=$1, version=version+1 where id=$2", [orgB, clientA])).rejects.toMatchObject({ code: "23514" });
    await expect(database.pg.query("update clients set created_by=$1, version=version+1 where id=$2", [ownerB.id, clientA])).rejects.toMatchObject({ code: "23514" });
  });
  it("contato não pode ser transferido para outro cliente", async () => {
    const [contact] = await database.db.insert(clientContacts).values({ orgId: orgA, clientId: clientA, name: "Contato", createdBy: ownerA.id }).returning();
    await expect(database.pg.query("update client_contacts set client_id=$1 where id=$2", [clientB, contact!.id])).rejects.toMatchObject({ code: "23514" });
  });
  it("FKs preservam cliente e autoria ao tentar apagar dependências", async () => {
    await expect(database.pg.query("delete from memberships where id=$1", [ownerA.membershipId])).rejects.toMatchObject({ code: "23001" });
    await database.db.insert(clientContacts).values({ orgId: orgA, clientId: clientA, name: "Contato", createdBy: ownerA.id });
    await expect(database.pg.query("delete from clients where id=$1", [clientA])).rejects.toMatchObject({ code: "23001" });
  });
});

describe("RLS e grants — papéis autenticados simulados, sem Auth remoto", () => {
  it("usuário inativo não pode reativar o próprio perfil", async () => {
    const inactive = await member({ userActive: false });
    await expect(asUser(inactive.authId, (tx) => tx.query("update public.users set is_active=true where id=$1", [inactive.id]))).rejects.toMatchObject({ code: "42501" });
    expect(await visibleClientIds(inactive.authId)).toEqual([]);
  });
  it("edição direta do perfil preserva nome/avatar, bloqueia identidade", async () => {
    await asUser(ownerA.authId, (tx) => tx.query("update public.users set full_name='Nome novo' where id=$1", [ownerA.id]));
    const [updated] = await database.db.select().from(users).where(eq(users.id, ownerA.id));
    expect(updated?.fullName).toBe("Nome novo");
    await expect(asUser(ownerA.authId, (tx) => tx.query("update public.users set auth_user_id=$1 where id=$2", [crypto.randomUUID(), ownerA.id]))).rejects.toMatchObject({ code: "42501" });
    const result = await asUser(ownerA.authId, (tx) => tx.query("update public.users set full_name='Outro' where id=$1 returning id", [ownerB.id]));
    expect(result.rows).toEqual([]);
  });
  it("organização A não lê cliente B, nem por ID", async () => {
    expect(await visibleClientIds(ownerA.authId)).toEqual([clientA]);
    const result = await asUser(ownerA.authId, (tx) => tx.query("select id from clients where id=$1", [clientB]));
    expect(result.rows).toEqual([]);
  });
  it.each([
    { grants: [] }, { grants: ["client:write"] }, { scope: "assigned" },
    { userActive: false }, { membershipActive: false }, { roleKey: "ceo", grants: [] },
    { roleKey: "super_admin", grants: [], scope: "assigned" },
  ])("nega leitura com contexto insuficiente: %j", async (options) => {
    const user = await member(options);
    expect(await visibleClientIds(user.authId)).toEqual([]);
  });
  it("super_admin sem grants lê somente a própria org", async () => {
    const user = await member({ roleKey: "super_admin", grants: [] });
    expect(await visibleClientIds(user.authId)).toEqual([clientA]);
  });
  it("papel de outra organização não autoriza Clientes", async () => {
    await database.db.update(memberships).set({ roleId: ownerB.roleId }).where(eq(memberships.id, ownerA.membershipId));
    expect(await visibleClientIds(ownerA.authId)).toEqual([]);
  });
  it("usuário sem membership só vê o próprio perfil", async () => {
    const user = await member();
    await database.db.delete(memberships).where(eq(memberships.id, user.membershipId));
    const result = await asUser(user.authId, (tx) => tx.query<{ profiles: number; orgs: number; memberships: number; clients: number; events: number; audits: number }>(
      "select (select count(*)::int from public.users) as profiles, (select count(*)::int from orgs) as orgs, (select count(*)::int from memberships) as memberships, (select count(*)::int from clients) as clients, (select count(*)::int from activity_events) as events, (select count(*)::int from audit.log) as audits",
    ));
    expect(result.rows[0]).toEqual({ profiles: 1, orgs: 0, memberships: 0, clients: 0, events: 0, audits: 0 });
  });
  it("identidade inexistente e ausência de claims não expõem clientes", async () => {
    expect(await visibleClientIds(crypto.randomUUID())).toEqual([]);
    expect((await asUser(null, (tx) => tx.query("select id from clients"))).rows).toEqual([]);
  });
  it("override de organização sem membership não concede acesso", async () => {
    const result = await asUser(ownerA.authId, async (tx) => {
      await tx.query("select set_config('atlaz.org_id', $1, true)", [orgB]);
      return tx.query("select id from clients");
    });
    expect(result.rows).toEqual([]);
  });
  it("desempate da org no SQL coincide com a sessão", async () => {
    const reader = await member();
    await database.db.update(memberships).set({ id: "50000000-0000-4000-8000-000000000002", createdAt: new Date("2026-01-01") }).where(eq(memberships.id, reader.membershipId));
    await database.db.insert(memberships).values({ id: "50000000-0000-4000-8000-000000000001", orgId: orgB, userId: reader.id, roleId: ownerB.roleId, createdAt: new Date("2026-01-01") });
    expect(await visibleClientIds(reader.authId)).toEqual([clientB]);
  });
  it("contatos seguem a RLS do cliente pai", async () => {
    await database.db.insert(clientContacts).values([
      { orgId: orgA, clientId: clientA, name: "A", createdBy: ownerA.id },
      { orgId: orgB, clientId: clientB, name: "B", createdBy: ownerB.id },
    ]);
    const result = await asUser(ownerA.authId, (tx) => tx.query<{ name: string }>("select name from client_contacts"));
    expect(result.rows).toEqual([{ name: "A" }]);
  });
  it.each(["audit.log", "public.activity_events"])("authenticated não pode fabricar evento em %s", async (table) => {
    const stmt = table === "audit.log"
      ? "insert into audit.log(org_id,actor_label,action,entity_type) values ($1,'Ator falso','fake','client')"
      : "insert into activity_events(org_id,entity_id,entity_type,kind,summary) values ($1,$2,'client','fake','Falso')";
    await expect(asUser(ownerA.authId, (tx) => tx.query(stmt, table === "audit.log" ? [orgA] : [orgA, clientA]))).rejects.toMatchObject({ code: "42501" });
  });
  it("grants negam todos os DML de eventos até para super_admin autenticado", async () => {
    const admin = await member({ roleKey: "super_admin", grants: [] });
    const result = await asUser(admin.authId, (tx) => tx.query<{ audit_insert: boolean; event_insert: boolean; audit_update: boolean; event_delete: boolean; event_truncate: boolean }>(
      "select has_table_privilege(current_user,'audit.log','INSERT') as audit_insert, has_table_privilege(current_user,'activity_events','INSERT') as event_insert, has_table_privilege(current_user,'audit.log','UPDATE') as audit_update, has_table_privilege(current_user,'activity_events','DELETE') as event_delete, has_table_privilege(current_user,'activity_events','TRUNCATE') as event_truncate",
    ));
    expect(Object.values(result.rows[0]!)).toEqual([false, false, false, false, false]);
  });
  it("anon não recebe grants de Clientes, Contatos ou escrita de eventos", async () => {
    const result = await database.pg.query<{ allowed: boolean }>("select has_table_privilege('anon', target, operation) as allowed from (values ('public.clients','SELECT'), ('public.client_contacts','SELECT'), ('audit.log','INSERT'), ('public.activity_events','INSERT')) v(target,operation)");
    expect(result.rows.every((row) => !row.allowed)).toBe(true);
  });
  it("nem client:write permite DML direto que contorne auditoria", async () => {
    await expect(asUser(ownerA.authId, (tx) => tx.query("update clients set name='Bypass',version=version+1 where id=$1", [clientA]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(ownerA.authId, (tx) => tx.query("delete from client_contacts where client_id=$1", [clientA]))).rejects.toMatchObject({ code: "42501" });
  });
  it("timeline de Clientes exige leitura do cliente e não revela eventos órfãos", async () => {
    await database.db.insert(activityEvents).values([
      { orgId: orgA, entityType: "client", entityId: clientA, kind: "created", summary: "A" },
      { orgId: orgB, entityType: "client", entityId: clientB, kind: "created", summary: "B" },
      { orgId: orgA, entityType: "client", entityId: crypto.randomUUID(), kind: "created", summary: "Órfão" },
      { orgId: orgA, entityType: "project", entityId: crypto.randomUUID(), kind: "created", summary: "Legado" },
    ]);
    const denied = await member({ grants: [] });
    const assigned = await member({ scope: "assigned" });
    const read = (id: string) => asUser(id, (tx) => tx.query<{ summary: string }>("select summary from activity_events order by summary"));
    expect((await read(ownerA.authId)).rows.map((r) => r.summary)).toEqual(["A", "Legado"]);
    expect((await read(denied.authId)).rows.map((r) => r.summary)).toEqual(["Legado"]);
    expect((await read(assigned.authId)).rows.map((r) => r.summary)).toEqual(["Legado"]);
  });
  it("audit:read continua separado de client:read", async () => {
    await database.db.insert(auditLog).values([
      { orgId: orgA, actorLabel: "Servidor", entityType: "client", entityId: clientA, action: "create" },
      { orgId: orgB, actorLabel: "Servidor", entityType: "client", entityId: clientB, action: "create" },
    ]);
    expect((await asUser(ownerA.authId, (tx) => tx.query("select id from audit.log"))).rows).toEqual([]);
    const auditor = await member({ grants: ["audit:read"] });
    expect((await asUser(auditor.authId, (tx) => tx.query("select id from audit.log"))).rows).toHaveLength(1);
    expect(await visibleClientIds(auditor.authId)).toEqual([]);
  });
});

describe("transações de fundação (service será implementado no Checkpoint 2)", () => {
  it.each(["event", "audit"])("falha de %s reverte cadastro e contatos", async (failure) => {
    const before = await counts();
    await expect(database.db.transaction(async (tx) => {
      const [client] = await tx.insert(clients).values({ orgId: orgA, name: "Transação", createdBy: ownerA.id }).returning();
      await tx.insert(clientContacts).values({ orgId: orgA, clientId: client!.id, name: "Contato", createdBy: ownerA.id });
      if (failure === "event") {
        await tx.execute(sql`insert into activity_events(org_id,entity_type,entity_id,kind) values (${orgA},'client',${client!.id},'created')`);
      } else {
        await tx.insert(activityEvents).values({ orgId: orgA, entityType: "client", entityId: client!.id, kind: "created", summary: "Criado" });
        await tx.execute(sql`insert into audit.log(org_id,action,entity_type) values (${orgA},'create','client')`);
      }
    })).rejects.toBeDefined();
    expect(await counts()).toEqual(before);
  });
  it("falha na auditoria reverte edição e avanço de versão", async () => {
    await expect(database.db.transaction(async (tx) => {
      await tx.update(clients).set({ name: "Não persistir", version: 2 }).where(and(eq(clients.orgId, orgA), eq(clients.id, clientA), eq(clients.version, 1)));
      await tx.insert(activityEvents).values({ orgId: orgA, entityType: "client", entityId: clientA, kind: "updated", summary: "Não persistir" });
      await tx.execute(sql`insert into audit.log(org_id,action,entity_type) values (${orgA},'update','client')`);
    })).rejects.toBeDefined();
    const [client] = await database.db.select().from(clients).where(eq(clients.id, clientA));
    expect(client).toMatchObject({ name: "Cliente A", version: 1 });
    expect(await counts()).toMatchObject({ events: 0, audits: 0 });
  });
});
