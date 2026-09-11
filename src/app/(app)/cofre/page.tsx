import { Lock } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function CofrePage() {
  return (
    <ModulePlaceholder
      title="Cofre"
      phase="Fase 1"
      icon={Lock}
      description="Credenciais criptografadas (Supabase Vault), com auditoria de acesso, mascaramento e segregação por cliente/projeto — ver docs/seguranca.md §5."
    />
  );
}
