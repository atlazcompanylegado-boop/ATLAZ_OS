import { eq, and } from "drizzle-orm";
import { getDb } from "./client";
import { orgs, roles, users, memberships } from "./schema";

const ORG_SLUG = "atlaz"; // organização herdada do projeto anterior — não recriada aqui.
const SUPER_ADMIN_ROLE_KEY = "super_admin";

/**
 * Idempotente: pode rodar quantas vezes for preciso sem duplicar membership nem
 * rebaixar quem já é super_admin. Não cria usuário no Auth nem organização/papéis
 * (já existem, herdados — ver docs/banco.md §1). Só liga um `users`/`auth.users`
 * já existente ao papel super_admin. Executado via `npm run db:seed`.
 */
async function main() {
  const db = getDb();

  const [org] = await db.select().from(orgs).where(eq(orgs.slug, ORG_SLUG));
  if (!org) {
    throw new Error(
      `Organização "${ORG_SLUG}" não encontrada. Ela deveria já existir (herdada do projeto ` +
        `anterior) — confira se DATABASE_URL aponta para o projeto Supabase certo.`,
    );
  }
  console.log(`Organização OK: ${org.name} (${org.id})`);

  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!superAdminEmail) {
    console.log("SUPER_ADMIN_EMAIL não definido em .env.local — pulando bootstrap de super admin.");
    return;
  }

  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.orgId, org.id), eq(roles.key, SUPER_ADMIN_ROLE_KEY)));

  if (!role) {
    throw new Error(`Papel "${SUPER_ADMIN_ROLE_KEY}" não encontrado para ${org.name}.`);
  }

  const [profile] = await db.select().from(users).where(eq(users.email, superAdminEmail));

  if (!profile) {
    console.warn(
      `Nenhum registro em public.users para ${superAdminEmail}. O usuário precisa existir no ` +
        `Supabase Auth (signup/convite) — a trigger on_auth_user_created (migration 0001) cria o ` +
        `registro em public.users automaticamente nesse momento. Rode este seed de novo depois disso.`,
    );
    return;
  }

  const [existingMembership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, profile.id)));

  if (existingMembership) {
    if (existingMembership.roleId !== role.id) {
      await db.update(memberships).set({ roleId: role.id }).where(eq(memberships.id, existingMembership.id));
      console.log(`Membership existente promovida a super_admin para ${superAdminEmail}.`);
    } else {
      console.log(`${superAdminEmail} já é super_admin. Nada a fazer.`);
    }
    return;
  }

  await db.insert(memberships).values({ orgId: org.id, userId: profile.id, roleId: role.id });
  console.log(`Super admin criado para ${superAdminEmail}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
