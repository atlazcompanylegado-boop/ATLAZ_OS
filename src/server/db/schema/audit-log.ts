import { pgTable, bigint, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { profiles } from "./profiles";

/** Trilha de auditoria — gravada sempre pela service layer, nunca pela UI (docs/seguranca.md §7). */
export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  orgId: uuid("org_id").references(() => organizations.id),
  actorId: uuid("actor_id").references(() => profiles.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
