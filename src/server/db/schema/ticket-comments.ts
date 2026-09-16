import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { supportTickets } from "./support-tickets";
import { memberships } from "./memberships";

/** Comentários são imutáveis na V1: sem `updated_at`, sem `version`, sem exclusão (ver docs/suporte-checkpoint-a.md §11). */
export const ticketComments = pgTable("ticket_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  ticketId: uuid("ticket_id").notNull(),
  authorUserId: uuid("author_user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "ticket_comments_org_fkey", columns: [t.orgId], foreignColumns: [orgs.id] }).onDelete("restrict"),
  foreignKey({ name: "ticket_comments_ticket_fkey", columns: [t.orgId, t.ticketId], foreignColumns: [supportTickets.orgId, supportTickets.id] }).onDelete("restrict"),
  foreignKey({ name: "ticket_comments_author_fkey", columns: [t.orgId, t.authorUserId], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  index("ticket_comments_ticket_created_idx").on(t.orgId, t.ticketId, t.createdAt, t.id),
  check("ticket_comments_content_check", sql`char_length(btrim(${t.content})) >= 1 and char_length(${t.content}) <= 10000`),
]).enableRLS();
