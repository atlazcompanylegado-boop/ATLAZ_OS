import { describe, expect, it } from "vitest";
import { normalizeDigits, normalizeWebsite, normalizeEmail, normalizePhone, parsePositiveInt, trimToNull } from "@/lib/validation/normalize";
import { isValidCpf, isValidCnpjNumeric, isStructurallyValidAlphanumericCnpj, validateDocument, formatDocumentForDisplay } from "@/lib/validation/document";
import { parseClientContactInput, parseClientFilters, parseClientInput, parseVersion } from "@/lib/validation/client";

describe("normalize", () => {
  it("trimToNull remove espaços e trata vazio como null", () => {
    expect(trimToNull("  Atlaz  ")).toBe("Atlaz");
    expect(trimToNull("   ")).toBeNull();
    expect(trimToNull(undefined)).toBeNull();
  });

  it("normalizeDigits mantém só dígitos", () => {
    expect(normalizeDigits("(85) 99999-9999")).toBe("85999999999");
  });

  it("normalizeEmail normaliza para minúsculas", () => {
    expect(normalizeEmail(" Pessoa@ATLAZ.com ")).toBe("pessoa@atlaz.com");
    expect(normalizeEmail("")).toBeNull();
  });

  it("normalizePhone descarta tudo que não for dígito", () => {
    expect(normalizePhone("+55 (11) 98888-7777")).toBe("5511988887777");
    expect(normalizePhone("")).toBeNull();
  });

  it("normalizeWebsite prefixa https:// quando ausente, preserva http:// explícito", () => {
    expect(normalizeWebsite("atlazcompany.com")).toBe("https://atlazcompany.com");
    expect(normalizeWebsite("http://atlazcompany.com")).toBe("http://atlazcompany.com");
    expect(normalizeWebsite("https://atlazcompany.com")).toBe("https://atlazcompany.com");
    expect(normalizeWebsite("")).toBeNull();
  });

  it("parsePositiveInt cai no fallback para entradas inválidas", () => {
    expect(parsePositiveInt("3", 1)).toBe(3);
    expect(parsePositiveInt("abc", 1)).toBe(1);
    expect(parsePositiveInt("-5", 1)).toBe(1);
    expect(parsePositiveInt("0", 1)).toBe(1);
    expect(parsePositiveInt(undefined, 1)).toBe(1);
  });
});

describe("document — CPF", () => {
  it("aceita CPF válido conhecido e normaliza para dígitos", () => {
    const result = validateDocument("individual", "529.982.247-25");
    expect(result).toMatchObject({ ok: true, normalized: "52998224725", checkDigitsVerified: true });
  });
  it("rejeita CPF com dígito verificador inválido", () => {
    expect(isValidCpf("12345678900")).toBe(false);
    expect(validateDocument("individual", "123.456.789-00")).toMatchObject({ ok: false, reason: "cpf_invalid" });
  });
  it("rejeita CPF com todos os dígitos iguais", () => {
    expect(isValidCpf("11111111111")).toBe(false);
  });
  it("formata CPF só para exibição, sem alterar o valor persistido", () => {
    expect(formatDocumentForDisplay("individual", "52998224725")).toBe("529.982.247-25");
  });
});

