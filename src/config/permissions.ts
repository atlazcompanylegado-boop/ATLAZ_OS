/**
 * Permissões granulares — a fonte da verdade é o banco (`public.permissions` +
 * `public.role_permissions`, herdadas do projeto anterior, ver docs/banco.md §1).
 * Esta lista só existe para dar autocomplete/erro de compilação em `can()`; se um
 * módulo novo precisar de uma chave que não está aqui, ela também precisa existir
 * na tabela `permissions` (via migration) — as duas nunca divergem por muito tempo.
 */
export const PERMISSION_KEYS = [
  "audit:read",
  "brand:read",
  "brand:write",
  "client:delete",
  "client:read",
  "client:write",
  "content:publish",
  "content:read",
  "content:write",
  "contract:read",
  "contract:write",
  "dashboard:read",
  "domain:read",
  "domain:write",
  "finance:export",
  "finance:read",
  "finance:write",
  "infra:read",
  "infra:write",
  "integration:manage",
  "intelligence:read",
  "lead:read",
  "lead:write",
  "marketing:read",
  "media:read",
  "media:write",
  "project:delete",
  "project:deploy",
  "project:read",
  "project:write",
  "proposal:read",
  "proposal:write",
  "settings:manage",
  "studio:read",
  "team:manage",
  "team:read",
  "ticket:read",
  "ticket:write",
  "vault:read",
  "vault:reveal",
  "vault:write",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * Única função que decide autorização. Recebe as permissões já carregadas para a
 * sessão atual (`getCurrentSession().membership.permissions`, resolvidas via
 * role_permissions no banco) — nunca decide a partir do nome do papel diretamente.
 * Sempre chamada na service layer antes de tocar o banco; na UI só para esconder botão.
 */
export function can(grantedPermissions: readonly string[] | undefined, permission: PermissionKey): boolean {
  if (!grantedPermissions) return false;
  return grantedPermissions.includes(permission);
}
