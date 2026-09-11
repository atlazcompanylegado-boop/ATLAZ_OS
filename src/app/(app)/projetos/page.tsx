import { FolderKanban } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function ProjetosPage() {
  return (
    <ModulePlaceholder
      title="Projetos"
      phase="Fase 1"
      icon={FolderKanban}
      description="Cadastro de projetos por cliente: tipo, status, stack, ambientes, repositório e integração futura com GitHub/Deploy."
    />
  );
}
