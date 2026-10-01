import { z } from "zod";
import { normalizeTicketNumber, normalizeTicketOptional, normalizeTicketText, normalizeTicketUuid } from "./ticket-normalize";
import { normalizeDomainName, normalizeDomainOptionalText } from "./domain-normalize";

export const DOMAIN_STATUSES = ["active", "transferring", "inactive"] as const;
export const DOMAIN_AUTO_RENEW_STATUSES = ["configured", "disabled", "unknown"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];
export type DomainAutoRenewStatus = (typeof DOMAIN_AUTO_RENEW_STATUSES)[number];

export const DOMAIN_STATUS_LABELS: Record<DomainStatus, string> = {
  active: "Ativo", transferring: "Em transferência", inactive: "Inativo",
};
export const DOMAIN_AUTO_RENEW_LABELS: Record<DomainAutoRenewStatus, string> = {
  configured: "Renovação automática configurada", disabled: "Renovação automática desativada", unknown: "Não informado",
};
/** Estados não-finais na V1: `inactive` não é "final" no sentido de Suporte/Projetos — pode ser reativado (ver §22 do Checkpoint A). */
export const DOMAIN_NON_ARCHIVED_STATUSES = ["active", "transferring"] as const;

export const DOMAIN_PAGE_SIZE = 25;
export const DOMAIN_TIMELINE_PAGE_SIZE = 20;
export const DOMAIN_SORTS = ["expiration", "created", "updated", "domainName"] as const;
export type DomainSort = (typeof DOMAIN_SORTS)[number];
export const DOMAIN_SORT_LABELS: Record<DomainSort, string> = {
  expiration: "Vencimento mais próximo", created: "Mais recentes", updated: "Atualizados recentemente", domainName: "Nome do domínio",
};

export const domainIdSchema = z.preprocess(normalizeTicketUuid, z.string().uuid("Identificador inválido."));
export const domainVersionSchema = z.preprocess(normalizeTicketNumber, z.number().int().min(1).max(2147483647));
export const domainPaginationSchema = z.object({
  page: z.preprocess(normalizeTicketNumber, z.number().int().min(1).max(2147483647)).catch(1),
});

const REJECTION_MESSAGES: Record<string, string> = {
  empty: "Informe o domínio.",
  invalid_chars: "Domínio inválido. Informe só o domínio (ex.: empresa.com.br).",
  has_path: "Informe só o domínio, sem caminho (ex.: empresa.com.br).",
  has_query: "Informe só o domínio, sem parâmetros (ex.: empresa.com.br).",
  has_fragment: "Informe só o domínio, sem fragmento (ex.: empresa.com.br).",
  has_port: "Informe só o domínio, sem porta (ex.: empresa.com.br).",
  has_credentials: "Informe só o domínio, sem usuário/senha na URL.",
  has_www: "Informe o domínio sem \"www.\" (ex.: empresa.com.br).",
  invalid_idn: "Domínio inválido — verifique a grafia.",
  too_long: "Domínio muito longo.",
  invalid_label: "Domínio inválido — verifique a grafia.",
  single_label: "Informe um domínio completo (ex.: empresa.com.br), não só um nome.",
};
/**
 * `domain_name`: nunca corrige em silêncio o que pode confundir (Checkpoint A §10/D5) —
 * `normalizeDomainName` decide aceitar/rejeitar, e o motivo vira a mensagem de campo exata.
 * `transform` (não `preprocess`) porque a rejeição precisa de `ctx.addIssue` com a mensagem
 * certa; um valor bruto que "passasse" por engano em min/max nunca deve virar domain_name.
 */
const domainNameSchema = z.preprocess(normalizeTicketText, z.string()).transform((raw, ctx) => {
  const result = normalizeDomainName(raw);
  if (!result.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: REJECTION_MESSAGES[result.reason] ?? "Domínio inválido." });
    return z.NEVER;
  }
  return result.value;
});

const optionalUuid = z.preprocess((v) => normalizeTicketUuid(normalizeTicketOptional(v)), z.string().uuid().nullable());
/** DATE (sem timezone) — aceita "YYYY-MM-DD" e valida que representa uma data real. */
const dateOnly = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "Data inválida.");
const optionalDateOnly = z.preprocess(normalizeTicketOptional, dateOnly.nullable());

