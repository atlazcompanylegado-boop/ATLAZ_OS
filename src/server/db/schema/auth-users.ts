import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Referência externa, não exportada em schema/index.ts e não gerenciada por migrations.
 * A fundação herdada não possui FK de public.users para auth.users.
 */
export const authUsers = pgSchema("auth").table("users", {
  id: uuid("id").primaryKey(),
});
