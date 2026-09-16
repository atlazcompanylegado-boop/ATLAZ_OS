import { createTestDatabase, applyTestMigration } from "./database";
import { clients, memberships, orgs, permissions, rolePermissions, roles, users } from "@/server/db/schema";
import type { Transaction } from "@electric-sql/pglite";

export const ORG_A = "10000000-0000-4000-8000-000000000001";
export const ORG_B = "10000000-0000-4000-8000-000000000002";
export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
export async function projectDatabase() {
  const database = await createTestDatabase();
  for (const file of ["0001_auth_sync_trigger.sql", "0002_clients.sql", "0003_client_event_security.sql", "0004_projects.sql"]) {
    await applyTestMigration(database.pg, file);
  }
  return database;
}
export async function projectMember(database: TestDatabase, options: {
  orgId?: string; grants?: string[]; scope?: string; userActive?: boolean; membershipActive?: boolean; roleKey?: string;
} = {}) {
  const orgId = options.orgId ?? ORG_A;
  const id = crypto.randomUUID(), authId = crypto.randomUUID(), roleId = crypto.randomUUID(), membershipId = crypto.randomUUID();
  const email = `${id}@example.test`;
  await database.db.insert(users).values({ id, authUserId: authId, email, fullName: "Pessoa", isActive: options.userActive ?? true });
  await database.db.insert(roles).values({ id: roleId, orgId, key: options.roleKey ?? roleId, name: "Teste" });
  await database.db.insert(memberships).values({ id: membershipId, orgId, userId: id, roleId, scope: options.scope ?? "org", isActive: options.membershipActive ?? true });
  for (const permissionKey of options.grants ?? ["project:read", "project:write", "client:read"]) {
    await database.db.insert(rolePermissions).values({ roleId, permissionKey });
  }
  return { id, authId, roleId, membershipId, orgId, email };
}
export async function seedProjects(database: TestDatabase) {
  await database.pg.exec("truncate public.orgs, public.users, public.permissions, audit.log cascade");
  await database.db.insert(orgs).values([{ id: ORG_A, slug: "a", name: "A" }, { id: ORG_B, slug: "b", name: "B" }]);
  await database.db.insert(permissions).values(["client:read", "client:write", "project:read", "project:write", "project:delete", "project:deploy", "audit:read"].map(key => ({ key, resource: key.split(":")[0]!, action: key.split(":")[1]!, description: "Teste" })));
  const ownerA = await projectMember(database), ownerB = await projectMember(database, { orgId: ORG_B });
  const [clientA] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A", status: "closed", createdBy: ownerA.id }).returning();
  const [clientB] = await database.db.insert(clients).values({ orgId: ORG_B, name: "Cliente B", createdBy: ownerB.id }).returning();
  return { ownerA, ownerB, clientA: clientA!, clientB: clientB! };
}
export async function asProjectUser<T>(database: TestDatabase, authId: string | null, action: (tx: Transaction) => Promise<T>, role = "authenticated") {
  if (!["authenticated", "anon", "service_role"].includes(role)) throw new Error("Invalid test role");
  return database.pg.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: authId, role })]);
    return action(tx);
  });
}
