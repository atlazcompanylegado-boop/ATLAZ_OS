// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, auditLog, clients, domains, memberships, projects, rolePermissions, users } from "@/server/db/schema";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
import * as service from "@/server/services/domain-service";
import { authorizeDomainSession } from "@/lib/auth/domain-access";
import { getCurrentSession } from "@/lib/auth/session";
import { ORG_A, ORG_B, domainDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/domains";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;
function login(actor: { authId: string; email: string }) { mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } }); }
const edit = { registrar: null, registrationDate: null, autoRenewStatus: "unknown", ownerUserId: null, notes: null } as const;
async function create(extra: Record<string, unknown> = {}) {
  return service.createDomain({ clientId: seed.clientA.id, domainName: "example.com", expirationDate: "2027-01-01", ...extra });
}
async function counts() {
  const r = await database.pg.query("select (select count(*)::int from domains) as domains, (select count(*)::int from activity_events) as events, (select count(*)::int from audit.log) as audits");
  return r.rows[0];
}
beforeAll(async () => { database = await domainDatabase(); mocks.getDb.mockReturnValue(database.db); }, 60000);
afterAll(async () => { await database?.pg.close(); });
beforeEach(async () => {
  seed = await seedProjects(database);
  await database.db.insert(rolePermissions).values([
    { roleId: seed.ownerA.roleId, permissionKey: "domain:read" }, { roleId: seed.ownerA.roleId, permissionKey: "domain:write" },
    { roleId: seed.ownerB.roleId, permissionKey: "domain:read" }, { roleId: seed.ownerB.roleId, permissionKey: "domain:write" },
  ]);
  login(seed.ownerA);
});

describe("Domínios autorização usando sessão e SQL reais", () => {
  it.each([
    { name: "sem grants", grants: [], read: false, write: false },
    { name: "write sem read", grants: ["domain:write", "client:read"], read: false, write: false },
    { name: "sem client:read", grants: ["domain:read", "domain:write"], read: false, write: false },
    { name: "read only", grants: ["domain:read", "client:read"], read: true, write: false },
    { name: "read write", read: true, write: true },
    { name: "assigned", scope: "assigned", read: false, write: false },
    { name: "super admin", roleKey: "super_admin", grants: [], read: true, write: true },
    { name: "user inativo", userActive: false, read: false, write: false },
    { name: "membership inativa", membershipActive: false, read: false, write: false },
  ])("$name", async options => {
    const actor = await projectMember(database, { ...options, grants: options.grants ?? ["domain:read", "domain:write", "client:read"] });
    login(actor);
    const session = await getCurrentSession();
    expect(authorizeDomainSession(session).ok).toBe(options.read);
    expect(authorizeDomainSession(session, "write").ok).toBe(options.write);
    if (options.read) await expect(service.listDomains()).resolves.toMatchObject({ total: 0 });
    else await expect(service.listDomains()).rejects.toMatchObject({ code: "forbidden" });
    if (options.write) await expect(create()).resolves.toHaveProperty("id");
    else await expect(create()).rejects.toMatchObject({ code: "forbidden" });
  });
  it("leitura/escrita nunca dependem de project:read", async () => {
    login(await projectMember(database, { grants: ["domain:read", "client:read", "domain:write"] }));
    await expect(service.listDomains()).resolves.toMatchObject({ total: 0 });
    await expect(create()).resolves.toHaveProperty("id");
  });
  it("toda leitura/mutação pública nega antes de procurar entidade", async () => {
    login(await projectMember(database, { grants: [] }));
    for (const call of [() => service.getDomainDetail("bad"), () => service.listDomainTimeline("bad"),
      () => service.listDomainClients(), () => service.getDomainClient("bad"), () => service.listAvailableDomainOwners(),
      () => service.getDomainCounts(), () => service.updateDomain("bad", {}, 1)]) {
      await expect(call()).rejects.toMatchObject({ code: "forbidden" });
    }
  });
});

