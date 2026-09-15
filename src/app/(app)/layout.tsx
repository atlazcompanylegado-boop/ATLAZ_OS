import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { Shell } from "@/components/layout/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Segunda checagem além do middleware — nunca confiar só nele (docs/seguranca.md §1).
  if (!user) {
    redirect("/login");
  }

  const userLabel = user.user_metadata?.full_name ?? user.email ?? "Usuário Atlaz";

  // Só para decidir quais itens de navegação aparecem (ex.: Clientes exige
  // `client:read`); a autorização de verdade continua sendo feita por cada
  // página/service — isto nunca é a única barreira.
  const session = await getCurrentSession();
  const permissions = session?.membership?.permissions;

  return (
    <Shell userLabel={userLabel} permissions={permissions}>
      {children}
    </Shell>
  );
}
