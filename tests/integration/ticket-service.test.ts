// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, auditLog, clients, memberships, projects, rolePermissions, supportTickets, ticketComments, users } from "@/server/db/schema";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
import * as service from "@/server/services/ticket-service";
import { authorizeTicketSession } from "@/lib/auth/ticket-access";
import { getCurrentSession } from "@/lib/auth/session";
import { ORG_A, ORG_B, ticketDatabase, projectMember, seedProjects, type TestDatabase } from "../helpers/tickets";

let database: TestDatabase;
let seed: Awaited<ReturnType<typeof seedProjects>>;
function login(actor: { authId: string; email: string }) { mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authId, email: actor.email } } }); }
const edit = { title: "Chamado", description: "Descrição", status: "open", priority: "normal", projectId: null, assignedUserId: null, dueAt: null };
async function create(extra: Record<string, unknown> = {}) { return service.createTicket({ clientId: seed.clientA.id, ...edit, ...extra }); }
async function counts() {
  const r = await database.pg.query("select (select count(*)::int from support_tickets) as tickets, (select count(*)::int from ticket_comments) as comments, (select count(*)::int from activity_events) as events, (select count(*)::int from audit.log) as audits");
  return r.rows[0];
}
beforeAll(async () => { database = await ticketDatabase(); mocks.getDb.mockReturnValue(database.db); }, 60000);
afterAll(async () => { await database?.pg.close(); });
beforeEach(async () => {
  seed = await seedProjects(database);
  // seedProjects só concede project:*/client:read por padrão — este arquivo testa Suporte,
  // então soma ticket:read/write aos dois donos-padrão sem alterar o helper compartilhado.
  await database.db.insert(rolePermissions).values([
    { roleId: seed.ownerA.roleId, permissionKey: "ticket:read" }, { roleId: seed.ownerA.roleId, permissionKey: "ticket:write" },
    { roleId: seed.ownerB.roleId, permissionKey: "ticket:read" }, { roleId: seed.ownerB.roleId, permissionKey: "ticket:write" },
  ]);
  login(seed.ownerA);
});

describe("Suporte autorização usando sessão e SQL reais", () => {
  it.each([
    { name: "sem grants", grants: [], read: false, write: false },
    { name: "write sem read", grants: ["ticket:write", "client:read"], read: false, write: false },
    { name: "sem client:read", grants: ["ticket:read", "ticket:write"], read: false, write: false },
    { name: "read only", grants: ["ticket:read", "client:read"], read: true, write: false },
    { name: "read write", read: true, write: true },
    { name: "assigned", scope: "assigned", read: false, write: false },
    { name: "super admin", roleKey: "super_admin", grants: [], read: true, write: true },
    { name: "user inativo", userActive: false, read: false, write: false },
    { name: "membership inativa", membershipActive: false, read: false, write: false },
  ])("$name", async options => {
    const actor = await projectMember(database, { ...options, grants: options.grants ?? ["ticket:read", "ticket:write", "client:read"] });
    login(actor);
    const session = await getCurrentSession();
    expect(authorizeTicketSession(session).ok).toBe(options.read);
    expect(authorizeTicketSession(session, "write").ok).toBe(options.write);
    if (options.read) await expect(service.listTickets()).resolves.toMatchObject({ total: 0 });
    else await expect(service.listTickets()).rejects.toMatchObject({ code: "forbidden" });
    if (options.write) await expect(create()).resolves.toHaveProperty("id");
    else await expect(create()).rejects.toMatchObject({ code: "forbidden" });
  });
  it("leitura/escrita nunca dependem de project:read (Checkpoint A §5/§9)", async () => {
    login(await projectMember(database, { grants: ["ticket:read", "client:read", "ticket:write"] }));
    await expect(service.listTickets()).resolves.toMatchObject({ total: 0 });
    await expect(create()).resolves.toHaveProperty("id");
  });
  it("toda leitura/mutação pública nega antes de procurar entidade", async () => {
    login(await projectMember(database, { grants: [] }));
    for (const call of [() => service.getTicketDetail("bad"), () => service.listTicketTimeline("bad"),
      () => service.listTicketClients(), () => service.getTicketClient("bad"), () => service.listAvailableTicketAssignees(),
      () => service.getTicketCounts(), () => service.updateTicket("bad", {}, 1),
      () => service.changeTicketStatus({}), () => service.reopenTicket({}), () => service.createTicketComment({})]) {
      await expect(call()).rejects.toMatchObject({ code: "forbidden" });
    }
  });
});

