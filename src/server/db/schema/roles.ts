import { pgTable, uuid, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

/**
 * Papéis por organização (não enum — permite papel customizado por org no futuro).
 * `is_system` marca os 8 papéis padrão da Atlaz (ver docs/seguranca.md §2), que não
 * podem ser apagados pela UI.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("roles_org_id_key_key").on(table.orgId, table.key)],
);
