import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Organização (hoje só "Atlaz Company", slug "atlaz"). Herdada do projeto anterior —
 * este projeto Supabase já continha essa tabela (com dado real) quando adotado como
 * base do ATLΛZ OS; ver docs/banco.md §1 "Baseline herdado".
 */
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
