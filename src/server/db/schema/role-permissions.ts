import { pgTable, uuid, text, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { roles } from "./roles";
import { permissions } from "./permissions";

/** Concede uma permissão a um papel. RBAC granular de verdade — ver docs/seguranca.md §2. */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull(),
    permissionKey: text("permission_key").notNull(),
  },
  (table) => [
    primaryKey({ name: "role_permissions_pkey", columns: [table.roleId, table.permissionKey] }),
    foreignKey({ name: "role_permissions_role_id_fkey", columns: [table.roleId], foreignColumns: [roles.id] }).onDelete("cascade"),
    foreignKey({ name: "role_permissions_permission_key_fkey", columns: [table.permissionKey], foreignColumns: [permissions.key] }).onDelete("cascade"),
  ],
).enableRLS();
