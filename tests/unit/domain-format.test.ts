import { describe, it, expect } from "vitest";
import { formatDomainDate, domainDaysRemaining, domainExpirationState, formatDomainDaysLabel } from "@/lib/domains/format";

const TODAY = "2026-09-16";

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

describe("formatDomainDate — DATE puro, nunca passa por timezone", () => {
  it("formata YYYY-MM-DD como DD/MM/YYYY", () => {
    expect(formatDomainDate("2027-01-05")).toBe("05/01/2027");
  });
  it("null vira travessão", () => {
    expect(formatDomainDate(null)).toBe("—");
  });
});

describe("domainDaysRemaining — comparação de calendário, sem deslocamento de fuso", () => {
  it.each([
    [addDays(TODAY, -1), -1],
    [TODAY, 0],
    [addDays(TODAY, 1), 1],
    [addDays(TODAY, 60), 60],
    [addDays(TODAY, 365), 365],
  ])("expirationDate=%s → %i dias", (date, expected) => {
    expect(domainDaysRemaining(date, TODAY)).toBe(expected);
  });
});

describe("domainExpirationState — buckets exclusivos derivados (Checkpoint A §20 / Checkpoint B §28/§30)", () => {
  it.each([
    [-1, "expired"], [0, "due_7"], [7, "due_7"],
    [8, "due_15"], [15, "due_15"],
    [16, "due_30"], [30, "due_30"],
    [31, "due_60"], [60, "due_60"],
    [61, "ok"], [365, "ok"],
  ] as const)("dias=%i → %s (fronteiras exatas)", (days, expected) => {
    expect(domainExpirationState(addDays(TODAY, days), "active", TODAY)).toBe(expected);
  });

  it("status inactive nunca gera urgência, mesmo vencido (decisão D31 aprovada)", () => {
    expect(domainExpirationState(addDays(TODAY, -30), "inactive", TODAY)).toBe("not_applicable");
    expect(domainExpirationState(addDays(TODAY, 1), "inactive", TODAY)).toBe("not_applicable");
  });

  it("transferring participa normalmente da situação de vencimento (Checkpoint B §32)", () => {
    expect(domainExpirationState(addDays(TODAY, -1), "transferring", TODAY)).toBe("expired");
    expect(domainExpirationState(addDays(TODAY, 5), "transferring", TODAY)).toBe("due_7");
  });

  it("fronteira de fuso: virada de dia UTC não desloca o resultado em America/Sao_Paulo", () => {
    // 02:00 UTC de 16/09 é 23:00 de 15/09 em America/Sao_Paulo (UTC-3) — "hoje" deve
    // continuar sendo o dia civil de São Paulo, não o dia UTC. domainDaysRemaining não lê o
    // relógio diretamente (recebe `todaySP` já resolvido), então este teste garante que a
    // aritmética de datas puras não reintroduz esse deslocamento.
    expect(domainDaysRemaining("2026-09-16", "2026-09-15")).toBe(1);
    expect(domainDaysRemaining("2026-09-15", "2026-09-16")).toBe(-1);
  });
});

describe("formatDomainDaysLabel — texto detalhado do cartão de Renovação (Checkpoint C2)", () => {
  it("vencido há N dias (plural)", () => {
    expect(formatDomainDaysLabel(addDays(TODAY, -4), "active", TODAY)).toBe("Vencido há 4 dias");
  });
  it("vencido há 1 dia (singular)", () => {
    expect(formatDomainDaysLabel(addDays(TODAY, -1), "active", TODAY)).toBe("Vencido há 1 dia");
  });
  it("vence hoje", () => {
    expect(formatDomainDaysLabel(TODAY, "active", TODAY)).toBe("Vence hoje");
  });
  it("vence em N dias (plural)", () => {
    expect(formatDomainDaysLabel(addDays(TODAY, 12), "active", TODAY)).toBe("Vence em 12 dias");
  });
  it("vence em 1 dia (singular)", () => {
    expect(formatDomainDaysLabel(addDays(TODAY, 1), "active", TODAY)).toBe("Vence em 1 dia");
  });
  it("inactive nunca mostra contagem de dias (decisão D31)", () => {
    expect(formatDomainDaysLabel(addDays(TODAY, -30), "inactive", TODAY)).toBe("Não se aplica");
    expect(formatDomainDaysLabel(addDays(TODAY, 5), "inactive", TODAY)).toBe("Não se aplica");
  });
});
