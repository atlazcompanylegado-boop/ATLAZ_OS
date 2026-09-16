import { trimToNull } from "./normalize";

/** Pure representation changes; validation is deliberately separate (mesmo padrão de project-normalize.ts). */
export function normalizeTicketText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}
export function normalizeTicketOptional(value: unknown): unknown {
  return value === undefined || value === null ? null : typeof value === "string" ? trimToNull(value) : value;
}
export function normalizeTicketNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  return /^\d+$/.test(text) ? Number(text) : value;
}
export function normalizeTicketUuid(value: unknown): unknown {
  const text = normalizeTicketText(value);
  return typeof text === "string" ? text.toLowerCase() : text;
}

export function escapeTicketSearch(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}
