import type { ProjectStatus } from "@/lib/validation/project";

/** `dueDate`/`startDate` são DATE puro (YYYY-MM-DD) — nunca passam por `Date`/timezone. */
export function formatProjectDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** Mesma regra objetiva já usada no repository (dia civil em America/Sao_Paulo, estados não finais). */
export function isProjectOverdue(dueDate: string | null, status: ProjectStatus): boolean {
  if (!dueDate || status === "completed" || status === "cancelled") return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return dueDate < today;
}
