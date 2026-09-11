import { Clapperboard } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function AtlasStudioPage() {
  return (
    <ModulePlaceholder
      title="Atlas Studio"
      phase="Fase 4"
      icon={Clapperboard}
      description="Editor interno de imagem (crop, resize, texto, marca d'água, presets Atlaz) e, depois, de vídeo."
    />
  );
}
