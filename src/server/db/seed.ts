import { eq, and } from "drizzle-orm";
import { getDb } from "./client";
import { organizations, profiles, memberships } from "./schema";

const ORG_SLUG = "atlaz-company";
const ORG_NAME = "Atlaz Company";

/**
 * Idempotente: pode rodar quantas vezes for preciso sem duplicar organização/membership
 * nem rebaixar quem já é super_admin. Não cria usuário no Auth — ver docs/seguranca.md §4.
 * Executado via `npm run db:seed`.
 */
async function main() {
  const db = getDb();
  const [existingOrg] = await db.select().from(organizations).where(eq(organizations.slug, ORG_SLUG));
  const [org] = existingOrg
    ? [existingOrg]
    : await db.insert(organizations).values({ name: ORG_NAME, slug: ORG_SLUG }).returning();

  if (!org) throw new Error("Falha ao garantir a organização Atlaz Company.");
  console.log(`Organização OK: ${org.name} (${org.id})`);

  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!superAdminEmail) {
    console.log("SUPER_ADMIN_EMAIL não definido em .env.local — pulando bootstrap de super admin.");
    return;
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.email, superAdminEmail));

  if (!profile) {
    console.warn(
      `Nenhum profile encontrado para ${superAdminEmail}. O usuário precisa existir no Supabase Auth ` +
        `(signup/convite) antes do bootstrap — rode este seed de novo depois disso.`,
    );
    return;
  }

  const [existingMembership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, profile.id)));

  if (existingMembership) {
    if (existingMembership.role !== "super_admin") {
      await db
        .update(memberships)
        .set({ role: "super_admin" })
        .where(eq(memberships.id, existingMembership.id));
      console.log(`Membership existente promovida a super_admin para ${superAdminEmail}.`);
    } else {
      console.log(`${superAdminEmail} já é super_admin. Nada a fazer.`);
    }
    return;
  }

  await db.insert(memberships).values({ orgId: org.id, userId: profile.id, role: "super_admin" });
  console.log(`Super admin criado para ${superAdminEmail}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
