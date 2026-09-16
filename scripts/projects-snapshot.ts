// Local metadata generation only; no database connection or SQL execution.
import { readFile, writeFile } from "node:fs/promises";
import { generateDrizzleJson } from "drizzle-kit/api";
import * as schema from "../src/server/db/schema";

async function main() {
  const folder = "src/server/db/migrations/meta";
  const previous = JSON.parse(await readFile(`${folder}/0003_snapshot.json`, "utf8"));
  const snapshot = generateDrizzleJson(schema, previous.id, ["public", "audit"]);
  for (const [key, table] of Object.entries(previous.tables)) {
    if (JSON.stringify(snapshot.tables[key]) !== JSON.stringify(table)) throw new Error(`Unexpected drift: ${key}`);
  }
  await writeFile(`${folder}/0004_snapshot.json`, JSON.stringify(snapshot, null, 2) + "\n");
  const journal = JSON.parse(await readFile(`${folder}/_journal.json`, "utf8"));
  if (!journal.entries.some((e: { idx: number }) => e.idx === 4)) {
    journal.entries.push({ idx: 4, version: "7", when: 1789488000000, tag: "0004_projects", breakpoints: true });
    await writeFile(`${folder}/_journal.json`, JSON.stringify(journal, null, 2) + "\n");
  }
  process.stdout.write("Snapshot 0004 generated; previous table definitions unchanged.\n");
}
void main();
