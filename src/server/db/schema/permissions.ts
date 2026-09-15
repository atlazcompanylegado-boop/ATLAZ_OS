import { pgTable, text } from "drizzle-orm/pg-core";

/**
 * Catálogo global de permissões granulares ("resource:action", ex.: "client:read").
 * Único lugar onde uma permissão é definida — módulo novo soma linhas aqui (via
 * migration), nunca inventa uma checagem de string solta em código.
 */
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  description: text("description").notNull(),
}).enableRLS();
