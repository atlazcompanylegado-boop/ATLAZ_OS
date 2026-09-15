/**
 * Validação + normalização de formulários de Clientes/Contatos/filtros. Usa Zod
 * (mesmo padrão de `src/app/login/actions.ts`) para o formato de cada campo e as
 * funções puras de `normalize.ts`/`document.ts` para o conteúdo final persistido.
 * Nenhuma regra de organização/permissão mora aqui — isso é responsabilidade da
 * service layer (`src/server/services/client-service.ts`).
 */
import { z } from "zod";
import { normalizeEmail, normalizePhone, normalizeWebsite, parsePositiveInt, trimToNull } from "./normalize";
import { validateDocument, type PersonType } from "./document";

export const CLIENT_STATUSES = ["lead", "onboarding", "active", "paused", "closed"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "Lead",
  onboarding: "Onboarding",
  active: "Ativo",
  paused: "Pausado",
  closed: "Encerrado",
};

export const PERSON_TYPES = ["individual", "company"] as const satisfies readonly PersonType[];
export type { PersonType };

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  individual: "Pessoa física",
  company: "Pessoa jurídica",
};

export const CLIENT_SORTS = ["recent", "name", "updated"] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

export const CLIENT_SORT_LABELS: Record<ClientSort, string> = {
  recent: "Mais recentes",
  name: "Nome A–Z",
  updated: "Última atualização",
};

export const CLIENT_PAGE_SIZE = 25;
export const CLIENT_TIMELINE_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// helpers de schema
// ---------------------------------------------------------------------------

// `FormData.get()` devolve `null` (não `""`) quando o campo nem existe no formulário
// — ex.: o cadastro inline de contato em /clientes/novo não tem campo "Observações",
// mas `extractContactInput` sempre lê `contactNotes`. `null`/`undefined`/string vazia
// precisam ser tratados da mesma forma: campo opcional ausente, nunca um valor inválido.
const emptyToUndefined = (value: unknown) =>
  value == null || (typeof value === "string" && value.trim() === "") ? undefined : value;

// `.optional()` precisa envolver o schema INTERNO (não o preprocess): se ficasse por
// fora, um valor definido (ex.: "") ainda entraria no preprocess, viraria `undefined`,
// e cairia num `z.string()` que não aceita `undefined` — sempre "Required".
function optionalTrimmed(max: number, message: string) {
  return z.preprocess(emptyToUndefined, z.string().trim().max(max, message).optional());
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export interface NormalizedClientInput {
  name: string;
  tradeName: string | null;
  legalName: string | null;
  personType: PersonType | null;
  document: string | null;
  status: ClientStatus;
  source: string | null;
  ownerUserId: string | null;
  website: string | null;
  notes: string | null;
}

export type ClientFieldErrors = Partial<Record<
  "name" | "tradeName" | "legalName" | "personType" | "document" | "status" | "source" | "ownerUserId" | "website" | "notes",
  string
>>;

const clientBaseSchema = z.object({
  name: z.preprocess(emptyToUndefined, z.string({ required_error: "Informe o nome do cliente." })
    .trim()
    .min(1, "Informe o nome do cliente.")
    .max(160, "O nome pode ter no máximo 160 caracteres.")),
  tradeName: optionalTrimmed(160, "O nome fantasia pode ter no máximo 160 caracteres."),
  legalName: optionalTrimmed(200, "A razão social pode ter no máximo 200 caracteres."),
  personType: z.preprocess(emptyToUndefined, z.enum(PERSON_TYPES).optional()),
  document: optionalTrimmed(32, "Documento inválido."),
  status: z.preprocess((v) => emptyToUndefined(v) ?? "lead", z.enum(CLIENT_STATUSES)),
  source: optionalTrimmed(120, "A origem pode ter no máximo 120 caracteres."),
  ownerUserId: z.preprocess(emptyToUndefined, z.string().uuid("Responsável inválido.").optional()),
  website: optionalTrimmed(2048, "Informe uma URL válida (ex.: https://empresa.com)."),
  notes: optionalTrimmed(10000, "As observações podem ter no máximo 10.000 caracteres."),
});

export const clientInputSchema = clientBaseSchema.superRefine((data, ctx) => {
  if (data.document) {
    if (!data.personType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["document"],
        message: "Selecione o tipo de pessoa antes de informar o documento.",
      });
    } else {
      const result = validateDocument(data.personType, data.document);
      if (!result.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["document"],
          message: data.personType === "individual" ? "CPF inválido." : "CNPJ inválido.",
        });
      }
    }
  }
  if (data.website) {
    const normalized = normalizeWebsite(data.website)!;
    if (normalized.length > 2048 || !/^https?:\/\/\S+$/i.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["website"],
        message: "Informe uma URL válida (ex.: https://empresa.com).",
      });
    }
  }
});

export type ClientParseResult =
  | { ok: true; data: NormalizedClientInput }
  | { ok: false; fieldErrors: ClientFieldErrors; formError?: string };

