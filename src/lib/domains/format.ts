import type { DomainStatus } from "@/lib/validation/domain";

/** `registration_date`/`expiration_date` são DATE puro (YYYY-MM-DD) — nunca passam por `Date`/timezone (mesmo contrato de `formatProjectDate`). */
export function formatDomainDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** "Hoje" em America/Sao_Paulo, como YYYY-MM-DD — mesma regra já usada em `isProjectOverdue`. */
export function domainTodaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function dateOnlyToUtcMs(dateOnly: string): number {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

/** Dias até o vencimento (negativo = já venceu). Comparação puramente de calendário — nunca sofre deslocamento de fuso, porque as duas datas são interpretadas como meia-noite UTC (o fuso se cancela na subtração). */
export function domainDaysRemaining(expirationDate: string, todaySP = domainTodaySP()): number {
  return Math.round((dateOnlyToUtcMs(expirationDate) - dateOnlyToUtcMs(todaySP)) / 86_400_000);
}

/**
 * Situação de vencimento — sempre derivada, nunca persistida (Checkpoint A §19, Checkpoint B §28).
 * Faixas exclusivas (cada domínio cai em uma só, para o tom visual — Checkpoint A §20/Checkpoint B §30):
 * vencido (<0) / due_7 (0–7) / due_15 (8–15) / due_30 (16–30) / due_60 (31–60) / ok (>60).
 * `inactive` nunca gera urgência — decisão D31 (Checkpoint A §31, aprovada): domínio inativo continua
 * histórico consultável, mas não participa de KPI/situação de vencimento.
 */
export type DomainExpirationState = "not_applicable" | "expired" | "due_7" | "due_15" | "due_30" | "due_60" | "ok";

export function domainExpirationState(expirationDate: string, status: DomainStatus, todaySP = domainTodaySP()): DomainExpirationState {
  if (status === "inactive") return "not_applicable";
  const days = domainDaysRemaining(expirationDate, todaySP);
  if (days < 0) return "expired";
  if (days <= 7) return "due_7";
  if (days <= 15) return "due_15";
  if (days <= 30) return "due_30";
  if (days <= 60) return "due_60";
  return "ok";
}

export const DOMAIN_EXPIRATION_STATE_LABELS: Record<DomainExpirationState, string> = {
  not_applicable: "—", expired: "Vencido", due_7: "Vence em breve", due_15: "Vence em breve",
  due_30: "Vence em breve", due_60: "Vence em breve", ok: "Em dia",
};

/**
 * Texto detalhado de dias restantes para o cartão de Renovação (Checkpoint A §40) — distinto do
 * rótulo exclusivo de badge acima (`DOMAIN_EXPIRATION_STATE_LABELS`). `inactive` nunca mostra
 * contagem de dias (situação "não se aplica", decisão D31).
 */
export function formatDomainDaysLabel(expirationDate: string, status: DomainStatus, todaySP = domainTodaySP()): string {
  if (status === "inactive") return "Não se aplica";
  const days = domainDaysRemaining(expirationDate, todaySP);
  if (days < 0) return `Vencido há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`;
  if (days === 0) return "Vence hoje";
  return `Vence em ${days} ${days === 1 ? "dia" : "dias"}`;
}
