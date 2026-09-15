import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/server/db/schema";

/** Sem URL/conexão externa: cada suíte recebe um PostgreSQL efêmero em memória. */
export async function createTestDatabase() {
  const pg = new PGlite();
  await pg.exec(await readFile(path.resolve("tests/fixtures/foundation.sql"), "utf8"));
  return { pg, db: drizzle(pg, { schema }) };
}

export async function applyTestMigration(pg: PGlite, name: string) {
  const migration = await readFile(path.resolve("src/server/db/migrations", name), "utf8");
  await pg.transaction(async (tx) => { await tx.exec(migration); });
}
