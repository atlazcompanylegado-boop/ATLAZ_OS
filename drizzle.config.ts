import { defineConfig } from "drizzle-kit";

// Carregado via `tsx --env-file=.env.local` nos scripts db:*; drizzle-kit também lê
// .env.local automaticamente para os comandos `generate`/`studio`.
export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // "public" + "audit" são gerenciados por este projeto. "auth" NUNCA — auth.users
  // pertence ao Supabase Auth e não deve ser criado/alterado por uma migration daqui
  // (auth-users.ts é referência externa e não é exportada pelo schema gerenciado).
  schemaFilter: ["public", "audit"],
  strict: true,
  verbose: true,
});
