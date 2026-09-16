import { describe, it, expect, vi, afterEach } from "vitest";
import { formatTicketNumber, formatTicketDateTime, isTicketOverdue, toDateTimeLocalValue, fromDateTimeLocalValue } from "@/lib/support/format";

describe("formatTicketNumber", () => {
  it("nunca expõe UUID — só #<número>", () => {
    expect(formatTicketNumber(1042)).toBe("#1042");
    expect(formatTicketNumber(1)).toBe("#1");
  });
});

describe("formatTicketDateTime", () => {
  it("retorna travessão para null", () => {
    expect(formatTicketDateTime(null)).toBe("—");
  });
  it("formata em America/Sao_Paulo (UTC-3 fixo)", () => {
    expect(formatTicketDateTime("2026-09-20T14:00:00.000Z")).toBe(formatTicketDateTime(new Date("2026-09-20T14:00:00.000Z")));
    expect(formatTicketDateTime("2026-09-20T03:00:00.000Z")).toContain("20/09/2026");
  });
});

describe("isTicketOverdue", () => {
  afterEach(() => vi.useRealTimers());

  it("nunca é atrasado sem prazo", () => {
    expect(isTicketOverdue(null, "open")).toBe(false);
  });
  it("nunca é atrasado em status finais, mesmo com prazo vencido", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(isTicketOverdue("2020-01-01T00:00:00Z", "resolved")).toBe(false);
    expect(isTicketOverdue("2020-01-01T00:00:00Z", "cancelled")).toBe(false);
  });
  it("é atrasado quando due_at já passou, em qualquer status não-final (inclusive waiting_client)", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(isTicketOverdue("2026-06-15T11:00:00Z", "open")).toBe(true);
    expect(isTicketOverdue("2026-06-15T11:00:00Z", "waiting_client")).toBe(true);
    expect(isTicketOverdue("2026-06-15T13:00:00Z", "open")).toBe(false);
  });
});

describe("datetime-local <-> ISO (timezone de negócio)", () => {
  it("toDateTimeLocalValue nunca perde/desloca o dia por causa do timezone do processo", () => {
    // 2026-09-20T14:00:00Z = 2026-09-20T11:00 em America/Sao_Paulo (UTC-3).
    expect(toDateTimeLocalValue("2026-09-20T14:00:00.000Z")).toBe("2026-09-20T11:00");
    expect(toDateTimeLocalValue(null)).toBe("");
  });
  it("fromDateTimeLocalValue interpreta o valor como horário de Brasília (UTC-3 fixo)", () => {
    expect(fromDateTimeLocalValue("2026-09-20T11:00")).toBe("2026-09-20T11:00:00.000-03:00");
    expect(new Date(fromDateTimeLocalValue("2026-09-20T11:00")).toISOString()).toBe("2026-09-20T14:00:00.000Z");
  });
  it("round-trip: ISO -> datetime-local -> ISO preserva o instante", () => {
    const original = "2026-09-20T14:00:00.000Z";
    const roundTripped = new Date(fromDateTimeLocalValue(toDateTimeLocalValue(original))).toISOString();
    expect(roundTripped).toBe(original);
  });
});
