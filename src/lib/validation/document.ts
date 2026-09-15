/**
 * Validação de CPF/CNPJ. Separada da normalização (`normalize.ts`) e dos schemas
 * de formulário (`client.ts`), ver docs/clientes-checkpoint-1.md §D.
 *
 * Nível de validação aplicado (documentado conforme pedido no Checkpoint 2):
 * - CPF: dígitos verificadores recalculados e conferidos (algoritmo padrão).
 * - CNPJ numérico tradicional (14 dígitos): dígitos verificadores recalculados e
 *   conferidos (algoritmo padrão, pesos 5..2/9..2 e 6..2/9..2).
 * - CNPJ alfanumérico (novo formato da Receita Federal, 2026): o algoritmo de
 *   dígito verificador NÃO foi reimplementado aqui — reimplementar um checksum
 *   novo sem uma especificação auditável correria o risco de aceitar/rejeitar
 *   documentos reais incorretamente. Em vez disso, validamos a mesma estrutura
 *   já garantida pelo CHECK do banco (`clients_document_check`): 14 posições,
 *   12 primeiras alfanuméricas maiúsculas, 2 últimas numéricas. Isso é
 *   deliberadamente um nível de validação estrutural, não aritmético, para esse
 *   formato — consistente com a decisão já aprovada no Checkpoint 1 de aceitar
 *   CNPJ alfanumérico sem bloquear inscrições novas.
 */
import { normalizeAlphanumericUpper, normalizeDigits } from "./normalize";

export type PersonType = "individual" | "company";

function calcCpfCheckDigit(base: string): number {
  let weight = base.length + 1;
  let sum = 0;
  for (const digit of base) {
    sum += Number(digit) * weight;
    weight -= 1;
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // todos os dígitos iguais — nunca válido
  const d1 = calcCpfCheckDigit(digits.slice(0, 9));
  const d2 = calcCpfCheckDigit(digits.slice(0, 10));
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

function calcCnpjCheckDigit(base: string): number {
  const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) {
    sum += Number(base[i]) * weights[i]!;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpjNumeric(digits: string): boolean {
  if (!/^\d{14}$/.test(digits)) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const d1 = calcCnpjCheckDigit(digits.slice(0, 12));
  const d2 = calcCnpjCheckDigit(digits.slice(0, 12) + d1);
  return d1 === Number(digits[12]) && d2 === Number(digits[13]);
}

/** Mesmo formato aceito pelo CHECK `clients_document_check` do banco. */
export const CNPJ_ALPHANUMERIC_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/;

export function isStructurallyValidAlphanumericCnpj(value: string): boolean {
  return CNPJ_ALPHANUMERIC_PATTERN.test(value);
}

export type DocumentValidation =
  | { ok: true; normalized: string; checkDigitsVerified: boolean }
  | { ok: false; reason: "cpf_invalid" | "cnpj_invalid" | "cnpj_format_invalid" };

export function validateDocument(personType: PersonType, rawValue: string): DocumentValidation {
  if (personType === "individual") {
    const digits = normalizeDigits(rawValue);
    if (!isValidCpf(digits)) return { ok: false, reason: "cpf_invalid" };
    return { ok: true, normalized: digits, checkDigitsVerified: true };
  }

  const value = normalizeAlphanumericUpper(rawValue);
  if (/^\d{14}$/.test(value)) {
    if (!isValidCnpjNumeric(value)) return { ok: false, reason: "cnpj_invalid" };
    return { ok: true, normalized: value, checkDigitsVerified: true };
  }
  if (isStructurallyValidAlphanumericCnpj(value)) {
    return { ok: true, normalized: value, checkDigitsVerified: false };
  }
  return { ok: false, reason: "cnpj_format_invalid" };
}

/** Só para exibição — a persistência sempre usa o valor normalizado sem máscara. */
export function formatDocumentForDisplay(personType: PersonType | null | undefined, document: string | null): string | null {
  if (!document) return null;
  if (personType === "individual" && /^\d{11}$/.test(document)) {
    return document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (personType === "company" && document.length === 14) {
    return document.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5");
  }
  return document;
}
