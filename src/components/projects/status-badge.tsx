import { Badge, type BadgeProps } from "@/components/ui/badge";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/validation/project";

/** Uma cor por status — nunca todo mundo vermelho (mesmo critério do Badge de Clientes). */
const STATUS_VARIANT: Record<ProjectStatus, NonNullable<BadgeProps["variant"]>> = {
  planning: "neutral",
  active: "accent",
  paused: "warning",
  review: "warning",
  completed: "success",
  cancelled: "danger",
};

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}
