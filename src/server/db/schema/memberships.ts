import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, timestamp, unique, foreignKey, check, index } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { users } from "./users";
import { roles } from "./roles";

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id").notNull(),
    jobTitle: text("job_title"),
    scope: text("scope").notNull().default("org"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("memberships_org_id_user_id_key").on(table.orgId, table.userId),
    foreignKey({ name: "memberships_org_id_fkey", columns: [table.orgId], foreignColumns: [orgs.id] }).onDelete("cascade"),
    foreignKey({ name: "memberships_user_id_fkey", columns: [table.userId], foreignColumns: [users.id] }).onDelete("cascade"),
    foreignKey({ name: "memberships_role_id_fkey", columns: [table.roleId], foreignColumns: [roles.id] }).onDelete("restrict"),
    check("memberships_scope_check", sql`${table.scope} in ('org', 'assigned')`),
    index("memberships_user_idx").on(table.userId),
    index("memberships_org_idx").on(table.orgId),
  ],
).enableRLS();