describe("Suporte — mascaramento de Projeto vinculado (Opção A aprovada)", () => {
  it("sem project:read: chamado continua acessível, projeto vem oculto; com project:read, vem completo", async () => {
    const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "Projeto Real", createdBy: seed.ownerA.id }).returning();
    const t = await create({ projectId: project!.id });

    login(await projectMember(database, { grants: ["ticket:read", "client:read"] })); // sem project:read
    const masked = await service.getTicketDetail(t.id);
    expect(masked.hasProject).toBe(true);
    expect(masked.projectId).toBeNull();
    expect(masked.projectName).toBeNull();
    expect(JSON.stringify(masked)).not.toContain("Projeto Real");

    login(seed.ownerA); // tem project:read + ticket:read + client:read
    const full = await service.getTicketDetail(t.id);
    expect(full.hasProject).toBe(true);
    expect(full.projectId).toBe(project!.id);
    expect(full.projectName).toBe("Projeto Real");
  });
  it("listagem também mascara projectName por linha", async () => {
    const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "Segredo", createdBy: seed.ownerA.id }).returning();
    await create({ projectId: project!.id });
    login(await projectMember(database, { grants: ["ticket:read", "client:read"] }));
    const { rows } = await service.listTickets();
    expect(rows[0]?.hasProject).toBe(true);
    expect(rows[0]?.projectName).toBeNull();
  });
});

