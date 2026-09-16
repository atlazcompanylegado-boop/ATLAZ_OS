import "server-only";
import { can } from "@/config/permissions";
import type { CurrentSession } from "./session";
import type { ClientAccess } from "./client-access";

/**
 * Recebe somente a sessão resolvida no servidor. Leitura exige `ticket:read`+`client:read`
 * (mesmo motivo de Projetos: toda ficha/listagem de chamado expõe o cliente pai); escrita
 * soma `ticket:write`. `project:read` NUNCA entra aqui — ele só controla, na camada de
 * serviço, se os detalhes do Projeto vinculado (nome/status) podem ser mostrados dentro de
 * um chamado já acessível; não gate.ia o chamado em si (ver docs/suporte-checkpoint-a.md §5).
 */
export function authorizeTicketSession(session: CurrentSession | null, access: "read" | "write" = "read"): ClientAccess {
  if (!session) return { ok: false, reason: "session" };
  const m = session.membership;
  if (!m || !session.userId) return { ok: false, reason: "membership" };
  if (m.scope !== "org") return { ok: false, reason: "scope" };
  if (!can(m.permissions, "ticket:read") || !can(m.permissions, "client:read") ||
      (access === "write" && !can(m.permissions, "ticket:write"))) return { ok: false, reason: "permission" };
  return { ok: true, context: { orgId: m.org.id, userId: session.userId, membershipId: m.id, actorLabel: session.email } };
}
