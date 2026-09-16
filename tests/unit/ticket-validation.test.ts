import { describe, expect, it } from "vitest";
import { ticketCreateSchema, ticketUpdateSchema, ticketFiltersSchema, ticketVersionSchema,
  ticketPaginationSchema, TICKET_STATUSES, TICKET_PRIORITIES, ticketStatusActionSchema, ticketReopenSchema,
  ticketCommentCreateSchema } from "@/lib/validation/ticket";
import { escapeTicketSearch } from "@/lib/validation/ticket-normalize";
import { translateTicketEventKind } from "@/lib/support/activity";

const input = { clientId: "10000000-0000-4000-8000-000000000001", title: " Não consigo acessar ", description: " Descrição inicial " };

describe("Suporte — validação e normalização", () => {
  it("trim, defaults e campos opcionais nulos", () => {
    expect(ticketCreateSchema.parse(input)).toMatchObject({ title: "Não consigo acessar", description: "Descrição inicial",
      status: "open", priority: "normal", projectId: null, assignedUserId: null, dueAt: null });
  });
  it.each(["", "  ", "x".repeat(161)])("rejeita título inválido %j", title => expect(ticketCreateSchema.safeParse({ ...input, title }).success).toBe(false));
  it.each(["", "  "])("rejeita descrição vazia %j (obrigatória)", description => expect(ticketCreateSchema.safeParse({ ...input, description }).success).toBe(false));
  it("limite de descrição", () => expect(ticketCreateSchema.safeParse({ ...input, description: "x".repeat(10001) }).success).toBe(false));
  it("descrição ausente é rejeitada (obrigatória na V1)", () => {
    const withoutDescription: Record<string, unknown> = { ...input };
    delete withoutDescription.description;
    expect(ticketCreateSchema.safeParse(withoutDescription).success).toBe(false);
  });
  it.each(TICKET_STATUSES)("aceita status %s", status => expect(ticketCreateSchema.safeParse({ ...input, status }).success).toBe(true));
  it.each(TICKET_PRIORITIES)("aceita prioridade %s", priority => expect(ticketCreateSchema.safeParse({ ...input, priority }).success).toBe(true));
  it.each([{ status: "closed" }, { priority: "urgent" }, { clientId: "invalid" }, { projectId: "invalid" }, { assignedUserId: "invalid" }])(
    "rejeita campos inválidos %j", invalid => expect(ticketCreateSchema.safeParse({ ...input, ...invalid }).success).toBe(false));
  it("due_at aceita ISO-8601 e vira Date; nulo permanece nulo", () => {
    const parsed = ticketCreateSchema.parse({ ...input, dueAt: "2026-09-20T14:00:00Z" });
    expect(parsed.dueAt).toBeInstanceOf(Date);
    expect(parsed.dueAt?.toISOString()).toBe("2026-09-20T14:00:00.000Z");
    expect(ticketCreateSchema.parse({ ...input, dueAt: null }).dueAt).toBeNull();
  });
  it.each(["não é uma data", "2026-13-40"])("rejeita due_at inválido %j", dueAt => expect(ticketCreateSchema.safeParse({ ...input, dueAt }).success).toBe(false));
  it("due_at vazio é tratado como ausente (null), não como erro", () => expect(ticketCreateSchema.parse({ ...input, dueAt: "" }).dueAt).toBeNull());
  it.each([undefined, null, 0, -1, 1.5, "1x", "", true, 2147483648])("rejeita version %j", version => expect(ticketVersionSchema.safeParse(version).success).toBe(false));
  it("valida ações de mudança de status — aceita qualquer status real (resolve/cancel/transições rápidas), rejeita inválido", () => {
    expect(ticketStatusActionSchema.parse({ ticketId: input.clientId, version: "1", status: "resolved" }).version).toBe(1);
    expect(ticketStatusActionSchema.safeParse({ ticketId: input.clientId, version: 1, status: "in_progress" }).success).toBe(true);
    expect(ticketStatusActionSchema.safeParse({ ticketId: input.clientId, version: 1, status: "closed" }).success).toBe(false);
    expect(ticketReopenSchema.safeParse({ ticketId: "bad", version: 1 }).success).toBe(false);
  });
  it("não permite editar cliente e descarta campos de autoridade", () => {
    expect(ticketCreateSchema.parse({ ...input, orgId: "injected", createdBy: "injected", ticketNumber: 999 })).not.toHaveProperty("orgId");
    expect(ticketUpdateSchema.safeParse({ ...input, status: "open", priority: "normal" }).success).toBe(false); // clientId presente -> z.never()
  });
  it("projectId pode ser trocado/removido na edição (não é z.never)", () => {
    const editable: Record<string, unknown> = { ...input };
    delete editable.clientId;
    expect(ticketUpdateSchema.safeParse({ ...editable, status: "open", priority: "normal", projectId: null }).success).toBe(true);
    expect(ticketUpdateSchema.safeParse({ ...editable, status: "open", priority: "normal", projectId: "10000000-0000-4000-8000-000000000002" }).success).toBe(true);
  });
  it("filtros e paginação seguros", () => {
    expect(ticketFiltersSchema.parse({})).toMatchObject({ q: "", page: 1, clientId: null, projectId: null, overdue: false, sort: "created" });
    expect(ticketFiltersSchema.safeParse({ clientId: "bad" }).success).toBe(false);
    expect(ticketFiltersSchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
    expect(ticketFiltersSchema.safeParse({ sort: "title" }).success).toBe(false);
    expect(ticketFiltersSchema.safeParse({ sort: "priority" }).success).toBe(true);
    expect(ticketFiltersSchema.parse({ assignedUserId: "unassigned" }).assignedUserId).toBe("unassigned");
    expect(ticketPaginationSchema.parse({ page: "1x" }).page).toBe(1);
    expect(ticketPaginationSchema.parse({ page: "2" }).page).toBe(2);
    expect(ticketPaginationSchema.parse({ page: "0" }).page).toBe(1);
    expect(ticketPaginationSchema.parse({ page: "-5" }).page).toBe(1);
  });
  it("comentário: obrigatório, trim, limite de 10.000", () => {
    expect(ticketCommentCreateSchema.parse({ ticketId: input.clientId, content: "  Olá  " }).content).toBe("Olá");
    expect(ticketCommentCreateSchema.safeParse({ ticketId: input.clientId, content: "" }).success).toBe(false);
    expect(ticketCommentCreateSchema.safeParse({ ticketId: input.clientId, content: "x".repeat(10001) }).success).toBe(false);
  });
  it("busca escapa curingas e rótulos nunca exibem kind desconhecido", () => {
    expect(escapeTicketSearch("a%_\\b")).toBe("a\\%\\_\\\\b");
    expect(translateTicketEventKind("ticket.created")).toBe("Chamado criado");
    expect(translateTicketEventKind("ticket.comment_added")).toBe("Comentário adicionado");
    expect(translateTicketEventKind("internal.unknown")).toBe("Atividade do chamado");
  });
});
