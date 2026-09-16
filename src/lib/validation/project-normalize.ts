import { trimToNull } from "./normalize";

/** Pure representation changes; validation is deliberately separate. */
export function normalizeProjectText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}
export function normalizeProjectOptional(value: unknown): unknown {
  return value === undefined || value === null ? null : typeof value === "string" ? trimToNull(value) : value;
}
export function normalizeProjectNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  return /^\d+$/.test(text) ? Number(text) : value;
}
export function normalizeProjectProgress(value: unknown): unknown {
  const optional = normalizeProjectOptional(value);
  return optional === null ? null : normalizeProjectNumber(optional);
}
export function normalizeProjectUuid(value: unknown): unknown {
  const text = normalizeProjectText(value);
  return typeof text === "string" ? text.toLowerCase() : text;
}

export function escapeProjectSearch(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}
