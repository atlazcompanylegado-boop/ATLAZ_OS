import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

/**
 * Tipos compartilhados pelos repositories para aceitar tanto a conexão normal
 * quanto uma transação (`db.transaction(async (tx) => ...)`), sem duplicar
 * assinatura. `Transaction` é inferido da própria `Database["transaction"]` —
 * nunca diverge do tipo real do Drizzle.
 */
export type Database = PostgresJsDatabase<typeof schema>;

type TransactionParam = Parameters<Database["transaction"]>[0];
export type Transaction = TransactionParam extends (tx: infer T) => unknown ? T : never;

/** Repository aceita qualquer um dos dois — quem decide se é uma transação é o service. */
export type DbClient = Database | Transaction;
