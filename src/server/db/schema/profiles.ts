import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

/** Espelha auth.users 1:1 — populada por trigger no signup (ver migration de RLS/triggers). */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
