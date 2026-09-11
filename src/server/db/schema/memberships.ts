import { pgTable, uuid, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { users } from "./users";
import { roles } from "./roles";

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    jobTitle: text("job_title"),
    scope: text("scope").notNull().default("org"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("memberships_org_id_user_id_key").on(table.orgId, table.userId)],
);
