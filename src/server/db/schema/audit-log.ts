import { pgSchema, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/** Trilha de auditoria — schema próprio ("audit"), gravada só pela service layer. */
export const auditSchema = pgSchema("audit");

export const auditLog = auditSchema.table("log", {
  id: uuid("id").primaryKey().defaultRandom(),
  // A tabela herdada preserva identificadores históricos sem FKs.
  orgId: uuid("org_id").notNull(),
  actorUserId: uuid("actor_user_id"),
  actorLabel: text("actor_label").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  context: jsonb("context").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_log_org_at_idx").on(table.orgId, table.at.desc().nullsFirst()),
  index("audit_log_entity_idx").on(table.entityType, table.entityId),
]).enableRLS();