describe("document — CNPJ", () => {
  it("aceita CNPJ numérico válido com dígitos recalculados", () => {
    const result = validateDocument("company", "11.222.333/0001-81");
    expect(result).toMatchObject({ ok: true, normalized: "11222333000181", checkDigitsVerified: true });
  });
  it("rejeita CNPJ numérico com dígito verificador inválido", () => {
    expect(isValidCnpjNumeric("12345678000190")).toBe(false);
    expect(validateDocument("company", "12.345.678/0001-90")).toMatchObject({ ok: false, reason: "cnpj_invalid" });
  });
  it("aceita CNPJ alfanumérico estruturalmente válido sem recalcular dígito verificador", () => {
    const result = validateDocument("company", "12ABC34501DE35");
    expect(result).toEqual({ ok: true, normalized: "12ABC34501DE35", checkDigitsVerified: false });
    expect(isStructurallyValidAlphanumericCnpj("12ABC34501DE35")).toBe(true);
  });
  it("rejeita CNPJ alfanumérico com as duas últimas posições não numéricas", () => {
    expect(validateDocument("company", "12ABC34501DEAB")).toMatchObject({ ok: false, reason: "cnpj_format_invalid" });
  });
  it("formata CNPJ (numérico ou alfanumérico) com o mesmo agrupamento posicional", () => {
    expect(formatDocumentForDisplay("company", "11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocumentForDisplay("company", "12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
});

describe("parseClientInput", () => {
  const base = {
    name: "Atlaz Company",
    tradeName: "",
    legalName: "",
    personType: "",
    document: "",
    status: "",
    source: "",
    ownerUserId: "",
    website: "",
    notes: "",
  };

  it("aceita um cliente mínimo válido com status default 'lead'", () => {
    const result = parseClientInput(base);
    expect(result).toMatchObject({ ok: true, data: { name: "Atlaz Company", status: "lead", document: null, personType: null } });
  });

  it("rejeita nome vazio", () => {
    const result = parseClientInput({ ...base, name: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.name).toBeDefined();
  });

  it("rejeita status inválido", () => {
    const result = parseClientInput({ ...base, status: "invalido" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.status).toBeDefined();
  });

  it("exige tipo de pessoa quando documento é informado", () => {
    const result = parseClientInput({ ...base, document: "52998224725" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.document).toMatch(/tipo de pessoa/i);
  });

  it("normaliza CPF válido com máscara", () => {
    const result = parseClientInput({ ...base, personType: "individual", document: "529.982.247-25" });
    expect(result).toMatchObject({ ok: true, data: { personType: "individual", document: "52998224725" } });
  });

  it("rejeita CNPJ inválido com mensagem amigável", () => {
    const result = parseClientInput({ ...base, personType: "company", document: "12.345.678/0001-90" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.document).toBe("CNPJ inválido.");
  });

  it("aceita site sem esquema e o normaliza", () => {
    const result = parseClientInput({ ...base, website: "atlazcompany.com" });
    expect(result).toMatchObject({ ok: true, data: { website: "https://atlazcompany.com" } });
  });

  it("rejeita responsável que não é UUID", () => {
    const result = parseClientInput({ ...base, ownerUserId: "não-é-um-uuid" });
    expect(result.ok).toBe(false);
  });
});

describe("parseClientContactInput", () => {
  const base = { name: "Fulano", jobTitle: "", type: "", email: "", phone: "", whatsapp: "", isPrimary: "false", notes: "" };

  it("aceita contato mínimo válido", () => {
    expect(parseClientContactInput(base)).toMatchObject({ ok: true, data: { name: "Fulano", isPrimary: false } });
  });
  it("trata campo opcional AUSENTE do form (null, não string vazia) como não informado", () => {
    // FormData.get() devolve null quando o campo nem existe no formulário (ex.: o
    // cadastro inline de contato em /clientes/novo não tem campo "Observações").
    const { notes, ...rest } = base;
    void notes;
    const withMissingFields = { ...rest, notes: null, jobTitle: null, type: null, email: null, phone: null, whatsapp: null };
    expect(parseClientContactInput(withMissingFields)).toMatchObject({
      ok: true,
      data: { name: "Fulano", jobTitle: null, notes: null, email: null },
    });
  });
  it("rejeita nome vazio", () => {
    const result = parseClientContactInput({ ...base, name: "" });
    expect(result.ok).toBe(false);
  });
  it("rejeita e-mail com formato inválido", () => {
    const result = parseClientContactInput({ ...base, email: "não é email" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.email).toBeDefined();
  });
  it("rejeita telefone com menos de 8 dígitos", () => {
    const result = parseClientContactInput({ ...base, phone: "1234" });
    expect(result.ok).toBe(false);
  });
  it("rejeita whatsapp com mais de 15 dígitos", () => {
    const result = parseClientContactInput({ ...base, whatsapp: "1".repeat(16) });
    expect(result.ok).toBe(false);
  });
  it("aceita isPrimary via string 'true'/'on'", () => {
    expect(parseClientContactInput({ ...base, isPrimary: "true" })).toMatchObject({ ok: true, data: { isPrimary: true } });
    expect(parseClientContactInput({ ...base, isPrimary: "on" })).toMatchObject({ ok: true, data: { isPrimary: true } });
  });
});

describe("parseClientFilters / parseVersion", () => {
  it("usa defaults para filtros ausentes/ inválidos", () => {
    expect(parseClientFilters({})).toEqual({ q: null, status: null, ownerUserId: null, sort: "recent", page: 1 });
  });
  it("ignora status/sort desconhecidos em vez de quebrar", () => {
    expect(parseClientFilters({ status: "foo", sort: "bar", page: "2" })).toMatchObject({ status: null, sort: "recent", page: 2 });
  });
  it("aceita filtros válidos", () => {
    const ownerUserId = "10000000-0000-4000-8000-000000000001";
    expect(parseClientFilters({ q: " atlaz ", status: "active", responsavel: ownerUserId, sort: "name", page: "3" })).toEqual({
      q: "atlaz",
      status: "active",
      ownerUserId,
      sort: "name",
      page: 3,
    });
  });
  it("parseVersion exige inteiro >= 1", () => {
    expect(parseVersion("2")).toBe(2);
    expect(parseVersion("0")).toBeNull();
    expect(parseVersion("abc")).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });
});
