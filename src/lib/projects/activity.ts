export const PROJECT_EVENT_KINDS = {
  created: "project.created", updated: "project.updated", statusChanged: "project.status_changed",
  priorityChanged: "project.priority_changed", ownerChanged: "project.owner_changed", progressChanged: "project.progress_changed",
} as const;
export type ProjectEventKind = (typeof PROJECT_EVENT_KINDS)[keyof typeof PROJECT_EVENT_KINDS];
const labels: Record<ProjectEventKind, string> = {
  "project.created": "Projeto criado", "project.updated": "Projeto atualizado", "project.status_changed": "Status alterado",
  "project.priority_changed": "Prioridade alterada", "project.owner_changed": "Responsável alterado", "project.progress_changed": "Progresso alterado",
};
export function translateProjectEventKind(kind: string): string {
  return labels[kind as ProjectEventKind] ?? "Atividade do projeto";
}