describe("Suporte service — transações e regras", () => {
  it("cria com ticket_number, descarta autoridade forjada", async () => {
    const result = await create({ orgId: ORG_B, createdBy: seed.ownerB.id, ticketNumber: 999999, version: 8 });
    const row = await service.getTicketDetail(result.id);
    expect(row).toMatchObject({ orgId: ORG_A, clientId: seed.clientA.id, createdBy: seed.ownerA.id, version: 1 });
    expect(row.ticketNumber).toBe(result.ticketNumber);
    expect(await counts()).toEqual({ tickets: 1, comments: 0, events: 1, audits: 1 });
    const event = (await database.db.select().from(activityEvents))[0]!;
    expect(event).toMatchObject({ entityType: "ticket", entityId: result.id, orgId: ORG_A, payload: { clientId: seed.clientA.id } });
    expect(JSON.stringify((await database.db.select().from(auditLog))[0])).not.toContain("999999");
  });
  it("cliente inválido/inexistente/cross-org, projeto de outro cliente e assignee inválido", async () => {
    await expect(create({ clientId: "bad" })).rejects.toMatchObject({ code: "validation" });
    for (const clientId of [crypto.randomUUID(), seed.clientB.id]) await expect(create({ clientId })).rejects.toMatchObject({ code: "invalid_client" });
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    const [projectOtherClient] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: clientA2!.id, name: "Outro", createdBy: seed.ownerA.id }).returning();
    await expect(create({ projectId: projectOtherClient!.id })).rejects.toMatchObject({ code: "invalid_project" });
    await expect(create({ assignedUserId: seed.ownerB.id })).rejects.toMatchObject({ code: "invalid_owner" });
    await expect(create({ assignedUserId: "bad" })).rejects.toMatchObject({ code: "validation" });
    expect(await counts()).toEqual({ tickets: 0, comments: 0, events: 0, audits: 0 });
  });
  it("UUID de rota inválido vira not_found antes da query e não vaza cross-org", async () => {
    const t = await create(); login(seed.ownerB);
    for (const id of ["bad", crypto.randomUUID(), t.id]) {
      await expect(service.getTicketDetail(id)).rejects.toMatchObject({ code: "not_found" });
      await expect(service.updateTicket(id, edit, 1)).rejects.toMatchObject({ code: "not_found" });
      await expect(service.listTicketTimeline(id)).rejects.toMatchObject({ code: "not_found" });
    }
  });
  it("diff por campo (título/descrição agrupados; status/prioridade/assignee/projeto próprios) e version avança", async () => {
    const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "P", createdBy: seed.ownerA.id }).returning();
    const t = await create();
    await service.updateTicket(t.id, { ...edit, title: " Novo ", priority: "high", assignedUserId: seed.ownerA.id, projectId: project!.id }, 1);
    const events = await database.db.select().from(activityEvents);
    expect(events.map(e => e.kind).sort()).toEqual(["ticket.created", "ticket.priority_changed", "ticket.assignee_changed", "ticket.project_changed", "ticket.updated"].sort());
    expect(await counts()).toEqual({ tickets: 1, comments: 0, events: 5, audits: 2 });
    const audit = (await database.db.select().from(auditLog)).find(a => a.action === "ticket.update")!;
    expect(audit.before).toMatchObject({ title: "Chamado", version: 1 });
    expect(audit.after).toMatchObject({ title: "Novo", version: 2 });
  });
  it("prazo (due_at) gera evento próprio, distinto de updated", async () => {
    const t = await create();
    await service.updateTicket(t.id, { ...edit, dueAt: "2026-10-01T12:00:00Z" }, 1);
    const kinds = (await database.db.select().from(activityEvents)).map(e => e.kind);
    expect(kinds).toContain("ticket.due_date_changed");
    expect(kinds).not.toContain("ticket.updated");
  });
  it("no-op normalizado não escreve; versão antiga nunca passa", async () => {
    const t = await create();
    await service.updateTicket(t.id, { ...edit, title: " Chamado ", description: " Descrição " }, "1");
    expect(await counts()).toEqual({ tickets: 1, comments: 0, events: 1, audits: 1 });
    await service.updateTicket(t.id, { ...edit, title: "Novo" }, 1);
    await expect(service.updateTicket(t.id, { ...edit, title: "Novo" }, 1)).rejects.toMatchObject({ code: "conflict" });
    await expect(service.updateTicket(t.id, edit, 0)).rejects.toMatchObject({ code: "validation" });
    expect(await counts()).toEqual({ tickets: 1, comments: 0, events: 2, audits: 2 });
  });
  it("assignee histórico inativo não bloqueia edição, mas bloqueia nova atribuição", async () => {
    const assignee = await projectMember(database);
    const t = await create({ assignedUserId: assignee.id });
    await database.db.update(users).set({ isActive: false }).where(eq(users.id, assignee.id));
    await database.db.update(memberships).set({ isActive: false }).where(eq(memberships.id, assignee.membershipId));
    await service.updateTicket(t.id, { ...edit, title: "Histórico", assignedUserId: assignee.id }, 1);
    expect((await service.getTicketDetail(t.id)).assignedUserId).toBe(assignee.id);
    await expect(create({ assignedUserId: assignee.id })).rejects.toMatchObject({ code: "invalid_owner" });
  });
  it("resolver define resolved_at; cancelar nunca finge resolução; reabrir limpa e volta para in_progress", async () => {
    const t = await create();
    await expect(service.updateTicket(t.id, { ...edit, status: "resolved" }, 1)).rejects.toMatchObject({ code: "invalid_transition" });
    await service.changeTicketStatus({ ticketId: t.id, version: 1, status: "resolved" });
    const resolved = await service.getTicketDetail(t.id);
    expect(resolved).toMatchObject({ status: "resolved", version: 2 });
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    await expect(service.changeTicketStatus({ ticketId: t.id, version: 2, status: "cancelled" })).rejects.toMatchObject({ code: "invalid_transition" });
    await service.reopenTicket({ ticketId: t.id, version: 2 });
    const reopened = await service.getTicketDetail(t.id);
    expect(reopened).toMatchObject({ status: "in_progress", resolvedAt: null, version: 3 });
    await expect(service.reopenTicket({ ticketId: t.id, version: 3 })).rejects.toMatchObject({ code: "invalid_transition" });
    const kinds = (await database.db.select().from(activityEvents)).map(e => e.kind);
    expect(kinds.filter(k => k === "ticket.status_changed")).toHaveLength(2);
  });
  it("transições rápidas entre não-finais usam changeTicketStatus (ações da ficha, Checkpoint C2 §29), sem passar por reopen", async () => {
    const t = await create(); // open
    await service.changeTicketStatus({ ticketId: t.id, version: 1, status: "triage" });
    expect((await service.getTicketDetail(t.id)).status).toBe("triage");
    await service.changeTicketStatus({ ticketId: t.id, version: 2, status: "in_progress" });
    expect((await service.getTicketDetail(t.id)).status).toBe("in_progress");
    await service.changeTicketStatus({ ticketId: t.id, version: 3, status: "waiting_client" });
    expect((await service.getTicketDetail(t.id)).status).toBe("waiting_client");
    await service.changeTicketStatus({ ticketId: t.id, version: 4, status: "in_progress" });
    const backToProgress = await service.getTicketDetail(t.id);
    expect(backToProgress).toMatchObject({ status: "in_progress", resolvedAt: null, version: 5 });
    // Não pode pular de um estado final direto para outro não-final via changeTicketStatus sem reabrir antes.
    await service.changeTicketStatus({ ticketId: t.id, version: 5, status: "resolved" });
    await expect(service.changeTicketStatus({ ticketId: t.id, version: 6, status: "triage" })).rejects.toMatchObject({ code: "invalid_transition" });
  });
  it("cancelar mantém resolved_at nulo desde o início", async () => {
    const t = await create();
    await service.changeTicketStatus({ ticketId: t.id, version: 1, status: "cancelled" });
    expect(await service.getTicketDetail(t.id)).toMatchObject({ status: "cancelled", resolvedAt: null });
  });
  it("edição de campos comuns funciona mesmo com chamado já resolvido, sem tocar status", async () => {
    const t = await create();
    await service.changeTicketStatus({ ticketId: t.id, version: 1, status: "resolved" });
    await service.updateTicket(t.id, { ...edit, status: "resolved", title: "Ajuste pós-resolução" }, 2);
    expect(await service.getTicketDetail(t.id)).toMatchObject({ status: "resolved", title: "Ajuste pós-resolução" });
  });
  it("projeto pode ser vinculado, trocado e removido depois da criação", async () => {
    const [p1] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "P1", createdBy: seed.ownerA.id }).returning();
    const [p2] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "P2", createdBy: seed.ownerA.id }).returning();
    const t = await create();
    await service.updateTicket(t.id, { ...edit, projectId: p1!.id }, 1);
    expect((await service.getTicketDetail(t.id)).projectId).toBe(p1!.id);
    await service.updateTicket(t.id, { ...edit, projectId: p2!.id }, 2);
    expect((await service.getTicketDetail(t.id)).projectId).toBe(p2!.id);
    await service.updateTicket(t.id, { ...edit, projectId: null }, 3);
    expect((await service.getTicketDetail(t.id)).projectId).toBeNull();
  });
  it.each(["activity_events", "audit.log"])("falha em %s reverte CREATE e UPDATE", async table => {
    const t = await create();
    await database.pg.exec(`create function public.fail_ticket_test() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$; create trigger fail_ticket_test before insert on ${table} for each row execute function public.fail_ticket_test()`);
    try {
      await expect(create()).rejects.toMatchObject({ code: "database_error" });
      await expect(service.updateTicket(t.id, { ...edit, title: "Não persistir" }, 1)).rejects.toMatchObject({ code: "database_error" });
      expect(await counts()).toEqual({ tickets: 1, comments: 0, events: 1, audits: 1 });
      expect(await service.getTicketDetail(t.id)).toMatchObject({ title: "Chamado", version: 1 });
    } finally { await database.pg.exec(`drop trigger fail_ticket_test on ${table}; drop function public.fail_ticket_test()`); }
  });
  it("duas submissões simultâneas da mesma versão: uma vence sem eventos órfãos", async () => {
    const t = await create();
    const results = await Promise.allSettled([
      service.updateTicket(t.id, { ...edit, title: "Edição A" }, 1), service.updateTicket(t.id, { ...edit, title: "Edição B" }, 1),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "conflict" } });
    expect(await counts()).toEqual({ tickets: 1, comments: 0, events: 2, audits: 2 });
  });
});

