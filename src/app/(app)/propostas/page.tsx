import { FileText } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function PropostasPage() {
  return (
    <ModulePlaceholder
      title="Propostas"
      phase="Fase 2"
      icon={FileText}
      description="Propostas comerciais com escopo, prazo e valor — aprovação converte automaticamente em cliente/projeto."
    />
  );
}
