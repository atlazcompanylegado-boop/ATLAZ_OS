import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { profiles } from "./profiles";
import { appRole } from "./enums";

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: appRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("memberships_org_user_unique").on(table.orgId, table.userId)],
);
