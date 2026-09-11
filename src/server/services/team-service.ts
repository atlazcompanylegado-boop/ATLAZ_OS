import "server-only";
import { countMembersByOrg, listMembersByOrg, type MemberRow } from "@/server/repositories/team-repository";

/** Regra de negócio (hoje trivial) fica aqui, não na page — mesmo padrão vale para toda service futura. */
export async function getTeamSize(orgId: string): Promise<number> {
  return countMembersByOrg(orgId);
}

export async function listTeamMembers(orgId: string): Promise<MemberRow[]> {
  return listMembersByOrg(orgId);
}
