import { describe, expect, it } from "vitest";
import { projectCreateSchema, projectUpdateSchema, projectFiltersSchema, projectVersionSchema,
  projectPaginationSchema, PROJECT_STATUSES, PROJECT_PRIORITIES, isProjectCalendarDate, projectStatusActionSchema, projectReopenSchema } from "@/lib/validation/project";
import { escapeProjectSearch } from "@/lib/validation/project-normalize";
import { translateProjectEventKind } from "@/lib/projects/activity";
const input = { clientId: "10000000-0000-4000-8000-000000000001", name: " Site " };
describe("Projetos — validação e normalização", () => {
  it("trim, defaults e campos opcionais nulos", () => {
    expect(projectCreateSchema.parse({ ...input, description: "  " })).toMatchObject({ name: "Site", description: null, progress: null, status: "planning", priority: "normal", startDate: null, dueDate: null });
  });
  it.each(["", "  ", "x".repeat(161)])("rejeita nome inválido %j", name => expect(projectCreateSchema.safeParse({ ...input, name }).success).toBe(false));
  it("limite de descrição", () => expect(projectCreateSchema.safeParse({ ...input, description: "x".repeat(10001) }).success).toBe(false));
  it.each(PROJECT_STATUSES)("aceita status %s", status => expect(projectCreateSchema.safeParse({ ...input, status }).success).toBe(true));
  it.each(PROJECT_PRIORITIES)("aceita prioridade %s", priority => expect(projectCreateSchema.safeParse({ ...input, priority }).success).toBe(true));
  it.each([{ status: "unknown" }, { priority: "critical" }, { clientId: "invalid" }, { ownerUserId: "invalid" }])("rejeita campos inválidos %j", invalid => expect(projectCreateSchema.safeParse({ ...input, ...invalid }).success).toBe(false));
  it.each([null, 0, 100, "0", "100"])("preserva progresso %j", progress => {
    expect(projectCreateSchema.parse({ ...input, progress }).progress).toBe(progress === null ? null : Number(progress));
  });
  it.each([-1, 101, 0.5, "0.5", "100x", true, "1e2"])("rejeita progresso %j", progress => expect(projectCreateSchema.safeParse({ ...input, progress }).success).toBe(false));
  it.each(["2026-02-30", "2026-02-29", "1900-02-29", "2026-13-01", "2026-00-01", "0000-01-01", "2026-01-00", "2026-1-1", "2026-01-01T00:00:00Z"])("rejeita calendário %s", date => {
    expect(isProjectCalendarDate(date)).toBe(false);
    expect(projectCreateSchema.safeParse({ ...input, startDate: date }).success).toBe(false);
  });
  it.each(["2024-02-29", "2000-02-29", "2026-12-31"])("preserva DATE %s", date => expect(projectCreateSchema.parse({ ...input, startDate: date }).startDate).toBe(date));
  it("nega prazo anterior ao início", () => expect(projectCreateSchema.safeParse({ ...input, startDate: "2026-03-01", dueDate: "2026-02-28" }).success).toBe(false));
  it.each([undefined, null, 0, -1, 1.5, "1x", "", true, 2147483648])("rejeita version %j", version => expect(projectVersionSchema.safeParse(version).success).toBe(false));
  it("valida ações explícitas", () => {
    expect(projectStatusActionSchema.parse({ projectId: input.clientId, version: "1", status: "completed" }).version).toBe(1);
    expect(projectReopenSchema.safeParse({ projectId: "bad", version: 1 }).success).toBe(false);
  });
  it("não permite editar cliente e descarta campos de autoridade", () => {
    expect(projectCreateSchema.parse({ ...input, orgId: "injected", createdBy: "injected", completedAt: "injected" })).not.toHaveProperty("orgId");
    expect(projectUpdateSchema.safeParse({ ...input, status: "active", priority: "normal" }).success).toBe(false);
  });
  it("filtros e paginação seguros", () => {
    expect(projectFiltersSchema.parse({})).toMatchObject({ q: "", page: 1, clientId: null, overdue: false, sort: "created" });
    expect(projectFiltersSchema.safeParse({ clientId: "bad" }).success).toBe(false);
    expect(projectFiltersSchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
    expect(projectFiltersSchema.safeParse({ sort: "sql" }).success).toBe(false);
    expect(projectPaginationSchema.parse({ page: "1x" }).page).toBe(1);
    expect(projectPaginationSchema.parse({ page: "2" }).page).toBe(2);
  });
  it("busca escapa curingas e rótulos nunca exibem kind desconhecido", () => {
    expect(escapeProjectSearch("a%_\\b")).toBe("a\\%\\_\\\\b");
    expect(translateProjectEventKind("project.created")).toBe("Projeto criado");
    expect(translateProjectEventKind("internal.unknown")).toBe("Atividade do projeto");
  });
});