describe("Domínios — mascaramento de Projeto vinculado", () => {
  it("sem project:read: domínio continua acessível, projeto vem oculto; com project:read, vem completo", async () => {
    const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "Projeto Real", createdBy: seed.ownerA.id }).returning();
    const d = await create({ projectId: project!.id });

    login(await projectMember(database, { grants: ["domain:read", "client:read"] })); // sem project:read
    const masked = await service.getDomainDetail(d.id);
    expect(masked.hasProject).toBe(true);
    expect(masked.projectId).toBeNull();
    expect(masked.projectName).toBeNull();
    expect(JSON.stringify(masked)).not.toContain("Projeto Real");

    login(seed.ownerA); // tem project:read + domain:read + client:read
    const full = await service.getDomainDetail(d.id);
    expect(full.hasProject).toBe(true);
    expect(full.projectId).toBe(project!.id);
    expect(full.projectName).toBe("Projeto Real");
  });
  it("listagem também mascara projectName por linha", async () => {
    const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "Segredo", createdBy: seed.ownerA.id }).returning();
    await create({ projectId: project!.id });
    login(await projectMember(database, { grants: ["domain:read", "client:read"] }));
    const { rows } = await service.listDomains();
    expect(rows[0]?.hasProject).toBe(true);
    expect(rows[0]?.projectName).toBeNull();
  });
});