describe("Suporte — comentários", () => {
  it("cria comentário: evento e auditoria não duplicam o texto completo", async () => {
    const t = await create();
    const comment = await service.createTicketComment({ ticketId: t.id, content: "Cliente ligou pedindo atualização." });
    expect(comment).toHaveProperty("id");
    const rows = await database.db.select().from(ticketComments);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toBe("Cliente ligou pedindo atualização.");
    const event = (await database.db.select().from(activityEvents)).find(e => e.kind === "ticket.comment_added")!;
    expect(event.summary).not.toContain("Cliente ligou");
    expect(JSON.stringify(event.payload)).not.toContain("Cliente ligou");
    const audit = (await database.db.select().from(auditLog)).find(a => a.action === "ticket.comment.create")!;
    expect(JSON.stringify(audit.after)).not.toContain("Cliente ligou");
    expect(audit.after).toMatchObject({ commentId: comment.id, ticketId: t.id });
  });
  it("exige ticket:write (ticket:read sozinho não basta) e client:read", async () => {
    const t = await create();
    login(await projectMember(database, { grants: ["ticket:read", "client:read"] }));
    await expect(service.createTicketComment({ ticketId: t.id, content: "x" })).rejects.toMatchObject({ code: "forbidden" });
  });
  it("lista em ordem cronológica ascendente (conversa, não auditoria)", async () => {
    const t = await create();
    await service.createTicketComment({ ticketId: t.id, content: "Primeiro" });
    await service.createTicketComment({ ticketId: t.id, content: "Segundo" });
    const workspace = await service.getTicketWorkspace(t.id);
    expect(workspace.comments.map(c => c.content)).toEqual(["Primeiro", "Segundo"]);
  });
  it("não existe update/delete no service (imutável)", () => {
    expect((service as Record<string, unknown>).updateTicketComment).toBeUndefined();
    expect((service as Record<string, unknown>).deleteTicketComment).toBeUndefined();
  });
});

