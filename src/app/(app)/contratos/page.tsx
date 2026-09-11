import { FileSignature } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function ContratosPage() {
  return (
    <ModulePlaceholder
      title="Contratos"
      phase="Fase 2"
      icon={FileSignature}
      description="Contratos por cliente/projeto: vigência, valor, renovação, aditivos e alertas de vencimento."
    />
  );
}
