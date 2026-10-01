export const DOMAIN_EVENT_KINDS = {
  created: "domain.created", updated: "domain.updated", statusChanged: "domain.status_changed",
  projectChanged: "domain.project_changed", expirationChanged: "domain.expiration_changed",
  autoRenewChanged: "domain.auto_renew_changed", ownerChanged: "domain.owner_changed",
} as const;
export type DomainEventKind = (typeof DOMAIN_EVENT_KINDS)[keyof typeof DOMAIN_EVENT_KINDS];
const labels: Record<DomainEventKind, string> = {
  "domain.created": "Domínio cadastrado", "domain.updated": "Domínio atualizado", "domain.status_changed": "Status alterado",
  "domain.project_changed": "Projeto vinculado alterado", "domain.expiration_changed": "Vencimento alterado",
  "domain.auto_renew_changed": "Renovação automática alterada", "domain.owner_changed": "Responsável alterado",
};
export function translateDomainEventKind(kind: string): string {
  return labels[kind as DomainEventKind] ?? "Atividade do domínio";
}
