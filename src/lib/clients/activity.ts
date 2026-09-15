/**
 * Vocabulário compartilhado entre o service (que grava `activity_events.kind`) e a
 * timeline da Ficha Mestre (que traduz `kind` para um título em português — nunca
 * renderiza o valor bruto, ver docs/clientes-checkpoint-1.md §50).
 */
export const CLIENT_EVENT_KINDS = {
  created: "client.created",
  updated: "client.updated",
  statusChanged: "client.status_changed",
  ownerChanged: "client.owner_changed",
  contactAdded: "client.contact_added",
  contactUpdated: "client.contact_updated",
  contactRemoved: "client.contact_removed",
  primaryContactChanged: "client.primary_contact_changed",
} as const;

export type ClientEventKind = (typeof CLIENT_EVENT_KINDS)[keyof typeof CLIENT_EVENT_KINDS];

const CLIENT_EVENT_LABELS: Record<string, string> = {
  [CLIENT_EVENT_KINDS.created]: "Cliente cadastrado",
  [CLIENT_EVENT_KINDS.updated]: "Dados atualizados",
  [CLIENT_EVENT_KINDS.statusChanged]: "Status alterado",
  [CLIENT_EVENT_KINDS.ownerChanged]: "Responsável alterado",
  [CLIENT_EVENT_KINDS.contactAdded]: "Contato adicionado",
  [CLIENT_EVENT_KINDS.contactUpdated]: "Contato atualizado",
  [CLIENT_EVENT_KINDS.contactRemoved]: "Contato removido",
  [CLIENT_EVENT_KINDS.primaryContactChanged]: "Contato principal alterado",
};

/** Nunca deixa um `kind` desconhecido vazar cru para a tela. */
export function translateClientEventKind(kind: string): string {
  return CLIENT_EVENT_LABELS[kind] ?? "Atividade registrada";
}