export function parseClientInput(raw: Record<string, unknown>): ClientParseResult {
  const parsed = clientInputSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors: ClientFieldErrors = {};
    for (const [key, messages] of Object.entries(flat.fieldErrors)) {
      if (messages?.[0]) fieldErrors[key as keyof ClientFieldErrors] = messages[0];
    }
    return { ok: false, fieldErrors, formError: flat.formErrors[0] };
  }

  const data = parsed.data;
  const document = data.document && data.personType ? validateDocument(data.personType, data.document) : null;

  return {
    ok: true,
    data: {
      name: data.name,
      tradeName: data.tradeName ?? null,
      legalName: data.legalName ?? null,
      personType: data.personType ?? null,
      document: document?.ok ? document.normalized : null,
      status: data.status,
      source: data.source ?? null,
      ownerUserId: data.ownerUserId ?? null,
      website: data.website ? normalizeWebsite(data.website) : null,
      notes: data.notes ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Contato
// ---------------------------------------------------------------------------

export interface NormalizedClientContactInput {
  name: string;
  jobTitle: string | null;
  type: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export type ClientContactFieldErrors = Partial<Record<
  "name" | "jobTitle" | "type" | "email" | "phone" | "whatsapp" | "notes",
  string
>>;

const truthy = new Set(["true", "on", "1", "yes"]);

const contactBaseSchema = z.object({
  name: z.preprocess(emptyToUndefined, z.string({ required_error: "Informe o nome do contato." })
    .trim()
    .min(1, "Informe o nome do contato.")
    .max(160, "O nome pode ter no máximo 160 caracteres.")),
  jobTitle: optionalTrimmed(120, "O cargo pode ter no máximo 120 caracteres."),
  type: optionalTrimmed(60, "O tipo pode ter no máximo 60 caracteres."),
  email: optionalTrimmed(254, "E-mail inválido."),
  phone: optionalTrimmed(30, "Telefone inválido."),
  whatsapp: optionalTrimmed(30, "WhatsApp inválido."),
  isPrimary: z.preprocess((v) => (typeof v === "boolean" ? v : truthy.has(String(v ?? "").toLowerCase())), z.boolean()),
  notes: optionalTrimmed(5000, "As observações podem ter no máximo 5.000 caracteres."),
});

export const clientContactInputSchema = contactBaseSchema.superRefine((data, ctx) => {
  if (data.email) {
    const normalized = normalizeEmail(data.email)!;
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "E-mail inválido." });
    }
  }
  if (data.phone) {
    const digits = normalizePhone(data.phone)!;
    if (digits.length < 8 || digits.length > 15) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Telefone deve ter entre 8 e 15 dígitos." });
    }
  }
  if (data.whatsapp) {
    const digits = normalizePhone(data.whatsapp)!;
    if (digits.length < 8 || digits.length > 15) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["whatsapp"], message: "WhatsApp deve ter entre 8 e 15 dígitos." });
    }
  }
});

export type ClientContactParseResult =
  | { ok: true; data: NormalizedClientContactInput }
  | { ok: false; fieldErrors: ClientContactFieldErrors; formError?: string };

export function parseClientContactInput(raw: Record<string, unknown>): ClientContactParseResult {
  const parsed = clientContactInputSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors: ClientContactFieldErrors = {};
    for (const [key, messages] of Object.entries(flat.fieldErrors)) {
      if (messages?.[0]) fieldErrors[key as keyof ClientContactFieldErrors] = messages[0];
    }
    return { ok: false, fieldErrors, formError: flat.formErrors[0] };
  }
  const data = parsed.data;
  return {
    ok: true,
    data: {
      name: data.name,
      jobTitle: data.jobTitle ?? null,
      type: data.type ?? null,
      email: data.email ? normalizeEmail(data.email) : null,
      phone: data.phone ? normalizePhone(data.phone) : null,
      whatsapp: data.whatsapp ? normalizePhone(data.whatsapp) : null,
      isPrimary: data.isPrimary,
      notes: data.notes ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Filtros de listagem
// ---------------------------------------------------------------------------

export interface ClientFilters {
  q: string | null;
  status: ClientStatus | null;
  ownerUserId: string | null;
  sort: ClientSort;
  page: number;
}

export function parseClientFilters(raw: {
  q?: unknown;
  status?: unknown;
  responsavel?: unknown;
  sort?: unknown;
  page?: unknown;
}): ClientFilters {
  const q = trimToNull(raw.q);

  const statusRaw = typeof raw.status === "string" ? raw.status : "";
  const status = (CLIENT_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as ClientStatus) : null;

  const ownerRaw = trimToNull(raw.responsavel);
  const ownerUserId = ownerRaw && /^[0-9a-f-]{36}$/i.test(ownerRaw) ? ownerRaw : null;

  const sortRaw = typeof raw.sort === "string" ? raw.sort : "";
  const sort = (CLIENT_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as ClientSort) : "recent";

  const page = parsePositiveInt(raw.page, 1);

  return { q, status, ownerUserId, sort, page };
}

export function parseVersion(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null;
}
