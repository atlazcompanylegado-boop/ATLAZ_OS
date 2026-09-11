import { pgSchema, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { users } from "./users";

/** Trilha de auditoria — schema próprio ("audit"), gravada só pela service layer. */
export const auditSchema = pgSchema("audit");

export const auditLog = auditSchema.table("log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => orgs.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  actorLabel: text("actor_label"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  context: jsonb("context"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
