import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  return <Shell userLabel={userLabel}>{children}</Shell>;
}