describe("Suporte consultas e paginação", () => {
  it("filtros, busca literal, counts e isolamento", async () => {
    const [project] = await database.db.insert(projects).values({ orgId: ORG_A, clientId: seed.clientA.id, name: "P", createdBy: seed.ownerA.id }).returning();
    const first = await create({ title: "Erro 100%_", priority: "critical", status: "in_progress", assignedUserId: seed.ownerA.id, projectId: project!.id, dueAt: "2000-01-01T00:00:00Z" });
    await create({ title: "Outro chamado" });
    expect((await service.listTickets({ q: String(first.ticketNumber) })).total).toBe(1);
    expect((await service.listTickets({ q: `#${first.ticketNumber}` })).total).toBe(1);
    await database.db.insert(supportTickets).values({ orgId: ORG_B, clientId: seed.clientB.id, createdBy: seed.ownerB.id, title: "Segredo", description: "x" });
    expect((await service.listTickets({ q: "%_" })).total).toBe(1);
    expect((await service.listTickets({ q: "Cliente A" })).total).toBe(2);
    expect((await service.listTickets({ status: "in_progress", priority: "critical", overdue: "true", assignedUserId: seed.ownerA.id })).total).toBe(1);
    expect((await service.listTickets({ assignedUserId: "unassigned" })).total).toBe(1);
    expect((await service.listTickets({ projectId: project!.id })).total).toBe(1);
    expect(await service.getTicketCounts(seed.clientA.id)).toEqual({ total: 2, open: 2, inProgress: 1, critical: 1, overdue: 1 });
    await expect(service.getTicketCounts(seed.clientB.id)).rejects.toMatchObject({ code: "invalid_client" });
    expect((await service.listAvailableTicketAssignees()).map(o => o.userId)).not.toContain(seed.ownerB.id);
  });
  it("25 linhas por página, clamp e desempate estável", async () => {
    await database.db.insert(supportTickets).values(Array.from({ length: 28 }, () => ({ orgId: ORG_A, clientId: seed.clientA.id, createdBy: seed.ownerA.id, title: "Igual", description: "x" })));
    const first = await service.listTickets({ sort: "ticketNumber" }), second = await service.listTickets({ sort: "ticketNumber", page: 999 });
    expect(first.rows).toHaveLength(25); expect(second.rows).toHaveLength(3); expect(second.page).toBe(2);
    expect(new Set([...first.rows, ...second.rows].map(t => t.id)).size).toBe(28);
    expect((await service.listTickets({ sort: "due" })).rows).toHaveLength(25);
    expect((await service.listTickets({ sort: "priority" })).rows).toHaveLength(25);
  });
  it("seletor de Cliente paginado, e seletor de Projeto restrito ao Cliente escolhido", async () => {
    await database.db.insert(clients).values(Array.from({ length: 26 }, (_, i) => ({ orgId: ORG_A, createdBy: seed.ownerA.id, name: `Empresa ${i}` })));
    expect((await service.listTicketClients()).rows).toHaveLength(25);
    const [clientA2] = await database.db.insert(clients).values({ orgId: ORG_A, name: "Cliente A2", createdBy: seed.ownerA.id }).returning();
    await database.db.insert(projects).values([
      { orgId: ORG_A, clientId: seed.clientA.id, name: "Do Cliente A", createdBy: seed.ownerA.id },
      { orgId: ORG_A, clientId: clientA2!.id, name: "Do Cliente A2", createdBy: seed.ownerA.id },
    ]);
    const forClientA = await service.listTicketProjects({ clientId: seed.clientA.id });
    expect(forClientA.rows.map(r => r.name)).toEqual(["Do Cliente A"]);
    await expect(service.listTicketProjects({ clientId: seed.clientB.id })).rejects.toMatchObject({ code: "invalid_client" });
  });
  it("timeline em janelas de 20, sem cumulatividade ou payload como autoridade", async () => {
    const t = await create();
    await database.db.insert(activityEvents).values(Array.from({ length: 24 }, () => ({ orgId: ORG_A, entityType: "ticket", entityId: t.id, kind: "ticket.updated", summary: "Teste" })));
    await database.db.insert(activityEvents).values({ orgId: ORG_B, entityType: "ticket", entityId: t.id, kind: "legacy", summary: "Outro", payload: { clientId: seed.clientA.id } });
    const a = await service.listTicketTimeline(t.id), b = await service.listTicketTimeline(t.id, 2);
    expect(a.rows).toHaveLength(20); expect(b.rows).toHaveLength(5); expect(a.total).toBe(25);
    expect(new Set([...a.rows, ...b.rows].map(e => e.id)).size).toBe(25);
  });
});

