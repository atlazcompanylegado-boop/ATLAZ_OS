import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

/**
 * Perfil interno — desacoplado de `auth.users` por `auth_user_id` (em vez de reusar o
 * mesmo uuid como PK). Populado por trigger no signup (ver migration 0000_baseline).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id")
    .notNull()
    .unique()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
