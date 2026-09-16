import { z } from "zod";
import { normalizeTicketNumber, normalizeTicketOptional, normalizeTicketText, normalizeTicketUuid } from "./ticket-normalize";

export const TICKET_STATUSES = ["open", "triage", "in_progress", "waiting_client", "resolved", "cancelled"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Aberto", triage: "Triagem", in_progress: "Em atendimento", waiting_client: "Aguardando cliente",
  resolved: "Resolvido", cancelled: "Cancelado",
};
export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = { low: "Baixa", normal: "Normal", high: "Alta", critical: "Crítica" };
export const TICKET_NON_FINAL_STATUSES = ["open", "triage", "in_progress", "waiting_client"] as const;
export function isFinalTicketStatus(status: TicketStatus): boolean { return status === "resolved" || status === "cancelled"; }
export const TICKET_PAGE_SIZE = 25;
export const TICKET_TIMELINE_PAGE_SIZE = 20;
export const TICKET_SORTS = ["created", "updated", "ticketNumber", "due", "priority"] as const;
export type TicketSort = (typeof TICKET_SORTS)[number];
export const TICKET_SORT_LABELS: Record<TicketSort, string> = {
  created: "Mais recentes", updated: "Atualizados recentemente", ticketNumber: "Número do chamado", due: "Prazo", priority: "Prioridade",
};

export const ticketIdSchema = z.preprocess(normalizeTicketUuid, z.string().uuid("Identificador inválido."));
export const ticketVersionSchema = z.preprocess(normalizeTicketNumber, z.number().int().min(1).max(2147483647));
export const ticketPaginationSchema = z.object({
  page: z.preprocess(normalizeTicketNumber, z.number().int().min(1).max(2147483647)).catch(1),
});

/** TIMESTAMPTZ — aceita ISO-8601 e valida que representa um instante real (nunca `Invalid Date`). */
const optionalTimestamp = z.preprocess(normalizeTicketOptional, z.string().refine(v => !Number.isNaN(Date.parse(v)), "Data/hora inválida.").nullable())
  .transform(v => (v === null ? null : new Date(v)));
const optionalUuid = z.preprocess(v => normalizeTicketUuid(normalizeTicketOptional(v)), z.string().uuid().nullable());

const fields = {
  title: z.preprocess(normalizeTicketText, z.string().min(1, "Informe o título.").max(160)),
  description: z.preprocess(normalizeTicketText, z.string().min(1, "Informe a descrição.").max(10000)),
  status: z.preprocess(normalizeTicketText, z.enum(TICKET_STATUSES)),
  priority: z.preprocess(normalizeTicketText, z.enum(TICKET_PRIORITIES)),
  projectId: optionalUuid,
  assignedUserId: optionalUuid,
  dueAt: optionalTimestamp,
};

export const ticketCreateSchema = z.object({
  ...fields, clientId: ticketIdSchema,
  status: fields.status.default("open"), priority: fields.priority.default("normal"),
});
// clientId nunca é reenviável como campo editável (imutável após criação, ver Checkpoint A §9).
// status e projectId têm semântica de PATCH: ausente = preservar o valor atual; presente (inclusive
// vazio → null) = alteração explícita. O formulário de edição não envia status, e só envia projectId
// a quem pode gerenciar Projeto — ausência nunca pode virar NULL (docs/suporte-hotfix-project-masking.md).
export const ticketUpdateSchema = z.object({
  ...fields,
  status: fields.status.optional(),
  projectId: fields.projectId.optional(),
  clientId: z.never().optional(),
});
// Aceita qualquer status (não só resolved/cancelled): a ficha oferece ações rápidas de
// transição entre estados não-finais (iniciar atendimento, enviar para triagem, aguardar
// cliente, retomar) além de resolver/cancelar — todas passam por este único caminho de
// "mudança só de status" em vez de reenviar o formulário inteiro (Checkpoint C2 §29). A
// proteção contra sair de um estado final sem usar reopenTicket continua no service (mutate()).
export const ticketStatusActionSchema = z.object({
  ticketId: ticketIdSchema, version: ticketVersionSchema, status: fields.status,
});
export const ticketReopenSchema = z.object({ ticketId: ticketIdSchema, version: ticketVersionSchema });
export const ticketCommentCreateSchema = z.object({
  ticketId: ticketIdSchema,
  content: z.preprocess(normalizeTicketText, z.string().min(1, "Escreva um comentário.").max(10000)),
});

const optionalFilterId = z.preprocess(v => normalizeTicketOptional(v), ticketIdSchema.nullable());
export const ticketFiltersSchema = z.object({
  q: z.preprocess(v => (v === undefined ? "" : normalizeTicketText(v)), z.string().max(200)),
  clientId: optionalFilterId,
  projectId: optionalFilterId,
  status: z.preprocess(normalizeTicketOptional, z.enum(TICKET_STATUSES).nullable()),
  priority: z.preprocess(normalizeTicketOptional, z.enum(TICKET_PRIORITIES).nullable()),
  assignedUserId: z.preprocess(normalizeTicketOptional, z.union([ticketIdSchema, z.literal("unassigned")]).nullable()),
  overdue: z.preprocess(v => v === "true" ? true : v === "false" || v === undefined || v === "" ? false : v, z.boolean()),
  sort: z.enum(TICKET_SORTS).default("created"),
  page: ticketPaginationSchema.shape.page,
});
export const ticketClientSelectorSchema = z.object({ q: ticketFiltersSchema.shape.q, page: ticketPaginationSchema.shape.page });
export const ticketProjectSelectorSchema = z.object({ clientId: ticketIdSchema, q: ticketFiltersSchema.shape.q, page: ticketPaginationSchema.shape.page });
export type TicketCreate = z.output<typeof ticketCreateSchema>;
export type TicketUpdate = z.output<typeof ticketUpdateSchema>;
export type TicketFilters = z.output<typeof ticketFiltersSchema>;
