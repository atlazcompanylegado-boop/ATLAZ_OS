import { pgTable, uuid, text, jsonb, timestamp, foreignKey, index } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { users } from "./users";

/**
 * Timeline (ver docs/roadmap.md, item 29 do escopo original): eventos automáticos
 * ("Projeto criado", "Deploy realizado"...). Ainda sem produtor nesta fase — a tabela
 * já existe (herdada), o preenchimento real chega junto de Clientes/Projetos (Fase 1).
 */
export const activityEvents = pgTable("activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  payload: jsonb("payload").notNull().default({}),
  actorUserId: uuid("actor_user_id"),
  source: text("source").notNull().default("app"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "activity_events_org_id_fkey", columns: [table.orgId], foreignColumns: [orgs.id] }).onDelete("cascade"),
  foreignKey({ name: "activity_events_actor_user_id_fkey", columns: [table.actorUserId], foreignColumns: [users.id] }).onDelete("set null"),
  index("activity_entity_idx").on(table.entityType, table.entityId, table.occurredAt.desc().nullsFirst()),
  index("activity_org_idx").on(table.orgId, table.occurredAt.desc().nullsFirst()),
]).enableRLS();
