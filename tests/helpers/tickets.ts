import { createTestDatabase, applyTestMigration } from "./database";
import { projects } from "@/server/db/schema";

export { ORG_A, ORG_B, projectMember, seedProjects, asProjectUser, type TestDatabase } from "./projects";

export async function ticketDatabase() {
  const database = await createTestDatabase();
  for (const file of ["0001_auth_sync_trigger.sql", "0002_clients.sql", "0003_client_event_security.sql", "0004_projects.sql", "0005_support.sql"]) {
    await applyTestMigration(database.pg, file);
  }
  return database;
}
export { projects };
