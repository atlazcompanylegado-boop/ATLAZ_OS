import "server-only";
import { eq, count } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { memberships, profiles } from "@/server/db/schema";

/** Só acesso a dado — nenhuma regra de negócio aqui (ver docs/arquitetura.md §3). */
export async function countMembersByOrg(orgId: string): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(memberships)
    .where(eq(memberships.orgId, orgId));
  return row?.value ?? 0;
}

export interface MemberRow {
  membershipId: string;
  role: string;
  email: string;
  fullName: string | null;
  createdAt: Date;
}

export async function listMembersByOrg(orgId: string): Promise<MemberRow[]> {
  return getDb()
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      email: profiles.email,
      fullName: profiles.fullName,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(profiles, eq(memberships.userId, profiles.id))
    .where(eq(memberships.orgId, orgId))
    .orderBy(memberships.createdAt);
}