describe("Domínios service — transações e regras", () => {
  it("cria com status/autoRenewStatus default, descarta autoridade forjada", async () => {
    const result = await create({ orgId: ORG_B, createdBy: seed.ownerB.id, version: 8 });
    const row = await service.getDomainDetail(result.id);
    expect(row).toMatchObject({ orgId: ORG_A, clientId: seed.clientA.id, createdBy: seed.ownerA.id, version: 1, status: "active", autoRenewStatus: "unknown" });
    expect(await counts()).toEqual({ domains: 1, events: 1, audits: 1 });
  });
  it("cliente inválido/inexistente/cross-org, projeto de outro cliente e owner inválido", async () => {
    await expect(create({ clientId: "bad" })).rejects.toMatchObject({ code: "validation" });
    for (const clientId of [crypto.randomUUID(), seed.clientB.id]) await expect(create({ clientId })).rejects.toMatchObject({ code: "invalid_client" });
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    const [projectOtherClient] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: clientA2!.id, name: "Outro", createdBy: seed.ownerA.id }).returning();
    await expect(create({ projectId: projectOtherClient!.id })).rejects.toMatchObject({ code: "invalid_project" });
    await expect(create({ ownerUserId: seed.ownerB.id })).rejects.toMatchObject({ code: "invalid_owner" });
    await expect(create({ ownerUserId: "bad" })).rejects.toMatchObject({ code: "validation" });
    expect(await counts()).toEqual({ domains: 0, events: 0, audits: 0 });
  });
  it("domínio ativo duplicado na mesma org é rejeitado com duplicate_domain", async () => {
    await create({ domainName: "duplicado.com" });
    await expect(create({ domainName: "duplicado.com" })).rejects.toMatchObject({ code: "duplicate_domain" });
  });
  it("UUID de rota inválido vira not_found antes da query e não vaza cross-org", async () => {
    const d = await create(); login(seed.ownerB);
    for (const id of ["bad", crypto.randomUUID(), d.id]) {
      await expect(service.getDomainDetail(id)).rejects.toMatchObject({ code: "not_found" });
      await expect(service.updateDomain(id, edit, 1)).rejects.toMatchObject({ code: "not_found" });
      await expect(service.listDomainTimeline(id)).rejects.toMatchObject({ code: "not_found" });
    }
  });
  it("diff por campo (status/autoRenewStatus/owner/projeto próprios; registrar/data/notes agrupados) e version avança", async () => {
    const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "P", createdBy: seed.ownerA.id }).returning();
    const d = await create();
    await service.updateDomain(d.id, { registrar: "Registro.br", autoRenewStatus: "configured", ownerUserId: seed.ownerA.id, projectId: project!.id }, 1);
    const events = await database.db.select().from(activityEvents);
    expect(events.map(e => e.kind).sort()).toEqual(["domain.created", "domain.auto_renew_changed", "domain.owner_changed", "domain.project_changed", "domain.updated"].sort());
    expect(await counts()).toEqual({ domains: 1, events: 5, audits: 2 });
    const audit = (await database.db.select().from(auditLog)).find(a => a.action === "domain.update")!;
    expect(audit.before).toMatchObject({ version: 1 });
    expect(audit.after).toMatchObject({ registrar: "Registro.br", version: 2 });
  });
  it("expiration_date gera evento próprio, distinto de updated", async () => {
    const d = await create();
    await service.updateDomain(d.id, { expirationDate: "2028-01-01" }, 1);
    const kinds = (await database.db.select().from(activityEvents)).map(e => e.kind);
    expect(kinds).toContain("domain.expiration_changed");
    expect(kinds).not.toContain("domain.updated");
  });
  it("no-op normalizado não escreve; versão antiga nunca passa (inclusive quando o resultado seria no-op)", async () => {
    const d = await create({ registrar: "Registro.br" });
    await service.updateDomain(d.id, { registrar: "Registro.br" }, 1);
    expect(await counts()).toEqual({ domains: 1, events: 1, audits: 1 });
    await service.updateDomain(d.id, { registrar: "Novo" }, 1);
    await expect(service.updateDomain(d.id, { registrar: "Novo" }, 1)).rejects.toMatchObject({ code: "conflict" });
    await expect(service.updateDomain(d.id, {}, 0)).rejects.toMatchObject({ code: "validation" });
    expect(await counts()).toEqual({ domains: 1, events: 2, audits: 2 });
  });
  it("payload vazio (nenhum campo enviado) nunca altera nada — mesma correção do hotfix de Suporte", async () => {
    const d = await create({ registrar: "Original", ownerUserId: seed.ownerA.id, status: "active" });
    const result = await service.updateDomain(d.id, {}, 1);
    expect(result.version).toBe(1);
    expect(await service.getDomainDetail(d.id)).toMatchObject({ registrar: "Original", ownerUserId: seed.ownerA.id, status: "active", version: 1 });
    expect(await counts()).toEqual({ domains: 1, events: 1, audits: 1 });
  });
  it("owner histórico inativo não bloqueia edição, mas bloqueia nova atribuição", async () => {
    const owner = await projectMember(database);
    const d = await create({ ownerUserId: owner.id });
    await database.db.update(users).set({ isActive: false }).where(eq(users.id, owner.id));
    await database.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, owner.membershipId));
    await service.updateDomain(d.id, { registrar: "Histórico" }, 1);
    expect((await service.getDomainDetail(d.id)).ownerUserId).toBe(owner.id);
    await expect(create({ ownerUserId: owner.id })).rejects.toMatchObject({ code: "invalid_owner" });
  });
  it.each([
    ["active", "transferring"], ["active", "inactive"], ["transferring", "active"], ["transferring", "inactive"], ["inactive", "active"],
  ])("transição permitida %s → %s", async (from, to) => {
    const d = await create({ status: from });
    await service.updateDomain(d.id, { status: to }, 1);
    expect((await service.getDomainDetail(d.id)).status).toBe(to);
  });
  it("inactive → transferring é rejeitado (só pode reativar direto para active, Checkpoint A §22)", async () => {
    const d = await create({ status: "inactive" });
    await expect(service.updateDomain(d.id, { status: "transferring" }, 1)).rejects.toMatchObject({ code: "invalid_transition" });
  });
  it("projeto pode ser vinculado, trocado e removido depois da criação", async () => {
    const [p1] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "P1", createdBy: seed.ownerA.id }).returning();
    const [p2] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "P2", createdBy: seed.ownerA.id }).returning();
    const d = await create();
    await service.updateDomain(d.id, { projectId: p1!.id }, 1);
    expect((await service.getDomainDetail(d.id)).projectId).toBe(p1!.id);
    await service.updateDomain(d.id, { projectId: p2!.id }, 2);
    expect((await service.getDomainDetail(d.id)).projectId).toBe(p2!.id);
    await service.updateDomain(d.id, { projectId: null }, 3);
    expect((await service.getDomainDetail(d.id)).projectId).toBeNull();
  });
  it("notes: conteúdo nunca aparece em activity_events nem em audit.log — só o rótulo do campo", async () => {
    const d = await create();
    await service.updateDomain(d.id, { notes: "Conteúdo sensível de observação" }, 1);
    const event = (await database.db.select().from(activityEvents)).find(e => e.kind === "domain.updated")!;
    expect(event.summary).not.toContain("Conteúdo sensível");
    expect(JSON.stringify(event.payload)).not.toContain("Conteúdo sensível");
    const audit = (await database.db.select().from(auditLog)).find(a => a.action === "domain.update")!;
    expect(JSON.stringify(audit.after)).not.toContain("Conteúdo sensível");
    expect(audit.after).toMatchObject({ notesPresent: true });
  });
  it.each(["activity_events", "audit.log"])("falha em %s reverte CREATE e UPDATE", async table => {
    const d = await create();
    await database.pg.exec(`create function public.fail_domain_test() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$; create trigger fail_domain_test before insert on ${table} for each row execute function public.fail_domain_test()`);
    try {
      await expect(create({ domainName: "segundo-dominio.com" })).rejects.toMatchObject({ code: "database_error" });
      await expect(service.updateDomain(d.id, { registrar: "Não persistir" }, 1)).rejects.toMatchObject({ code: "database_error" });
      expect(await counts()).toEqual({ domains: 1, events: 1, audits: 1 });
      expect(await service.getDomainDetail(d.id)).toMatchObject({ registrar: null, version: 1 });
    } finally { await database.pg.exec(`drop trigger fail_domain_test on ${table}; drop function public.fail_domain_test()`); }
  });
  it("duas submissões simultâneas da mesma versão: uma vence sem eventos órfãos", async () => {
    const d = await create();
    const results = await Promise.allSettled([
      service.updateDomain(d.id, { registrar: "Edição A" }, 1), service.updateDomain(d.id, { registrar: "Edição B" }, 1),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "conflict" } });
    expect(await counts()).toEqual({ domains: 1, events: 2, audits: 2 });
  });
});

