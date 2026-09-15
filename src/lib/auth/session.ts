import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/server/db/client";
import { users, memberships, roles, orgs, rolePermissions, permissions } from "@/server/db/schema";

export interface CurrentSession {
  /** id em public.users (não o id do Supabase Auth). */
  userId: string;
  authUserId: string;
  email: string;
  membership: {
    id: string;
    /** Escopos desconhecidos também são preservados para negação explícita pelo módulo. */
    scope: string;
    role: { id: string; key: string; name: string };
    /** Permissões efetivas; super_admin recebe o catálogo, conforme atlaz.has_permission(). */
    permissions: string[];
    org: { id: string; slug: string; name: string };
  } | null;
}

/**
 * Sessão + membership do usuário autenticado. `membership` vem null tanto quando o
 * usuário do Supabase Auth ainda não tem linha em `public.users` (trigger não rodou
 * ainda, ou ele existia antes do trigger) quanto quando já tem `users` mas nenhuma
 * `membership` — em ambos os casos a UI trata como "sem acesso a nenhum módulo".
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const db = getDb();
  const [profile] = await db.select().from(users).where(eq(users.authUserId, user.id));

  if (!profile) {
    return { userId: "", authUserId: user.id, email: user.email, membership: null };
  }

  // Uma sessão Auth válida não reativa um perfil interno desativado.
  if (!profile.isActive) return null;

  const [row] = await db
    .select({
      membershipId: memberships.id,
      scope: memberships.scope,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
      roleOrgId: roles.orgId,
      orgId: orgs.id,
      orgSlug: orgs.slug,
      orgName: orgs.name,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .innerJoin(orgs, eq(memberships.orgId, orgs.id))
    .where(and(eq(memberships.userId, profile.id), eq(memberships.isActive, true)))
    .orderBy(asc(memberships.createdAt), asc(memberships.id))
    .limit(1);

  // Não trocar silenciosamente para outra organização quando o vínculo é inválido.
  if (!row || row.roleOrgId !== row.orgId) {
    return { userId: profile.id, authUserId: user.id, email: user.email, membership: null };
  }

  // Único tratamento especial do papel, lido do banco e nunca do metadata/JWT.
  // Não altera grants, nem concede permissões a CEO ou a outros papéis sem grants.
  const permissionRows = row.roleKey === "super_admin"
    ? await db.select({ key: permissions.key }).from(permissions).orderBy(asc(permissions.key))
    : await db
        .select({ key: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, row.roleId))
        .orderBy(asc(rolePermissions.permissionKey));

  return {
    userId: profile.id,
    authUserId: user.id,
    email: user.email,
    membership: {
      id: row.membershipId,
      scope: row.scope,
      role: { id: row.roleId, key: row.roleKey, name: row.roleName },
      permissions: permissionRows.map((p) => p.key),
      org: { id: row.orgId, slug: row.orgSlug, name: row.orgName },
    },
  };
}
