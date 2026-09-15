import "server-only";

/**
 * Erros de domínio previsíveis — a UI nunca recebe mensagem de SQL, stack, nome de
 * constraint/tabela ou detalhe do Postgres (ver docs/clientes-checkpoint-1.md §18).
 * Toda service layer deve traduzir falhas de repository/banco para um destes códigos
 * antes de deixar a Server Action tratar o resultado.
 */
export type ServiceErrorCode =
  | "forbidden"
  | "not_found"
  | "validation"
  | "duplicate_document"
  | "invalid_owner"
  | "conflict"
  | "database_error";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: ServiceErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
