import "server-only";
import { can } from "@/config/permissions";
import type { CurrentSession } from "./session";

export type ClientAccess =
  | { ok: true; context: { orgId: string; userId: string; membershipId: string; actorLabel: string } }
  | { ok: false; reason: "session" | "membership" | "scope" | "permission" };

/**
 * Chamado pelo service com getCurrentSession(), nunca com uma sessão do formulário.
 * Concentra a política de Clientes antes de qualquer query pela conexão BYPASSRLS.
 */
export function authorizeClientSession(
  session: CurrentSession | null,
  access: "read" | "write" = "read",
): ClientAccess {
  if (!session) return { ok: false, reason: "session" };
  const membership = session.membership;
  if (!membership || !session.userId) return { ok: false, reason: "membership" };
  // assigned ainda não possui semântica operacional; nunca vira acesso à org.
  if (membership.scope !== "org") return { ok: false, reason: "scope" };
  if (!can(membership.permissions, "client:read") ||
      (access === "write" && !can(membership.permissions, "client:write"))) {
    return { ok: false, reason: "permission" };
  }
  return {
    ok: true,
    context: {
      orgId: membership.org.id,
      userId: session.userId,
      membershipId: membership.id,
      actorLabel: session.email,
    },
  };
}
