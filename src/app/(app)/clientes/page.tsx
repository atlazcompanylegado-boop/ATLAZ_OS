import { Users } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function ClientesPage() {
  return (
    <ModulePlaceholder
      title="Clientes"
      phase="Fase 1"
      icon={Users}
      description="Ficha Mestre de clientes: visão geral, projetos, infraestrutura, domínios, e-mails, financeiro, contratos, chamados, documentos, timeline e acessos — ver docs/roadmap.md."
    />
  );
}
