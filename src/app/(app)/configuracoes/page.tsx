import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function ConfiguracoesPage() {
  return (
    <ModulePlaceholder
      title="Configurações"
      phase="Fase 1"
      icon={Settings}
      description="Preferências da organização, integrações e da conta."
    />
  );
}
