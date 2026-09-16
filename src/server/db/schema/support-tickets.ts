import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { clients } from "./clients";
import { projects } from "./projects";
import { memberships } from "./memberships";
import type { TicketPriority, TicketStatus } from "@/lib/validation/ticket";

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Gerado pelo banco (IDENTITY) — nunca definido pela aplicação. Ver docs/suporte-checkpoint-b.md §9. */
  ticketNumber: bigint("ticket_number", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
  orgId: uuid("org_id").notNull(),
  clientId: uuid("client_id").notNull(),
  projectId: uuid("project_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").$type<TicketStatus>().notNull().default("open"),
  priority: text("priority").$type<TicketPriority>().notNull().default("normal"),
  assignedUserId: uuid("assigned_user_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
}, (t) => [
  unique("support_tickets_org_id_id_key").on(t.orgId, t.id),
  unique("support_tickets_ticket_number_key").on(t.ticketNumber),
  foreignKey({ name: "support_tickets_org_fkey", columns: [t.orgId], foreignColumns: [orgs.id] }).onDelete("restrict"),
  foreignKey({ name: "support_tickets_client_fkey", columns: [t.orgId, t.clientId], foreignColumns: [clients.orgId, clients.id] }).onDelete("restrict"),
  // FK tripla estrutural: se project_id for informado, precisa pertencer exatamente ao mesmo cliente do chamado.
  // MATCH SIMPLE (padrão do Postgres) não avalia a constraint quando project_id é NULL.
  foreignKey({ name: "support_tickets_project_fkey", columns: [t.orgId, t.clientId, t.projectId], foreignColumns: [projects.orgId, projects.clientId, projects.id] }).onDelete("restrict"),
  foreignKey({ name: "support_tickets_assignee_fkey", columns: [t.orgId, t.assignedUserId], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  foreignKey({ name: "support_tickets_creator_fkey", columns: [t.orgId, t.createdBy], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  index("support_tickets_org_created_idx").on(t.orgId, t.createdAt.desc(), t.id),
  index("support_tickets_org_updated_idx").on(t.orgId, t.updatedAt.desc(), t.id),
  index("support_tickets_org_client_idx").on(t.orgId, t.clientId, t.createdAt.desc(), t.id),
  index("support_tickets_org_project_idx").on(t.orgId, t.projectId).where(sql`${t.projectId} is not null`),
  index("support_tickets_org_status_idx").on(t.orgId, t.status),
  index("support_tickets_org_priority_idx").on(t.orgId, t.priority),
  index("support_tickets_org_assignee_idx").on(t.orgId, t.assignedUserId).where(sql`${t.assignedUserId} is not null`),
  index("support_tickets_org_due_idx").on(t.orgId, t.dueAt, t.id).where(sql`${t.dueAt} is not null`),
  check("support_tickets_title_check", sql`${t.title} = btrim(${t.title}) and char_length(${t.title}) between 1 and 160`),
  check("support_tickets_description_check", sql`char_length(btrim(${t.description})) >= 1 and char_length(${t.description}) <= 10000`),
  check("support_tickets_status_check", sql`${t.status} in ('open','triage','in_progress','waiting_client','resolved','cancelled')`),
  check("support_tickets_priority_check", sql`${t.priority} in ('low','normal','high','critical')`),
  // resolved exige resolved_at preenchido; qualquer outro status (incluindo cancelled) exige resolved_at NULL — nunca finge resolução.
  check("support_tickets_resolved_check", sql`(${t.status} = 'resolved' and ${t.resolvedAt} is not null) or (${t.status} <> 'resolved' and ${t.resolvedAt} is null)`),
  check("support_tickets_version_check", sql`${t.version} >= 1`),
]).enableRLS();
