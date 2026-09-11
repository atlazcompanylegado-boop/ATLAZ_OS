import { LifeBuoy } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function SuportePage() {
  return (
    <ModulePlaceholder
      title="Suporte"
      phase="Fase 1"
      icon={LifeBuoy}
      description="Chamados por cliente/projeto, prioridade, categoria, responsável e regras de cobrança de suporte."
    />
  );
}
