import { Badge, type BadgeProps } from "@/components/ui/badge";
import { PROJECT_PRIORITY_LABELS, type ProjectPriority } from "@/lib/validation/project";

/** Escalada visual discreta — só "urgente" usa o tom de perigo (vermelho pontual, não decorativo). */
const PRIORITY_VARIANT: Record<ProjectPriority, NonNullable<BadgeProps["variant"]>> = {
  low: "tag",
  normal: "neutral",
  high: "warning",
  urgent: "danger",
};

export function ProjectPriorityBadge({ priority, className }: { priority: ProjectPriority; className?: string }) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority]} className={className}>
      {PROJECT_PRIORITY_LABELS[priority]}
    </Badge>
  );
}
