import { Megaphone } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function MarketingPage() {
  return (
    <ModulePlaceholder
      title="Marketing"
      phase="Fase 3"
      icon={Megaphone}
      description="Dashboard de marketing, campanhas, calendário editorial e banco de ideias."
    />
  );
}
