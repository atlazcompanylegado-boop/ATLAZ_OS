import "server-only";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/server/db/client";
import { users, memberships, roles, orgs, rolePermissions } from "@/server/db/schema";

export interface CurrentSession {
  /** id em public.users (não o id do Supabase Auth). */
  userId: string;
  authUserId: string;
  email: string;
  membership: {
    id: string;
    role: { id: string; key: string; name: string };
    /** Chaves de public.permissions concedidas ao papel — ver config/permissions.ts. */
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

  const [row] = await db
    .select({
      membershipId: memberships.id,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
      orgId: orgs.id,
      orgSlug: orgs.slug,
      orgName: orgs.name,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .innerJoin(orgs, eq(memberships.orgId, orgs.id))
    .where(eq(memberships.userId, profile.id))
    .limit(1);

  if (!row) {
    return { userId: profile.id, authUserId: user.id, email: user.email, membership: null };
  }

  const permissionRows = await db
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, row.roleId));

  return {
    userId: profile.id,
    authUserId: user.id,
    email: user.email,
    membership: {
      id: row.membershipId,
      role: { id: row.roleId, key: row.roleKey, name: row.roleName },
      permissions: permissionRows.map((p) => p.key),
      org: { id: row.orgId, slug: row.orgSlug, name: row.orgName },
    },
  };
}