describe("Domínios consultas e paginação", () => {
  it("filtros, busca literal, counts e isolamento", async () => {
    const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "P", createdBy: seed.ownerA.id }).returning();
    await create({ domainName: "critico.com", autoRenewStatus: "disabled", ownerUserId: seed.ownerA.id, projectId: project!.id, expirationDate: "2000-01-01" });
    await create({ domainName: "outro-dominio.com" });
    expect((await service.listDomains({ q: "critico" })).total).toBe(1);
    await database.db.insert(domains).values({ orgId: ORG_B, clientId: seed.clientB.id, createdBy: seed.ownerB.id, domainName: "segredo.com", expirationDate: "2027-01-01" });
    expect((await service.listDomains({ q: "Cliente A" })).total).toBe(2);
    expect((await service.listDomains({ autoRenewStatus: "disabled", expired: "true", ownerUserId: seed.ownerA.id })).total).toBe(1);
    expect((await service.listDomains({ ownerUserId: "unassigned" })).total).toBe(1);
    expect((await service.listDomains({ projectId: project!.id })).total).toBe(1);
    expect(await service.getDomainCounts(seed.clientA.id)).toEqual({ total: 2, active: 2, expiring30: 0, expiring7: 0, expired: 1 });
    await expect(service.getDomainCounts(seed.clientB.id)).rejects.toMatchObject({ code: "invalid_client" });
    expect((await service.listAvailableDomainOwners()).map(o => o.userId)).not.toContain(seed.ownerB.id);
  });
  it("domínios inactive não entram nos KPIs de vencimento (decisão D31)", async () => {
    await create({ domainName: "vencido-inativo.com", expirationDate: "2000-01-01", status: "inactive" });
    expect(await service.getDomainCounts(seed.clientA.id)).toMatchObject({ total: 1, active: 0, expired: 0 });
  });
  it("25 linhas por página, clamp e desempate estável", async () => {
    await database.db.insert(domains).values(Array.from({ length: 28 }, (_, i) => ({ orgId: ORG_A, clientId: seed.clientA.id, createdBy: seed.ownerA.id, domainName: `dominio-${i}.com`, expirationDate: "2027-01-01" })));
    const first = await service.listDomains({ sort: "domainName" }), second = await service.listDomains({ sort: "domainName", page: 999 });
    expect(first.rows).toHaveLength(25); expect(second.rows).toHaveLength(3); expect(second.page).toBe(2);
    expect(new Set([...first.rows, ...second.rows].map(d => d.id)).size).toBe(28);
    expect((await service.listDomains({ sort: "created" })).rows).toHaveLength(25);
    expect((await service.listDomains({ sort: "updated" })).rows).toHaveLength(25);
  });
  it("seletor de Cliente paginado, e seletor de Projeto restrito ao Cliente escolhido", async () => {
    await database.db.insert(clients).values(Array.from({ length: 26 }, (_, i) => ({ orgId: ORG_A, createdBy: seed.ownerA.id, name: `Empresa ${i}` })));
    expect((await service.listDomainClients()).rows).toHaveLength(25);
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    await database.db.insert(projects).values([
      { orgId: ORG_A, clientId: seed.clientA.id, name: "Do Cliente A", createdBy: seed.ownerA.id },
      { orgId: ORG_A, clientId: clientA2!.id, name: "Do Cliente A2", createdBy: seed.ownerA.id },
    ]);
    const forClientA = await service.listDomainProjects({ clientId: seed.clientA.id });
    expect(forClientA.rows.map(r => r.name)).toEqual(["Do Cliente A"]);
    await expect(service.listDomainProjects({ clientId: seed.clientB.id })).rejects.toMatchObject({ code: "invalid_client" });
  });
  it("timeline em janelas de 20, sem cumulatividade ou payload como autoridade", async () => {
    const d = await create();
    await database.db.insert(activityEvents).values(Array.from({ length: 24 }, () => ({ orgId: ORG_A, entityType: "domain", entityId: d.id, kind: "domain.updated", summary: "Teste" })));
    await database.db.insert(activityEvents).values({ orgId: ORG_B, entityType: "domain", entityId: d.id, kind: "legacy", summary: "Outro", payload: { clientId: seed.clientA.id } });
    const a = await service.listDomainTimeline(d.id), b = await service.listDomainTimeline(d.id, 2);
    expect(a.rows).toHaveLength(20); expect(b.rows).toHaveLength(5); expect(a.total).toBe(25);
    expect(new Set([...a.rows, ...b.rows].map(e => e.id)).size).toBe(25);
  });
});

