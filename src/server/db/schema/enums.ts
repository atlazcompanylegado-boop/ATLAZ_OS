import { pgEnum } from "drizzle-orm/pg-core";

/** Papéis internos da Atlaz Company (ver docs/seguranca.md §2). */
export const appRole = pgEnum("app_role", [
  "super_admin",
  "ceo",
  "socio",
  "desenvolvedor",
  "designer",
  "social_media",
  "financeiro",
  "comercial",
]);
