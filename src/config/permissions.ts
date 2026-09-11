/**
 * Matriz papel → permissão. Único lugar do sistema que decide "quem pode o quê".
 * Cada módulo novo soma suas permissões aqui (ver docs/seguranca.md §2) — nunca
 * cria uma checagem de papel solta em outro arquivo.
 */

export type AppRole =
  | "super_admin"
  | "ceo"
  | "socio"
  | "desenvolvedor"
  | "designer"
  | "social_media"
  | "financeiro"
  | "comercial";

export const PERMISSIONS = {
  "org.manage_members": ["super_admin", "ceo"],
  "org.view_audit_log": ["super_admin", "ceo"],
  "cofre.view_credential": ["super_admin", "ceo", "desenvolvedor"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Única função que decide autorização. Sempre chamada na service layer, nunca só na UI. */
export function can(role: AppRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role);
}
