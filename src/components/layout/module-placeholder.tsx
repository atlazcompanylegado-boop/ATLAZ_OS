import { type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

/**
 * Placeholder honesto para um módulo do roadmap que ainda não foi construído.
 * Nunca dado fabricado — só a intenção declarada e a fase prevista (docs/roadmap.md).
 */
export function ModulePlaceholder({
  title,
  phase,
  icon,
  description,
}: {
  title: string;
  phase: string;
  icon: LucideIcon;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[26px] text-ink-1">{title}</h1>
        <Badge variant="tag">{phase}</Badge>
      </div>
      <EmptyState
        icon={icon}
        title={`${title} ainda não foi implementado`}
        description={description}
      />
    </div>
  );
}