const fields = {
  clientId: domainIdSchema,
  projectId: optionalUuid,
  registrar: z.preprocess((v) => normalizeDomainOptionalText(v, 160), z.string().max(160).nullable()),
  registrationDate: optionalDateOnly,
  expirationDate: dateOnly,
  autoRenewStatus: z.preprocess(normalizeTicketText, z.enum(DOMAIN_AUTO_RENEW_STATUSES)).default("unknown"),
  status: z.preprocess(normalizeTicketText, z.enum(DOMAIN_STATUSES)),
  ownerUserId: optionalUuid,
  notes: z.preprocess((v) => normalizeDomainOptionalText(v, 2000), z.string().max(2000).nullable()),
};

export const domainCreateSchema = z.object({
  clientId: fields.clientId,
  domainName: domainNameSchema,
  projectId: fields.projectId,
  registrar: fields.registrar,
  registrationDate: fields.registrationDate,
  expirationDate: fields.expirationDate,
  autoRenewStatus: fields.autoRenewStatus,
  status: fields.status.default("active"),
  ownerUserId: fields.ownerUserId,
  notes: fields.notes,
});
// clientId e domainName nunca são reenviáveis como campo editável — imutáveis após a criação
// (Checkpoint A §7/D7, mesmo padrão de client_id em Clientes/Projetos/Suporte). Todos os demais
// campos têm semântica de PATCH: ausente no payload preserva o valor atual (aplicado no service,
// não aqui — ver mesma lição do hotfix de Suporte, docs/suporte-hotfix-project-masking.md).
export const domainUpdateSchema = z.object({
  projectId: fields.projectId.optional(),
  registrar: fields.registrar.optional(),
  registrationDate: fields.registrationDate.optional(),
  expirationDate: fields.expirationDate.optional(),
  autoRenewStatus: fields.autoRenewStatus.optional(),
  status: fields.status.optional(),
  ownerUserId: fields.ownerUserId.optional(),
  notes: fields.notes.optional(),
  clientId: z.never().optional(),
  domainName: z.never().optional(),
});

const optionalFilterId = z.preprocess((v) => normalizeTicketOptional(v), domainIdSchema.nullable());
export const DOMAIN_EXPIRATION_WINDOWS = ["60", "30", "15", "7"] as const;
export type DomainExpirationWindow = (typeof DOMAIN_EXPIRATION_WINDOWS)[number];
export const domainFiltersSchema = z.object({
  q: z.preprocess((v) => (v === undefined ? "" : normalizeTicketText(v)), z.string().max(200)),
  clientId: optionalFilterId,
  projectId: optionalFilterId,
  status: z.preprocess(normalizeTicketOptional, z.enum(DOMAIN_STATUSES).nullable()),
  autoRenewStatus: z.preprocess(normalizeTicketOptional, z.enum(DOMAIN_AUTO_RENEW_STATUSES).nullable()),
  ownerUserId: z.preprocess(normalizeTicketOptional, z.union([domainIdSchema, z.literal("unassigned")]).nullable()),
  // Janela cumulativa — "vence em até N dias" (Checkpoint A §20/D12): nunca esconde urgência.
  expirationWindow: z.preprocess(normalizeTicketOptional, z.enum(DOMAIN_EXPIRATION_WINDOWS).nullable()),
  expired: z.preprocess((v) => v === "true" ? true : v === "false" || v === undefined || v === "" ? false : v, z.boolean()),
  sort: z.enum(DOMAIN_SORTS).default("expiration"),
  page: domainPaginationSchema.shape.page,
});
export const domainClientSelectorSchema = z.object({ q: domainFiltersSchema.shape.q, page: domainPaginationSchema.shape.page });
export const domainProjectSelectorSchema = z.object({ clientId: domainIdSchema, q: domainFiltersSchema.shape.q, page: domainPaginationSchema.shape.page });

export type DomainCreate = z.output<typeof domainCreateSchema>;
export type DomainUpdate = z.output<typeof domainUpdateSchema>;
export type DomainFilters = z.output<typeof domainFiltersSchema>;
