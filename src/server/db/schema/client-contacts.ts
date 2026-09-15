import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { memberships } from "./memberships";

export const clientContacts = pgTable("client_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  clientId: uuid("client_id").notNull(),
  name: text("name").notNull(),
  jobTitle: text("job_title"),
  type: text("type"),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  isPrimary: boolean("is_primary").notNull().default(false),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "client_contacts_client_fkey", columns: [table.orgId, table.clientId], foreignColumns: [clients.orgId, clients.id] }).onDelete("restrict"),
  foreignKey({ name: "client_contacts_creator_membership_fkey", columns: [table.orgId, table.createdBy], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  uniqueIndex("client_contacts_primary_key").on(table.orgId, table.clientId).where(sql`${table.isPrimary}`),
  index("client_contacts_client_idx").on(table.orgId, table.clientId, table.name, table.id),
  check("client_contacts_name_check", sql`char_length(btrim(${table.name})) between 1 and 160`),
  check("client_contacts_job_title_check", sql`${table.jobTitle} is null or char_length(btrim(${table.jobTitle})) between 1 and 120`),
  check("client_contacts_type_check", sql`${table.type} is null or char_length(btrim(${table.type})) between 1 and 60`),
  check("client_contacts_email_check", sql`${table.email} is null or (char_length(${table.email}) <= 254 and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')`),
  check("client_contacts_phone_check", sql`${table.phone} is null or ${table.phone} ~ '^[0-9]{8,15}$'`),
  check("client_contacts_whatsapp_check", sql`${table.whatsapp} is null or ${table.whatsapp} ~ '^[0-9]{8,15}$'`),
  check("client_contacts_notes_check", sql`${table.notes} is null or char_length(${table.notes}) <= 5000`),
]).enableRLS();
