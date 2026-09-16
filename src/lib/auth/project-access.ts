import "server-only";
import { can } from "@/config/permissions";
import type { CurrentSession } from "./session";
import type { ClientAccess } from "./client-access";

/** Recebe somente a sessão resolvida no servidor, que já valida atividade e papel. */
export function authorizeProjectSession(session: CurrentSession | null, access: "read" | "write" = "read"): ClientAccess {
  if (!session) return { ok: false, reason: "session" };
  const m = session.membership;
  if (!m || !session.userId) return { ok: false, reason: "membership" };
  if (m.scope !== "org") return { ok: false, reason: "scope" };
  if (!can(m.permissions, "project:read") || !can(m.permissions, "client:read") ||
      (access === "write" && !can(m.permissions, "project:write"))) return { ok: false, reason: "permission" };
  return { ok: true, context: { orgId: m.org.id, userId: session.userId, membershipId: m.id, actorLabel: session.email } };
}
