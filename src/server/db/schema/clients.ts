import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { memberships } from "./memberships";
import { orgs } from "./orgs";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  name: text("name").notNull(),
  tradeName: text("trade_name"),
  legalName: text("legal_name"),
  personType: text("person_type").$type<"individual" | "company">(),
  /** Sem máscara; CPF numérico ou CNPJ numérico/alfanumérico em maiúsculas. */
  document: text("document"),
  status: text("status").$type<"lead" | "onboarding" | "active" | "paused" | "closed">().notNull().default("lead"),
  source: text("source"),
  ownerUserId: uuid("owner_user_id"),
  website: text("website"),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
}, (table) => [
  unique("clients_org_id_id_key").on(table.orgId, table.id),
  foreignKey({ name: "clients_org_id_fkey", columns: [table.orgId], foreignColumns: [orgs.id] }).onDelete("restrict"),
  foreignKey({ name: "clients_owner_membership_fkey", columns: [table.orgId, table.ownerUserId], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  foreignKey({ name: "clients_creator_membership_fkey", columns: [table.orgId, table.createdBy], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  uniqueIndex("clients_org_document_key").on(table.orgId, table.document).where(sql`${table.document} is not null`),
  index("clients_org_created_idx").on(table.orgId, table.createdAt.desc().nullsFirst(), table.id),
  index("clients_org_updated_idx").on(table.orgId, table.updatedAt.desc().nullsFirst(), table.id),
  index("clients_org_name_idx").on(table.orgId, table.name, table.id),
  index("clients_org_status_idx").on(table.orgId, table.status),
  index("clients_org_owner_idx").on(table.orgId, table.ownerUserId).where(sql`${table.ownerUserId} is not null`),
  check("clients_name_check", sql`char_length(btrim(${table.name})) between 1 and 160`),
  check("clients_trade_name_check", sql`${table.tradeName} is null or char_length(btrim(${table.tradeName})) between 1 and 160`),
  check("clients_legal_name_check", sql`${table.legalName} is null or char_length(btrim(${table.legalName})) between 1 and 200`),
  check("clients_person_type_check", sql`${table.personType} is null or ${table.personType} in ('individual', 'company')`),
  check("clients_document_check", sql`${table.document} is null or (${table.personType} is not null and ((${table.personType} = 'individual' and ${table.document} ~ '^[0-9]{11}$') or (${table.personType} = 'company' and ${table.document} ~ '^[A-Z0-9]{12}[0-9]{2}$')))`),
  check("clients_status_check", sql`${table.status} in ('lead', 'onboarding', 'active', 'paused', 'closed')`),
  check("clients_source_check", sql`${table.source} is null or char_length(btrim(${table.source})) between 1 and 120`),
  check("clients_website_check", sql`${table.website} is null or (char_length(${table.website}) <= 2048 and ${table.website} ~ '^https?://[^[:space:]]+$')`),
  check("clients_notes_check", sql`${table.notes} is null or char_length(${table.notes}) <= 10000`),
  check("clients_version_check", sql`${table.version} >= 1`),
]).enableRLS();
