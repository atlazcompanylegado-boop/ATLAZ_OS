import "server-only";
import { eq, count } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { memberships, users, roles } from "@/server/db/schema";

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
  roleKey: string;
  roleName: string;
  email: string;
  fullName: string;
  createdAt: Date;
}

export async function listMembersByOrg(orgId: string): Promise<MemberRow[]> {
  return getDb()
    .select({
      membershipId: memberships.id,
      roleKey: roles.key,
      roleName: roles.name,
      email: users.email,
      fullName: users.fullName,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(eq(memberships.orgId, orgId))
    .orderBy(memberships.createdAt);
}
