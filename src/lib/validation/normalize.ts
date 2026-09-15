/**
 * Normalização pura (sem regra de validação) reutilizada pelos schemas de Clientes
 * (`src/lib/validation/client.ts`) e por qualquer código que precise dos mesmos
 * formatos antes de tocar o banco. Nenhuma função aqui decide se um valor é válido —
 * só o formato em que ele deve ser persistido/comparado (ver docs §6 do checkpoint).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** string vazia/whitespace/não-string → null; senão, trim. */
export function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Remove tudo que não for dígito. */
export function normalizeDigits(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D+/g, "");
}

/** Remove tudo que não for alfanumérico e converte para maiúsculas (CNPJ alfanumérico). */
export function normalizeAlphanumericUpper(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
}

export function normalizeEmail(value: unknown): string | null {
  const trimmed = trimToNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

/** Telefone/WhatsApp: só dígitos, sem DDI/máscara — banco aceita 8–15 dígitos. */
export function normalizePhone(value: unknown): string | null {
  const digits = normalizeDigits(value);
  return digits === "" ? null : digits;
}

/**
 * Aceita apenas http(s) explícito ou um domínio "amigável" (ex.: atlazcompany.com),
 * ao qual prefixamos https:// de forma previsível. Nunca reescreve um valor que já
 * declara um esquema (preserva http:// explícito em vez de forçar https).
 */
export function normalizeWebsite(value: unknown): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Página ≥ 1; qualquer entrada inválida cai no fallback (nunca NaN/negativo). */
export function parsePositiveInt(value: unknown, fallback: number): number {
  const n =
    typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : fallback;
}
