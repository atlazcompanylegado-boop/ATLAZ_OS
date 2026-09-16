import { describe, it, expect, vi, afterEach } from "vitest";
import { formatProjectDate, isProjectOverdue } from "@/lib/projects/format";

describe("formatProjectDate", () => {
  it("formata YYYY-MM-DD como DD/MM/YYYY sem passar por Date/timezone", () => {
    expect(formatProjectDate("2026-01-05")).toBe("05/01/2026");
  });
  it("retorna travessão para null", () => {
    expect(formatProjectDate(null)).toBe("—");
  });
});

describe("isProjectOverdue", () => {
  afterEach(() => vi.useRealTimers());

  it("nunca é atrasado sem prazo", () => {
    expect(isProjectOverdue(null, "active")).toBe(false);
  });
  it("nunca é atrasado em status finais, mesmo com prazo vencido", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(isProjectOverdue("2020-01-01", "completed")).toBe(false);
    expect(isProjectOverdue("2020-01-01", "cancelled")).toBe(false);
  });
  it("é atrasado quando o prazo já passou em America/Sao_Paulo, em status não final", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(isProjectOverdue("2026-06-14", "active")).toBe(true);
    expect(isProjectOverdue("2026-06-16", "active")).toBe(false);
  });
});
