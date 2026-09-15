import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Perfil interno sincronizado pela migration 0001. auth_user_id é único, mas
 * não possui FK no banco herdado; a representação não deve inventar essa FK.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id")
    .notNull()
    .unique("users_auth_user_id_key"),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("users_email_key").on(sql`lower(${table.email})`)]).enableRLS();
