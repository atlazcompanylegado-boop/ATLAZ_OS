import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { users } from "./users";

/**
 * Timeline (ver docs/roadmap.md, item 29 do escopo original): eventos automáticos
 * ("Projeto criado", "Deploy realizado"...). Ainda sem produtor nesta fase — a tabela
 * já existe (herdada), o preenchimento real chega junto de Clientes/Projetos (Fase 1).
 */
export const activityEvents = pgTable("activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  payload: jsonb("payload").notNull().default({}),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  source: text("source").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
