import { describe, it, expect } from "vitest";
import { normalizeDomainName, domainNameToUnicode } from "@/lib/validation/domain-normalize";
import { domainCreateSchema, domainUpdateSchema, domainFiltersSchema, DOMAIN_STATUSES, DOMAIN_AUTO_RENEW_STATUSES } from "@/lib/validation/domain";

const base = { clientId: "11111111-1111-4111-8111-111111111111", expirationDate: "2027-01-01" };

describe("normalizeDomainName — pipeline aprovado (Checkpoint A §10/§15-17)", () => {
  it.each([
    ["https://example.com", "example.com"],
    ["http://example.com/", "example.com"],
    ["EXAMPLE.COM", "example.com"],
    ["example.com.", "example.com"],
    ["empresa.com.br", "empresa.com.br"],
    ["münchen.de", "xn--mnchen-3ya.de"],
    ["ÉXAMPLE.com", "xn--xample-9ua.com"],
  ])("aceita %s → %s", (input, expected) => {
    const r = normalizeDomainName(input);
    expect(r).toMatchObject({ ok: true, value: expected });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["www.example.com", "has_www"],
    ["example.com/path", "has_path"],
    ["example.com?x=1", "has_query"],
    ["example.com#fragment", "has_fragment"],
    ["example.com:8080", "has_port"],
    ["user:pass@example.com", "has_credentials"],
    ["localhost", "single_label"],
    ["example", "single_label"],
    ["192.168.0.1", "invalid_label"],
    ["-bad.com", "invalid_label"],
    ["bad-.com", "invalid_label"],
    ["a..b.com", "invalid_label"],
    ["exa mple.com", "invalid_chars"],
    ["*.example.com", "invalid_chars"],
    ["xn--zz.com", "invalid_idn"],
    ["ftp://example.com", "invalid_chars"],
  ])("rejeita %s (%s)", (input, reason) => {
    const r = normalizeDomainName(input);
    expect(r).toMatchObject({ ok: false, reason });
  });

  it("domínio muito longo (>253) é rejeitado", () => {
    const label = "a".repeat(63);
    const huge = `${label}.${label}.${label}.${label}.com`; // > 253 chars
    const r = normalizeDomainName(huge);
    expect(r.ok).toBe(false);
  });
});

describe("domainNameToUnicode — IDN round-trip sem perda", () => {
  it("punycode → Unicode → volta ao mesmo ASCII", () => {
    const unicode = domainNameToUnicode("xn--mnchen-3ya.de");
    expect(unicode).toBe("münchen.de");
    const back = normalizeDomainName(unicode);
    expect(back).toMatchObject({ ok: true, value: "xn--mnchen-3ya.de" });
  });
  it("domínio já ASCII simples permanece igual", () => {
    expect(domainNameToUnicode("empresa.com.br")).toBe("empresa.com.br");
  });
});

describe("domainCreateSchema", () => {
  it("normaliza domainName e aplica defaults (status=active, autoRenewStatus=unknown)", () => {
    const r = domainCreateSchema.safeParse({ ...base, domainName: "EXAMPLE.COM" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ domainName: "example.com", status: "active", autoRenewStatus: "unknown", projectId: null, registrar: null, notes: null });
  });
  it("rejeita domainName inválido com mensagem específica no campo certo", () => {
    const r = domainCreateSchema.safeParse({ ...base, domainName: "www.example.com" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]).toMatchObject({ path: ["domainName"], message: expect.stringContaining("sem \"www.\"") });
  });
  it("exige expirationDate", () => {
    const r = domainCreateSchema.safeParse({ clientId: base.clientId, domainName: "example.com" });
    expect(r.success).toBe(false);
  });
  it("rejeita data inválida", () => {
    const r = domainCreateSchema.safeParse({ ...base, domainName: "example.com", expirationDate: "31/12/2027" });
    expect(r.success).toBe(false);
  });
  it("registrar/notes: vazio vira null, trim aplicado", () => {
    const r = domainCreateSchema.safeParse({ ...base, domainName: "example.com", registrar: "  Registro.br  ", notes: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ registrar: "Registro.br", notes: null });
  });
  it.each(DOMAIN_STATUSES)("aceita status %s", (status) => {
    expect(domainCreateSchema.safeParse({ ...base, domainName: "example.com", status }).success).toBe(true);
  });
  it.each(DOMAIN_AUTO_RENEW_STATUSES)("aceita autoRenewStatus %s", (autoRenewStatus) => {
    expect(domainCreateSchema.safeParse({ ...base, domainName: "example.com", autoRenewStatus }).success).toBe(true);
  });
});

describe("domainUpdateSchema — semântica de PATCH (mesma correção do hotfix de Suporte)", () => {
  it("todos os campos são opcionais — payload vazio é válido (nada muda)", () => {
    const r = domainUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBeUndefined();
      expect(r.data.projectId).toBeUndefined();
      expect(r.data.notes).toBeUndefined();
    }
  });
  it("clientId e domainName nunca são aceitos na edição, mesmo enviados", () => {
    const r = domainUpdateSchema.safeParse({ clientId: base.clientId, domainName: "outro.com" });
    expect(r.success).toBe(false);
  });
  it("projectId explícito null é distinto de ausente", () => {
    const r = domainUpdateSchema.safeParse({ projectId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.projectId).toBeNull();
  });
});

describe("domainFiltersSchema", () => {
  it("page inválida (0/-1/abc/muito acima) sempre cai em 1 no schema (clamp de topo fica no repository)", () => {
    for (const page of ["0", "-1", "abc", undefined]) {
      const r = domainFiltersSchema.safeParse({ page });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.page).toBe(1);
    }
  });
  it("expirationWindow só aceita os buckets cumulativos aprovados", () => {
    expect(domainFiltersSchema.safeParse({ expirationWindow: "30" }).success).toBe(true);
    expect(domainFiltersSchema.safeParse({ expirationWindow: "45" }).success).toBe(false);
  });
  it("sort default é 'expiration' (vencimento mais próximo primeiro)", () => {
    const r = domainFiltersSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sort).toBe("expiration");
  });
});
