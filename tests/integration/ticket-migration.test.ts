// @vitest-environment node
import { expect, it } from "vitest";
import { applyTestMigration, createTestDatabase } from "../helpers/database";
import { seedProjects } from "../helpers/projects";

it("0001 → 0004 preserva integralmente dados e policies de Clientes/Projetos ao aplicar 0005", async () => {
  const database = await createTestDatabase();
  try {
    for (const file of ["0001_auth_sync_trigger.sql", "0002_clients.sql", "0003_client_event_security.sql", "0004_projects.sql"]) await applyTestMigration(database.pg, file);
    const seed = await seedProjects(database);
    await database.pg.query("insert into projects(org_id,client_id,name,created_by) values ($1,$2,'Projeto Legado',$3)", [seed.clientA.orgId, seed.clientA.id, seed.ownerA.id]);
    await database.pg.query("insert into activity_events(org_id,entity_type,entity_id,kind,summary) values ($1,'project',$2,'legacy','Legado')", [seed.clientA.orgId, crypto.randomUUID()]);
    await database.pg.query("insert into audit.log(org_id,actor_label,entity_type,action) values ($1,'Teste','project','legacy')", [seed.clientA.orgId]);
    const tables = ["orgs", "users", "roles", "permissions", "role_permissions", "memberships", "clients", "client_contacts", "projects", "activity_events", "audit.log"];
    async function snapshot() {
      return Promise.all(tables.map(async table => (await database.pg.query(`select coalesce(jsonb_agg(t order by to_jsonb(t)::text), '[]') as rows from ${table} t`)).rows));
    }
    const before = await snapshot();
    const beforePolicies = await database.pg.query("select * from pg_policies where tablename in ('clients','client_contacts','projects','log') order by tablename,policyname");
    await applyTestMigration(database.pg, "0005_support.sql");
    expect(await snapshot()).toEqual(before);
    expect((await database.pg.query("select * from pg_policies where tablename in ('clients','client_contacts','projects','log') order by tablename,policyname")).rows).toEqual(beforePolicies.rows);
  } finally { await database.pg.close(); }
}, 60000);
