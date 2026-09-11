import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Executado via `npm run db:migrate` (tsx --env-file=.env.local). Nunca importado pela app. */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada em .env.local.");
  }

  // prepare:false — necessário se DATABASE_URL apontar para o connection pooler do
  // Supabase (porta 6543, PgBouncer em modo transaction), que não sustenta prepared
  // statements entre comandos. Inofensivo também na conexão direta (porta 5432).
  const migrationClient = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(migrationClient);

  console.log("Aplicando migrations em src/server/db/migrations ...");
  await migrate(db, { migrationsFolder: "./src/server/db/migrations" });
  console.log("Migrations aplicadas com sucesso.");

  await migrationClient.end();
}

main().catch((err) => {
  console.error("Falha ao aplicar migrations:", err);
  process.exit(1);
});
