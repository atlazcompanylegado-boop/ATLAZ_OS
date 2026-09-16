/**
 * Campos que o formulário de edição de Suporte envia quando o usuário não pode gerenciar
 * Projeto. O teste de componente confere esta lista contra o <form> renderizado, e o teste
 * de integração usa a mesma lista para chamar a Server Action real.
 */
export const EDIT_FORM_FIELDS_WITHOUT_PROJECT = ["ticketId", "version", "title", "description", "priority", "assignedUserId", "dueAt"] as const;