describe("Domínios agregadores de UI", () => {
  it("getDomainsPageData combina listagem, KPIs e responsáveis numa só chamada", async () => {
    await create({ domainName: "um.com" });
    await create({ domainName: "dois.com", autoRenewStatus: "configured" });
    const data = await service.getDomainsPageData({ sort: "domainName" });
    expect(data.rows.map(r => r.domainName)).toEqual(["dois.com", "um.com"]);
    expect(data.kpis).toEqual({ total: 2, active: 2, expiring30: 0, expiring7: 0, expired: 0 });
    expect(data.owners.map(o => o.userId)).toContain(seed.ownerA.id);
  });
  it("getDomainsPageData nega sem domain:read+client:read", async () => {
    login(await projectMember(database, { grants: [] }));
    await expect(service.getDomainsPageData()).rejects.toMatchObject({ code: "forbidden" });
  });
  it("getDomainWorkspace combina domínio e timeline; 404 em cross-org e inexistente", async () => {
    const d = await create({ domainName: "workspace.com" });
    const workspace = await service.getDomainWorkspace(d.id);
    expect(workspace.domain.domainName).toBe("workspace.com");
    expect(workspace.timeline.rows.length).toBeGreaterThan(0);
    await expect(service.getDomainWorkspace("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "not_found" });
    const [crossOrg] = await database.db.insert(domains).values({ orgId: ORG_B, clientId: seed.clientB.id, createdBy: seed.ownerB.id, domainName: "outraorg.com", expirationDate: "2027-01-01" }).returning();
    await expect(service.getDomainWorkspace(crossOrg!.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
