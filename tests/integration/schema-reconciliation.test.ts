// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { generateDrizzleJson } from "drizzle-kit/api";
import * as schema from "@/server/db/schema";
import { applyTestMigration, createTestDatabase } from "../helpers/database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  database = await createTestDatabase();
  // Dados sanitizados anteriores às migrations devem sobreviver à atualização.
  await database.pg.exec(`
    insert into orgs(id,slug,name) values ('10000000-0000-4000-8000-000000000001','legacy','Legado');
    insert into activity_events(org_id,entity_type,entity_id,kind,summary)
      values ('10000000-0000-4000-8000-000000000001','project','20000000-0000-4000-8000-000000000001','legacy','Preservar');
    insert into audit.log(org_id,actor_label,entity_type,action)
      values ('10000000-0000-4000-8000-000000000001','Servidor','project','legacy');
  `);
  await applyTestMigration(database.pg, "0001_auth_sync_trigger.sql");
  await applyTestMigration(database.pg, "0002_clients.sql");
  await applyTestMigration(database.pg, "0003_client_event_security.sql");
  await applyTestMigration(database.pg, "0004_projects.sql");
}, 30000);
afterAll(async () => { await database?.pg.close(); });

describe("reconciliação e migrations sem DDL incidental", () => {
  it("preserva organizações, eventos e auditorias herdadas", async () => {
    expect((await database.pg.query("select name from orgs")).rows).toEqual([{ name: "Legado" }]);
    expect((await database.pg.query("select summary from activity_events")).rows).toEqual([{ summary: "Preservar" }]);
    expect((await database.pg.query("select action from audit.log")).rows).toEqual([{ action: "legacy" }]);
  });
  it("schema Drizzle corresponde às colunas, FKs, checks, índices e RLS do banco migrado", async () => {
    for (const table of Object.values(schema).filter((value) => is(value, PgTable))) {
      const config = getTableConfig(table);
      const schemaName = config.schema ?? "public";
      const columns = await database.pg.query<{ name: string; not_null: boolean; type: string; has_default: boolean }>(
        `select a.attname as name, a.attnotnull as not_null, format_type(a.atttypid,a.atttypmod) as type,
          a.atthasdef as has_default from pg_attribute a
          where a.attrelid=($1 || '.' || $2)::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`,
        [schemaName, config.name],
      );
      expect(columns.rows, `${schemaName}.${config.name}`).toEqual(config.columns.map((column) => ({
        name: column.name, not_null: column.notNull, type: column.getSQLType(), has_default: column.hasDefault,
      })));
      const constraints = await database.pg.query<{ name: string; type: string; on_delete: string }>(
        "select conname as name, contype as type, confdeltype as on_delete from pg_constraint where conrelid=($1 || '.' || $2)::regclass",
        [schemaName, config.name],
      );
      const deleteCode = { cascade: "c", restrict: "r", "set null": "n", "no action": "a", "set default": "d" };
      expect(constraints.rows.filter((c) => c.type === "f").map((c) => ({ name: c.name, onDelete: c.on_delete })).sort((a,b) => a.name.localeCompare(b.name)))
        .toEqual(config.foreignKeys.map((fk) => ({ name: fk.getName(), onDelete: deleteCode[fk.onDelete ?? "no action"] })).sort((a,b) => a.name.localeCompare(b.name)));
      expect(constraints.rows.filter((c) => c.type === "c").map((c) => c.name).sort()).toEqual(config.checks.map((c) => c.name).sort());
      const indexes = await database.pg.query<{ indexname: string }>("select indexname from pg_indexes where schemaname=$1 and tablename=$2", [schemaName, config.name]);
      for (const index of config.indexes) expect(indexes.rows.map((i) => i.indexname)).toContain(index.config.name);
      const rls = await database.pg.query<{ enabled: boolean }>("select relrowsecurity as enabled from pg_class where oid=($1 || '.' || $2)::regclass", [schemaName, config.name]);
      expect(rls.rows[0]?.enabled).toBe(config.enableRLS);
    }
  });
  it("snapshot novo representa o schema final sem exportar auth", async () => {
    const snapshot = JSON.parse(await readFile(path.resolve("src/server/db/migrations/meta/0004_snapshot.json"), "utf8"));
    const generated = generateDrizzleJson(schema, snapshot.prevId, ["public", "audit"]);
    expect(snapshot.tables).toEqual(generated.tables);
    expect(snapshot.tables["auth.users"]).toBeUndefined();
    const previous = JSON.parse(await readFile(path.resolve("src/server/db/migrations/meta/0003_snapshot.json"), "utf8"));
    expect(snapshot.prevId).toBe(previous.id);
    for (const [key, table] of Object.entries(previous.tables)) expect(snapshot.tables[key]).toEqual(table);
  });
});
