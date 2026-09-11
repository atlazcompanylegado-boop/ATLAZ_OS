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
  // Só gerencia o schema "public" — auth.users pertence ao Supabase Auth e nunca
  // deve ser criado/alterado por uma migration deste projeto (ver schema/auth-users.ts).
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
