import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { clients } from "./clients";
import { memberships } from "./memberships";
import type { ProjectPriority, ProjectStatus } from "@/lib/validation/project";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  clientId: uuid("client_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").$type<ProjectStatus>().notNull().default("planning"),
  priority: text("priority").$type<ProjectPriority>().notNull().default("normal"),
  ownerUserId: uuid("owner_user_id"),
  startDate: date("start_date", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  progress: integer("progress"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
}, (t) => [
  unique("projects_org_id_id_key").on(t.orgId, t.id),
  // Aditiva (Checkpoint B de Suporte): permite a FK tripla de support_tickets(org_id, client_id, project_id)
  // referenciar projects(org_id, client_id, id), impedindo estruturalmente um chamado apontar para um
  // projeto de outro cliente. Não altera semântica de Projetos — nenhuma coluna, dado ou regra existente muda.
  unique("projects_org_client_id_key").on(t.orgId, t.clientId, t.id),
  foreignKey({ name: "projects_org_fkey", columns: [t.orgId], foreignColumns: [orgs.id] }).onDelete("restrict"),
  foreignKey({ name: "projects_client_fkey", columns: [t.orgId, t.clientId], foreignColumns: [clients.orgId, clients.id] }).onDelete("restrict"),
  foreignKey({ name: "projects_owner_fkey", columns: [t.orgId, t.ownerUserId], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  foreignKey({ name: "projects_creator_fkey", columns: [t.orgId, t.createdBy], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  index("projects_org_client_created_idx").on(t.orgId, t.clientId, t.createdAt.desc(), t.id),
  index("projects_org_created_idx").on(t.orgId, t.createdAt.desc(), t.id),
  index("projects_org_updated_idx").on(t.orgId, t.updatedAt.desc(), t.id),
  index("projects_org_name_idx").on(t.orgId, t.name, t.id),
  index("projects_org_status_idx").on(t.orgId, t.status),
  index("projects_org_owner_idx").on(t.orgId, t.ownerUserId).where(sql`${t.ownerUserId} is not null`),
  index("projects_org_due_idx").on(t.orgId, t.dueDate, t.id).where(sql`${t.dueDate} is not null`),
  check("projects_name_check", sql`${t.name} = btrim(${t.name}) and char_length(${t.name}) between 1 and 160`),
  check("projects_description_check", sql`${t.description} is null or (char_length(btrim(${t.description})) >= 1 and char_length(${t.description}) <= 10000)`),
  check("projects_status_check", sql`${t.status} in ('planning','active','paused','review','completed','cancelled')`),
  check("projects_priority_check", sql`${t.priority} in ('low','normal','high','urgent')`),
  check("projects_progress_check", sql`${t.progress} is null or ${t.progress} between 0 and 100`),
  check("projects_dates_check", sql`${t.startDate} is null or ${t.dueDate} is null or ${t.dueDate} >= ${t.startDate}`),
  check("projects_completed_check", sql`(${t.status} = 'completed' and ${t.completedAt} is not null and ${t.progress} is not null and ${t.progress} = 100) or (${t.status} <> 'completed' and ${t.completedAt} is null)`),
  check("projects_version_check", sql`${t.version} >= 1`),
]).enableRLS();
