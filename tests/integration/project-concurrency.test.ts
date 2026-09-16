// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
import { createProject, updateProject, getProjectDetail } from "@/server/services/project-service";

// Only the disposable launcher sets these. A normal npm test never connects remotely.
describe.skipIf(!process.env.PROJECT_TEST_DATABASE_URL)("Projects — PostgreSQL local, duas conexões", () => {
  let sql: ReturnType<typeof postgres>;
  let clientId: string;
  beforeAll(async () => {
    const url = new URL(process.env.PROJECT_TEST_DATABASE_URL!);
    const expectedDir = process.env.PROJECT_TEST_DATA_DIR;
    if (url.hostname !== "127.0.0.1" || !expectedDir || path.dirname(path.dirname(path.resolve(expectedDir))) !== path.resolve(tmpdir()) ||
      !path.basename(path.dirname(expectedDir)).startsWith("atlaz-projects-")) throw new Error("Disposable local database required");
    sql = postgres(url.toString(), { max: 4, prepare: false });
    const [directory] = await sql`select current_setting('data_directory') as directory`;
    if (path.resolve(directory!.directory) !== path.resolve(expectedDir)) throw new Error("Unexpected PostgreSQL cluster");
    await sql.unsafe(await readFile("tests/fixtures/foundation.sql", "utf8"));
    for (const file of ["0001_auth_sync_trigger.sql", "0002_clients.sql", "0003_client_event_security.sql", "0004_projects.sql"]) {
      await sql.begin(async tx => { await tx.unsafe(await readFile(`src/server/db/migrations/${file}`, "utf8")); });
    }
    const db = drizzle(sql, { schema }); mocks.getDb.mockReturnValue(db);
    const orgId = crypto.randomUUID(), userId = crypto.randomUUID(), authId = crypto.randomUUID(), roleId = crypto.randomUUID();
    await db.insert(schema.orgs).values({ id: orgId, slug: "isolated", name: "Teste" });
    await db.insert(schema.users).values({ id: userId, authUserId: authId, email: "test@example.test", fullName: "Teste" });
    await db.insert(schema.roles).values({ id: roleId, orgId, key: "dev", name: "Dev" });
    await db.insert(schema.memberships).values({ orgId, userId, roleId });
    for (const key of ["project:read", "project:write", "client:read"]) {
      await db.insert(schema.permissions).values({ key, resource: key.split(":")[0]!, action: key.split(":")[1]!, description: "Teste" });
      await db.insert(schema.rolePermissions).values({ roleId, permissionKey: key });
    }
    const [client] = await db.insert(schema.clients).values({ orgId, name: "Cliente", createdBy: userId }).returning();
    clientId = client!.id;
    mocks.getUser.mockResolvedValue({ data: { user: { id: authId, email: "test@example.test" } } });
  }, 60000);
  afterAll(async () => { await sql?.end(); });
  it("duas edições bloqueadas da mesma versão: uma vence, outra recebe conflict", async () => {
    const p = await createProject({ clientId, name: "Inicial" });
    const hold = await sql.reserve();
    await hold`begin`;
    await hold`select id from projects where id=${p.id} for update`;
    const edit = { name: "A", status: "planning", priority: "normal" };
    const outcomes = Promise.allSettled([updateProject(p.id, edit, 1), updateProject(p.id, { ...edit, name: "B" }, 1)]);
    try {
      // Prove two independent backends actually wait on locks, not merely Promise scheduling.
      let waiting = 0;
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline && waiting < 2) {
        const [row] = await hold`select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid()`;
        waiting = row!.count;
        if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(2);
    } finally { await hold`rollback`; hold.release(); }
    const results = await outcomes;
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "conflict" } });
    expect((await getProjectDetail(p.id)).version).toBe(2);
    const [counts] = await sql`select (select count(*)::int from activity_events) as events, (select count(*)::int from audit.log) as audits`;
    expect(counts).toEqual({ events: 2, audits: 2 });
  }, 30000);
});
