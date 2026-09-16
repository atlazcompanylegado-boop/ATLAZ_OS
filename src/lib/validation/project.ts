import { z } from "zod";
import { normalizeProjectNumber, normalizeProjectOptional, normalizeProjectProgress, normalizeProjectText, normalizeProjectUuid } from "./project-normalize";

export const PROJECT_STATUSES = ["planning", "active", "paused", "review", "completed", "cancelled"] as const;
export const PROJECT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planejamento", active: "Em andamento", paused: "Pausado", review: "Em revisão", completed: "Concluído", cancelled: "Cancelado",
};
export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };
export const PROJECT_NON_FINAL_STATUSES = ["planning", "active", "paused", "review"] as const;
export function isFinalProjectStatus(status: ProjectStatus): boolean { return status === "completed" || status === "cancelled"; }
export const PROJECT_PAGE_SIZE = 25;
export const PROJECT_TIMELINE_PAGE_SIZE = 20;
export const PROJECT_SORTS = ["created", "updated", "name", "due"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];
export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  created: "Mais recentes", updated: "Última atualização", name: "Nome A–Z", due: "Prazo",
};
export const projectIdSchema = z.preprocess(normalizeProjectUuid, z.string().uuid("Identificador inválido."));
export const projectVersionSchema = z.preprocess(normalizeProjectNumber, z.number().int().min(1).max(2147483647));
export const projectPaginationSchema = z.object({
  page: z.preprocess(normalizeProjectNumber, z.number().int().min(1).max(2147483647)).catch(1),
});

/** Calendar arithmetic, without Date parsing/timezone rollover. */
export function isProjectCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
const optionalDate = z.preprocess(normalizeProjectOptional, z.string().refine(isProjectCalendarDate, "Data inválida.").nullable());
const optionalUuid = z.preprocess(v => normalizeProjectUuid(normalizeProjectOptional(v)), z.string().uuid().nullable());
const fields = {
  name: z.preprocess(normalizeProjectText, z.string().min(1, "Informe o nome.").max(160)),
  description: z.preprocess(normalizeProjectOptional, z.string().max(10000).nullable()),
  status: z.preprocess(normalizeProjectText, z.enum(PROJECT_STATUSES)),
  priority: z.preprocess(normalizeProjectText, z.enum(PROJECT_PRIORITIES)),
  ownerUserId: optionalUuid,
  startDate: optionalDate,
  dueDate: optionalDate,
  progress: z.preprocess(normalizeProjectProgress, z.number().int().min(0).max(100).nullable()),
};
function orderedDates(data: { startDate: string | null; dueDate: string | null }) {
  return !data.startDate || !data.dueDate || data.dueDate >= data.startDate;
}
export const projectCreateSchema = z.object({
  ...fields, clientId: projectIdSchema,
  status: fields.status.default("planning"), priority: fields.priority.default("normal"),
}).refine(orderedDates, { path: ["dueDate"], message: "Prazo deve ser igual ou posterior ao início." });
// clientId cannot be resubmitted as an editable field. Authority fields are stripped.
export const projectUpdateSchema = z.object({ ...fields, clientId: z.never().optional() })
  .refine(orderedDates, { path: ["dueDate"], message: "Prazo deve ser igual ou posterior ao início." });
export const projectStatusActionSchema = z.object({
  projectId: projectIdSchema, version: projectVersionSchema, status: fields.status,
});
export const projectReopenSchema = z.object({ projectId: projectIdSchema, version: projectVersionSchema });
const optionalFilterId = z.preprocess(v => normalizeProjectOptional(v), projectIdSchema.nullable());
export const projectFiltersSchema = z.object({
  q: z.preprocess(v => v === undefined ? "" : normalizeProjectText(v), z.string().max(200)),
  clientId: optionalFilterId,
  status: z.preprocess(normalizeProjectOptional, z.enum(PROJECT_STATUSES).nullable()),
  priority: z.preprocess(normalizeProjectOptional, z.enum(PROJECT_PRIORITIES).nullable()),
  ownerUserId: z.preprocess(normalizeProjectOptional, z.union([projectIdSchema, z.literal("unassigned")]).nullable()),
  overdue: z.preprocess(v => v === "true" ? true : v === "false" || v === undefined || v === "" ? false : v, z.boolean()),
  sort: z.enum(PROJECT_SORTS).default("created"),
  page: projectPaginationSchema.shape.page,
});
export const projectClientSelectorSchema = z.object({ q: projectFiltersSchema.shape.q, page: projectPaginationSchema.shape.page });
export type ProjectCreate = z.output<typeof projectCreateSchema>;
export type ProjectUpdate = z.output<typeof projectUpdateSchema>;
export type ProjectFilters = z.output<typeof projectFiltersSchema>;
