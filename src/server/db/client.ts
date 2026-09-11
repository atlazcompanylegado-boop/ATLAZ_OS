import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let dbInstance: PostgresJsDatabase<typeof schema> | undefined;

/**
 * Conexão preguiçosa — só é criada na primeira query real, nunca no import do módulo.
 * Necessário porque o Next.js avalia o grafo de módulos de toda rota (mesmo dinâmica)
 * durante o build ("Collecting page data"); validar DATABASE_URL no topo do módulo
 * quebraria `next build` em qualquer ambiente sem .env.local (ex.: CI de lint/typecheck).
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (dbInstance) return dbInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.local e preencha.");
  }

  // Uma única conexão (pool) reaproveitada entre requests — nunca abrir conexão por request.
  const client = postgres(connectionString, { prepare: false });
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}
