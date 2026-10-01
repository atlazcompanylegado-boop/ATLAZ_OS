import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { clients } from "./clients";
import { projects } from "./projects";
import { memberships } from "./memberships";
import type { DomainAutoRenewStatus, DomainStatus } from "@/lib/validation/domain";

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  clientId: uuid("client_id").notNull(),
  projectId: uuid("project_id"),
  /** Forma canônica: ASCII/punycode, minúsculas, sem ponto final (ver docs/dominios-checkpoint-a.md §10). */
  domainName: text("domain_name").notNull(),
  registrar: text("registrar"),
  registrationDate: date("registration_date", { mode: "string" }),
  expirationDate: date("expiration_date", { mode: "string" }).notNull(),
  autoRenewStatus: text("auto_renew_status").$type<DomainAutoRenewStatus>().notNull().default("unknown"),
  status: text("status").$type<DomainStatus>().notNull().default("active"),
  ownerUserId: uuid("owner_user_id"),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
}, (t) => [
  unique("domains_org_id_id_key").on(t.orgId, t.id),
  // Único domínio "vivo" por org — um domain_name inativado pode ser recadastrado depois,
  // inclusive para outro Cliente (docs/dominios-checkpoint-a.md §13, decisão D6). Unicidade
  // parcial exige índice, não constraint: UNIQUE ... WHERE não é uma CONSTRAINT válida no Postgres.
  uniqueIndex("domains_org_active_name_key").on(t.orgId, t.domainName).where(sql`${t.status} <> 'inactive'`),
  foreignKey({ name: "domains_org_fkey", columns: [t.orgId], foreignColumns: [orgs.id] }).onDelete("restrict"),
  foreignKey({ name: "domains_client_fkey", columns: [t.orgId, t.clientId], foreignColumns: [clients.orgId, clients.id] }).onDelete("restrict"),
  // FK tripla estrutural — reaproveita o UNIQUE(org_id, client_id, id) aditivo já criado em
  // projects pela 0005 (Suporte); nenhuma constraint nova em projects é necessária aqui.
  // MATCH SIMPLE (padrão do Postgres) não avalia quando project_id é NULL.
  foreignKey({ name: "domains_project_fkey", columns: [t.orgId, t.clientId, t.projectId], foreignColumns: [projects.orgId, projects.clientId, projects.id] }).onDelete("restrict"),
  foreignKey({ name: "domains_owner_fkey", columns: [t.orgId, t.ownerUserId], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  foreignKey({ name: "domains_creator_fkey", columns: [t.orgId, t.createdBy], foreignColumns: [memberships.orgId, memberships.userId] }).onDelete("restrict"),
  index("domains_org_client_idx").on(t.orgId, t.clientId, t.createdAt.desc(), t.id),
  index("domains_org_project_idx").on(t.orgId, t.projectId).where(sql`${t.projectId} is not null`),
  index("domains_org_status_idx").on(t.orgId, t.status),
  index("domains_org_expiration_idx").on(t.orgId, t.expirationDate, t.id),
  index("domains_org_owner_idx").on(t.orgId, t.ownerUserId).where(sql`${t.ownerUserId} is not null`),
  index("domains_org_created_idx").on(t.orgId, t.createdAt.desc(), t.id),
  index("domains_org_updated_idx").on(t.orgId, t.updatedAt.desc(), t.id),
  // domain_name já é canônico (minúsculas, ASCII, sem ponto final) — CHECK como defesa em
  // profundidade, redundante com a normalização da aplicação, nunca a única barreira.
  check("domains_name_check", sql`${t.domainName} = lower(${t.domainName}) and ${t.domainName} !~ '\\.$' and char_length(${t.domainName}) between 1 and 253`),
  check("domains_registrar_check", sql`${t.registrar} is null or (char_length(btrim(${t.registrar})) >= 1 and char_length(${t.registrar}) <= 160)`),
  check("domains_notes_check", sql`${t.notes} is null or (char_length(btrim(${t.notes})) >= 1 and char_length(${t.notes}) <= 2000)`),
  check("domains_status_check", sql`${t.status} in ('active','transferring','inactive')`),
  check("domains_auto_renew_check", sql`${t.autoRenewStatus} in ('configured','disabled','unknown')`),
  check("domains_dates_check", sql`${t.registrationDate} is null or ${t.expirationDate} >= ${t.registrationDate}`),
  check("domains_version_check", sql`${t.version} >= 1`),
]).enableRLS();
