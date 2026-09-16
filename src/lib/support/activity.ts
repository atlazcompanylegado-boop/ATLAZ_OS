export const TICKET_EVENT_KINDS = {
  created: "ticket.created", updated: "ticket.updated", statusChanged: "ticket.status_changed",
  priorityChanged: "ticket.priority_changed", assigneeChanged: "ticket.assignee_changed",
  projectChanged: "ticket.project_changed", dueDateChanged: "ticket.due_date_changed", commentAdded: "ticket.comment_added",
} as const;
export type TicketEventKind = (typeof TICKET_EVENT_KINDS)[keyof typeof TICKET_EVENT_KINDS];
const labels: Record<TicketEventKind, string> = {
  "ticket.created": "Chamado criado", "ticket.updated": "Chamado atualizado", "ticket.status_changed": "Status alterado",
  "ticket.priority_changed": "Prioridade alterada", "ticket.assignee_changed": "Responsável alterado",
  "ticket.project_changed": "Projeto vinculado alterado", "ticket.due_date_changed": "Prazo alterado",
  "ticket.comment_added": "Comentário adicionado",
};
export function translateTicketEventKind(kind: string): string {
  return labels[kind as TicketEventKind] ?? "Atividade do chamado";
}
