import { Target } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function CrmPage() {
  return (
    <ModulePlaceholder
      title="CRM"
      phase="Fase 2"
      icon={Target}
      description="Funil Lead → Contato → Qualificação → Reunião → Proposta → Negociação → Fechado/Perdido."
    />
  );
}
