// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, domains, projects, rolePermissions } from "@/server/db/schema";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));

import * as service from "@/server/services/domain-service";
import { ORG_A, ORG_B, domainDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/domains";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;
let projectA: { id: string; name: string };
let projectB: { id: string; name: string };

const PROJECT_A_NAME = "Projeto Secreto Alfa";
const PROJECT_B_NAME = "Projeto Secreto Beta";

function login(actor: { authId: string; email: string }) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } });
}
async function domainRow(id: string) {
  const [row] = await database.db.select().from(domains).where(eq(domains.id, id));
  return row!;
}
async function projectEvents(domainId: string) {
  return (await database.db.select().from(activityEvents).where(eq(activityEvents.entityId, domainId)))
    .filter((e) => e.kind === "domain.project_changed");
}

beforeAll(async () => {
  database = await domainDatabase();
  mocks.getDb.mockReturnValue(database.db);
}, 60000);
afterAll(async () => {
  await database?.pg.close();
});
beforeEach(async () => {
  seed = await seedProjects(database);
  await database.db.insert(rolePermissions).values([
    { roleId: seed.ownerA.roleId, permissionKey: "domain:read" },
    { roleId: seed.ownerA.roleId, permissionKey: "domain:write" },
  ]);
  const inserted = await database.db.insert(projects).values([
    { orgId: ORG_A, clientId: seed.clientA.id, name: PROJECT_A_NAME, createdBy: seed.ownerA.id },
    { orgId: ORG_A, clientId: seed.clientA.id, name: PROJECT_B_NAME, createdBy: seed.ownerA.id },
  ]).returning();
  projectA = inserted[0]!;
  projectB = inserted[1]!;
  login(seed.ownerA); // project:* + client:read + domain:*
});

async function linkedDomain(extra: Record<string, unknown> = {}) {
  login(seed.ownerA);
  return service.createDomain({ clientId: seed.clientA.id, domainName: "vinculado.com", expirationDate: "2027-01-01", projectId: projectA.id, ...extra });
}
async function maskedWriter() {
  const actor = await projectMember(database, { grants: ["domain:read", "domain:write", "client:read"] });
  login(actor);
  return actor;
}
async function maskedReader() {
  const actor = await projectMember(database, { grants: ["domain:read", "client:read"] });
  login(actor);
  return actor;
}

