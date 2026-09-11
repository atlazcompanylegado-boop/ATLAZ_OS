import "server-only";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/server/db/client";
import { memberships, organizations } from "@/server/db/schema";
import type { AppRole } from "@/config/permissions";

export interface CurrentSession {
  userId: string;
  email: string;
  membership: {
    id: string;
    role: AppRole;
    org: { id: string; name: string; slug: string };
  } | null;
}

/**
 * Sessão + membership do usuário autenticado, para uso em Server Components/Actions.
 * `membership` vem null para um usuário autenticado no Supabase que ainda não tem
 * vínculo em `memberships` — a UI deve tratar isso como "sem acesso a nenhum módulo",
 * nunca assumir um papel default.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const [row] = await getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.userId, user.id))
    .limit(1);

  return {
    userId: user.id,
    email: user.email,
    membership: row
      ? {
          id: row.membershipId,
          role: row.role,
          org: { id: row.orgId, name: row.orgName, slug: row.orgSlug },
        }
      : null,
  };
}
