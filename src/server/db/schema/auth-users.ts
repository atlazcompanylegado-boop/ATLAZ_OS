import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Referência mínima à tabela auth.users, gerenciada pelo Supabase Auth (não pelo
 * Drizzle). Existe só para permitir FK a partir de `profiles`/`memberships` —
 * nunca é alvo de migration gerada por este projeto.
 */
export const authUsers = pgSchema("auth").table("users", {
  id: uuid("id").primaryKey(),
});
