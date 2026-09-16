import type { TicketStatus } from "@/lib/validation/ticket";

/** `#1042` — nunca o UUID interno. */
export function formatTicketNumber(ticketNumber: number): string {
  return `#${ticketNumber}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
/** `due_at`/`resolved_at` são TIMESTAMPTZ — sempre apresentados na timezone de negócio (America/Sao_Paulo), nunca a do navegador. */
export function formatTicketDateTime(value: Date | string | null): string {
  if (!value) return "—";
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

/** Mesma regra objetiva do repository: `due_at < now()` e status não-terminal (America/Sao_Paulo). */
export function isTicketOverdue(dueAt: Date | string | null, status: TicketStatus): boolean {
  if (!dueAt || status === "resolved" || status === "cancelled") return false;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return due.getTime() < Date.now();
}

/** `<input type="datetime-local">` não aceita `Z`/offset — precisa de "YYYY-MM-DDTHH:mm" na timezone de negócio. */
export function toDateTimeLocalValue(value: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Interpreta o valor de `datetime-local` (sem timezone) como horário de America/Sao_Paulo e devolve ISO-8601 UTC. */
export function fromDateTimeLocalValue(value: string): string {
  // America/Sao_Paulo é UTC-3 o ano inteiro (sem horário de verão desde 2019) — offset fixo e seguro de aplicar.
  return `${value}:00.000-03:00`;
}