describe("Sem project:read — leitura continua e nada do Projeto vaza", () => {
  it("A/B/C. lista, detalhe e workspace: domínios acessíveis, sem nome/UUID do Projeto", async () => {
    const linked = await linkedDomain({ domainName: "com-projeto.com" });
    await service.createDomain({ clientId: seed.clientA.id, domainName: "sem-projeto.com", expirationDate: "2027-01-01" });
    await maskedReader();

    const list = await service.listDomains();
    const page = await service.getDomainsPageData();
    const detail = await service.getDomainDetail(linked.id);
    const workspace = await service.getDomainWorkspace(linked.id);

    expect(list.total).toBe(2);
    expect(page.total).toBe(2);
    expect(detail).toMatchObject({ hasProject: true, projectId: null, projectName: null });
    for (const payload of [list, page, detail, workspace]) {
      const json = JSON.stringify(payload);
      expect(json).not.toContain(PROJECT_A_NAME);
      expect(json).not.toContain(projectA.id);
    }
  });

  it("D. seletor/lookup de Projeto negados antes de qualquer validação ou consulta", async () => {
    await maskedReader();
    await expect(service.listDomainProjects({ clientId: seed.clientA.id })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.listDomainProjects({ clientId: "invalido" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.getDomainProject(seed.clientA.id, projectA.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.getDomainProject("invalido", "invalido")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("E/F. filtro de Projeto vindo da URL é ignorado (sem oráculo de existência)", async () => {
    await linkedDomain({ domainName: "com-projeto.com" });
    await service.createDomain({ clientId: seed.clientA.id, domainName: "sem-projeto.com", expirationDate: "2027-01-01" });
    await maskedReader();

    const unfiltered = await service.getDomainsPageData();
    const realProject = await service.getDomainsPageData({ projectId: projectA.id });
    const unknownProject = await service.getDomainsPageData({ projectId: crypto.randomUUID() });

    for (const result of [realProject, unknownProject]) {
      expect(result.total).toBe(unfiltered.total);
      expect(result.rows.map((r) => r.id).sort()).toEqual(unfiltered.rows.map((r) => r.id).sort());
      expect(result.filters.projectId).toBeNull();
    }
    expect((await service.listDomains({ projectId: projectA.id })).total).toBe(2);
  });

  it("G. busca pelo nome do Projeto não encontra o domínio", async () => {
    await linkedDomain({ domainName: "neutro.com" });
    await maskedReader();
    expect((await service.listDomains({ q: "Secreto Alfa" })).total).toBe(0);
    expect((await service.getDomainsPageData({ q: "Secreto" })).total).toBe(0);
    expect((await service.listDomains({ q: "neutro" })).total).toBe(1);
    expect((await service.listDomains({ q: "Cliente A" })).total).toBe(1);
  });
});

describe("Sem project:read — escrita não toca o vínculo", () => {
  it("I. criação com projectId forjado é rejeitada (projeto real ou inexistente, mesmo código)", async () => {
    await maskedWriter();
    for (const projectId of [projectA.id, crypto.randomUUID()]) {
      await expect(service.createDomain({ clientId: seed.clientA.id, domainName: "forjado.com", expirationDate: "2027-01-01", projectId })).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await database.db.select().from(domains)).toHaveLength(0);
  });

  it("criação sem projectId funciona e nasce sem projeto", async () => {
    await maskedWriter();
    const created = await service.createDomain({ clientId: seed.clientA.id, domainName: "sem-vinculo.com", expirationDate: "2027-01-01" });
    expect((await domainRow(created.id)).projectId).toBeNull();
  });

  it("J. editar registrador preserva project_id", async () => {
    const d = await linkedDomain();
    await maskedWriter();
    await service.updateDomain(d.id, { registrar: "Registro.br" }, 1);
    expect(await domainRow(d.id)).toMatchObject({ registrar: "Registro.br", projectId: projectA.id, version: 2 });
    expect(await projectEvents(d.id)).toHaveLength(0);
  });

  it("K. editar vencimento preserva project_id e o status atual", async () => {
    const d = await linkedDomain({ status: "transferring" });
    await maskedWriter();
    await service.updateDomain(d.id, { expirationDate: "2028-01-01" }, 1);
    expect(await domainRow(d.id)).toMatchObject({ expirationDate: "2028-01-01", projectId: projectA.id, status: "transferring" });
    expect(await projectEvents(d.id)).toHaveLength(0);
  });

  it("L. não consegue remover nem trocar o vínculo (null ou outro projeto)", async () => {
    const d = await linkedDomain();
    await maskedWriter();
    for (const projectId of [null, projectB.id]) {
      await expect(service.updateDomain(d.id, { registrar: "Tentativa", projectId }, 1)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await domainRow(d.id)).toMatchObject({ registrar: null, projectId: projectA.id, version: 1 });
    expect(await projectEvents(d.id)).toHaveLength(0);
  });

  it("payload vazio (sem projectId) preserva o vínculo e não toca em mais nada", async () => {
    const d = await linkedDomain({ status: "active" });
    await maskedWriter();
    const result = await service.updateDomain(d.id, {}, 1);
    expect(result.version).toBe(1); // no-op de verdade — nem version avança
    expect(await domainRow(d.id)).toMatchObject({ projectId: projectA.id, version: 1 });
  });
});

describe("Com project:read — o vínculo continua gerenciável", () => {
  it("H. busca e filtro por Projeto continuam funcionando", async () => {
    await linkedDomain({ domainName: "neutro.com" });
    await service.createDomain({ clientId: seed.clientA.id, domainName: "sem-projeto.com", expirationDate: "2027-01-01" });
    expect((await service.listDomains({ q: "Secreto Alfa" })).total).toBe(1);
    const filtered = await service.getDomainsPageData({ projectId: projectA.id });
    expect(filtered.total).toBe(1);
    expect(filtered.filters.projectId).toBe(projectA.id);
    expect((await service.listDomainProjects({ clientId: seed.clientA.id })).rows.map((r) => r.name)).toEqual([PROJECT_A_NAME, PROJECT_B_NAME]);
  });

  it("M/N/O. vincular, trocar e remover, e ausência preserva", async () => {
    const d = await service.createDomain({ clientId: seed.clientA.id, domainName: "livre.com", expirationDate: "2027-01-01" });
    await service.updateDomain(d.id, { projectId: projectA.id }, 1);
    expect((await domainRow(d.id)).projectId).toBe(projectA.id);
    await service.updateDomain(d.id, { projectId: projectB.id }, 2);
    expect((await domainRow(d.id)).projectId).toBe(projectB.id);
    await service.updateDomain(d.id, { registrar: "Sem campo de projeto" }, 3);
    expect((await domainRow(d.id)).projectId).toBe(projectB.id);
    await service.updateDomain(d.id, { projectId: null }, 4);
    expect((await domainRow(d.id)).projectId).toBeNull();
    expect(await projectEvents(d.id)).toHaveLength(3);
  });

  it("P. projeto de outra org ou de outro cliente continua rejeitado", async () => {
    const [foreign] = await database.db.insert(projects).values({ orgId: ORG_B, clientId: seed.clientB.id, name: "Externo", createdBy: seed.ownerB.id }).returning();
    const d = await service.createDomain({ clientId: seed.clientA.id, domainName: "isolado.com", expirationDate: "2027-01-01" });
    await expect(service.updateDomain(d.id, { projectId: foreign!.id }, 1)).rejects.toMatchObject({ code: "invalid_project" });
    await expect(service.createDomain({ clientId: seed.clientA.id, domainName: "isolado2.com", expirationDate: "2027-01-01", projectId: foreign!.id })).rejects.toMatchObject({ code: "invalid_project" });
    await expect(service.listDomainProjects({ clientId: seed.clientB.id })).rejects.toMatchObject({ code: "invalid_client" });
    await expect(service.getDomainProject(seed.clientA.id, foreign!.id)).rejects.toMatchObject({ code: "invalid_project" });
    expect((await domainRow(d.id)).projectId).toBeNull();
  });
});