describe("Suporte agregadores de UI", () => {
  it("getTicketsPageData combina listagem, KPIs e responsáveis numa só chamada", async () => {
    await create({ title: "Aberto" });
    await create({ title: "Em atendimento", status: "in_progress" });
    const data = await service.getTicketsPageData({ sort: "ticketNumber" });
    expect(data.rows.map(r => r.title)).toEqual(["Aberto", "Em atendimento"]);
    expect(data.kpis).toEqual({ total: 2, open: 2, inProgress: 1, critical: 0, overdue: 0 });
    expect(data.assignees.map(o => o.userId)).toContain(seed.ownerA.id);
  });
  it("getTicketsPageData nega sem ticket:read+client:read", async () => {
    login(await projectMember(database, { grants: [] }));
    await expect(service.getTicketsPageData()).rejects.toMatchObject({ code: "forbidden" });
  });
  it("getTicketWorkspace combina chamado, timeline e comentários; 404 em cross-org e inexistente", async () => {
    const t = await create({ title: "Chamado X" });
    await service.createTicketComment({ ticketId: t.id, content: "Nota" });
    const workspace = await service.getTicketWorkspace(t.id);
    expect(workspace.ticket.title).toBe("Chamado X");
    expect(workspace.timeline.rows.length).toBeGreaterThan(0);
    expect(workspace.comments).toHaveLength(1);
    await expect(service.getTicketWorkspace("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "not_found" });
    const [crossOrg] = await database.db.insert(supportTickets).values({ orgId: ORG_B, clientId: seed.clientB.id, createdBy: seed.ownerB.id, title: "De outra org", description: "x" }).returning();
    await expect(service.getTicketWorkspace(crossOrg!.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
