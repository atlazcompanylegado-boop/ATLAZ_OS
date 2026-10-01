import { trimToNull } from "./normalize";

/**
 * Normalização pura de `domain_name` (nenhuma decisão de validade aqui — só forma).
 * Pipeline aprovado em docs/dominios-checkpoint-a.md §10/§15–17 (decisões D3–D5):
 * nunca corrige em silêncio o que pode confundir (caminho, query, porta, credencial,
 * `www.`) — só normaliza o que é inequívoco (protocolo http(s), maiúsculas, ponto final).
 *
 * Retorna a forma ASCII canônica pronta para persistir, ou um código de rejeição —
 * nunca lança exceção (a camada de validação decide a mensagem).
 */
export type DomainNormalizeResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "invalid_chars" | "has_path" | "has_query" | "has_fragment" | "has_port" | "has_credentials" | "has_www" | "invalid_idn" | "too_long" | "invalid_label" | "single_label" };

const CONTROL_OR_SPACE_RE = /[\s\x00-\x1f]/;

export function normalizeDomainName(raw: unknown): DomainNormalizeResult {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  let value = raw.trim();
  if (value === "") return { ok: false, reason: "empty" };
  if (CONTROL_OR_SPACE_RE.test(value) || value.includes("*")) return { ok: false, reason: "invalid_chars" };

  // Só um prefixo http(s):// é removido — qualquer outro esquema (ftp:, mailto:) é rejeitado
  // como caractere estruturalmente inválido (cai no fragmento "userinfo/porta/etc." abaixo,
  // porque "mailto:x@example.com" tem ":" fora da posição de esquema aceito).
  const schemeMatch = /^https?:\/\//i.exec(value);
  if (schemeMatch) {
    value = value.slice(schemeMatch[0].length);
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return { ok: false, reason: "invalid_chars" };
  }

  // Um único "/" final é aceito (http://example.com/); qualquer coisa depois é caminho real.
  if (value.endsWith("/")) value = value.slice(0, -1);
  if (value.includes("/")) return { ok: false, reason: "has_path" };
  if (value.includes("?")) return { ok: false, reason: "has_query" };
  if (value.includes("#")) return { ok: false, reason: "has_fragment" };
  if (value.includes("@")) return { ok: false, reason: "has_credentials" };
  if (value.includes(":")) return { ok: false, reason: "has_port" };

  // Um único ponto final é removido (example.com. → example.com); mais de um é rejeitado
  // por cair no formato de rótulo inválido abaixo (rótulo vazio no meio).
  if (value.endsWith(".") && !value.endsWith("..")) value = value.slice(0, -1);

  const lower = value.toLowerCase();
  if (lower.startsWith("www.")) return { ok: false, reason: "has_www" };

  // `new URL()` converte IDN Unicode para punycode ASCII (UTS-46 nativo) e rejeita
  // (lança) hosts estruturalmente inválidos, incluindo punycode malformado — sem precisar
  // de nenhuma dependência de IDN. Não usamos `domainToASCII` isoladamente porque ele
  // trunca caminho/query em silêncio; `new URL()` já foi filtrado desses casos acima.
  let ascii: string;
  try {
    ascii = new URL(`http://${lower}`).hostname;
  } catch {
    return { ok: false, reason: "invalid_idn" };
  }
  if (ascii === "") return { ok: false, reason: "invalid_chars" };
  if (ascii.length > 253) return { ok: false, reason: "too_long" };

  const labels = ascii.split(".");
  if (labels.length < 2) return { ok: false, reason: "single_label" };
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return { ok: false, reason: "invalid_label" };
    if (!/^[a-z0-9-]+$/.test(label)) return { ok: false, reason: "invalid_label" };
    if (label.startsWith("-") || label.endsWith("-")) return { ok: false, reason: "invalid_label" };
  }
  const tld = labels[labels.length - 1]!;
  if (/^\d+$/.test(tld)) return { ok: false, reason: "invalid_label" }; // IPv4 ("192.168.0.1"): TLD nunca é só dígitos.

  return { ok: true, value: ascii };
}

/** Apresentação: converte a forma ASCII canônica de volta para Unicode (IDN legível). Nunca falha — sem conversão possível, devolve o próprio ASCII. */
export function domainNameToUnicode(ascii: string): string {
  try {
    const url = new URL(`http://${ascii}`);
    // `URL` já normaliza para Unicode ao ler `hostname` em runtimes que suportam IDN
    // (Node/navegadores modernos) — mas alguns ambientes devolvem o próprio punycode;
    // nesse caso o valor exibido é igual ao armazenado, nunca um erro.
    return url.hostname === ascii ? unicodeFromPunycode(ascii) : url.hostname;
  } catch {
    return ascii;
  }
}

/** Node/navegadores não expõem `domainToUnicode` de forma portável fora de `node:url`; aqui só decodificamos rótulos `xn--`. */
function unicodeFromPunycode(ascii: string): string {
  if (!ascii.includes("xn--")) return ascii;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { domainToUnicode } = require("node:url") as typeof import("node:url");
    return domainToUnicode(ascii) || ascii;
  } catch {
    return ascii;
  }
}

export function normalizeDomainOptionalText(value: unknown, maxLength: number): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
