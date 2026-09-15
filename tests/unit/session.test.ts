// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "../helpers/database";
import { memberships, orgs, permissions, rolePermissions, roles, users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { can } from "@/config/permissions";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
import { getCurrentSession } from "@/lib/auth/session";
import { authorizeClientSession } from "@/lib/auth/client-access";

const orgId = "10000000-0000-4000-8000-000000000001";
const otherOrg = "10000000-0000-4000-8000-000000000002";
const userId = "20000000-0000-4000-8000-000000000001";
const authId = "30000000-0000-4000-8000-000000000001";
const roleId = "40000000-0000-4000-8000-000000000001";
const membershipId = "50000000-0000-4000-8000-000000000001";
let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => { database = await createTestDatabase(); }, 30000);
afterAll(async () => { await database?.pg.close(); });
beforeEach(async () => {
  await database.pg.exec("truncate public.orgs, public.users, public.permissions cascade");
  mocks.getDb.mockReturnValue(database.db);
  mocks.getUser.mockResolvedValue({ data: { user: { id: authId, email: "person@example.test" } } });
  await database.db.insert(orgs).values([{ id: orgId, slug: "a", name: "A" }, { id: otherOrg, slug: "b", name: "B" }]);
  await database.db.insert(users).values({ id: userId, authUserId: authId, email: "person@example.test", fullName: "Pessoa" });
  await database.db.insert(roles).values({ id: roleId, orgId, key: "dev", name: "Dev" });
  await database.db.insert(memberships).values({ id: membershipId, orgId, userId, roleId, createdAt: new Date("2026-01-01") });
  await database.db.insert(permissions).values([
    { key: "client:read", resource: "client", action: "read", description: "Ler" },
    { key: "client:write", resource: "client", action: "write", description: "Escrever" },
    { key: "audit:read", resource: "audit", action: "read", description: "Auditar" },
  ]);
});

describe("sessão e autorização de Clientes (queries reais)", () => {
  it("rejeita sessão Auth ausente", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await getCurrentSession()).toBeNull();
  });
  it("rejeita perfil inativo mesmo com Auth válido", async () => {
    await database.db.update(users).set({ isActive: false }).where(eq(users.id, userId));
    expect(await getCurrentSession()).toBeNull();
  });
  it("preserva o estado sem perfil sem conceder acesso", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: crypto.randomUUID(), email: "missing@example.test" } } });
    const session = await getCurrentSession();
    expect(session).toMatchObject({ userId: "", membership: null });
    expect(authorizeClientSession(session)).toEqual({ ok: false, reason: "membership" });
  });
  it("nega usuário sem membership", async () => {
    await database.db.delete(memberships);
    expect((await getCurrentSession())?.membership).toBeNull();
  });
  it("ignora membership inativa", async () => {
    await database.db.update(memberships).set({ isActive: false });
    expect((await getCurrentSession())?.membership).toBeNull();
  });
  it("rejeita papel de outra organização", async () => {
    await database.db.update(roles).set({ orgId: otherOrg }).where(eq(roles.id, roleId));
    expect((await getCurrentSession())?.membership).toBeNull();
  });
  it("escolhe a membership ativa mais antiga, desempata por ID", async () => {
    const secondRole = crypto.randomUUID();
    await database.db.insert(roles).values({ id: secondRole, orgId: otherOrg, key: "dev", name: "Dev" });
    await database.db.insert(memberships).values({ id: "50000000-0000-4000-8000-000000000000", orgId: otherOrg, userId, roleId: secondRole, createdAt: new Date("2026-01-01") });
    expect((await getCurrentSession())?.membership?.org.id).toBe(otherOrg);
    await database.db.update(memberships).set({ createdAt: new Date("2025-01-01") }).where(eq(memberships.id, membershipId));
    expect((await getCurrentSession())?.membership?.org.id).toBe(orgId);
    await database.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, membershipId));
    expect((await getCurrentSession())?.membership?.org.id).toBe(otherOrg);
  });
  it("super_admin recebe catálogo mesmo sem grants", async () => {
    await database.db.update(roles).set({ key: "super_admin" });
    const session = await getCurrentSession();
    expect(session?.membership?.permissions).toEqual(["audit:read", "client:read", "client:write"]);
    expect(authorizeClientSession(session, "write")).toMatchObject({ ok: true, context: { orgId, userId } });
  });
  it.each(["dev", "ceo", "custom"])("%s sem grants continua sem permissões", async (key) => {
    await database.db.update(roles).set({ key });
    const session = await getCurrentSession();
    expect(session?.membership?.permissions).toEqual([]);
    expect(authorizeClientSession(session)).toEqual({ ok: false, reason: "permission" });
  });
  it("usa apenas os grants do papel atual", async () => {
    await database.db.insert(rolePermissions).values({ roleId, permissionKey: "client:read" });
    const session = await getCurrentSession();
    expect(session?.membership?.scope).toBe("org");
    expect(can(session?.membership?.permissions, "client:read")).toBe(true);
    expect(authorizeClientSession(session).ok).toBe(true);
    expect(authorizeClientSession(session, "write")).toEqual({ ok: false, reason: "permission" });
  });
  it("write sozinho não concede leitura nem escrita", async () => {
    await database.db.insert(rolePermissions).values({ roleId, permissionKey: "client:write" });
    const session = await getCurrentSession();
    expect(authorizeClientSession(session).ok).toBe(false);
    expect(authorizeClientSession(session, "write").ok).toBe(false);
  });
  it("assigned é negado até para super_admin", async () => {
    await database.db.update(roles).set({ key: "super_admin" });
    await database.db.update(memberships).set({ scope: "assigned" });
    const session = await getCurrentSession();
    expect(session?.membership?.scope).toBe("assigned");
    expect(authorizeClientSession(session, "write")).toEqual({ ok: false, reason: "scope" });
  });
  it("metadata não pode promover super_admin", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: authId, email: "person@example.test", user_metadata: { role: "super_admin", orgId: otherOrg } } } });
    expect((await getCurrentSession())?.membership).toMatchObject({ role: { key: "dev" }, permissions: [], org: { id: orgId } });
  });
});
