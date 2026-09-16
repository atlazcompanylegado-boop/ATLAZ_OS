import { Badge, type BadgeProps } from "@/components/ui/badge";
import { TICKET_PRIORITY_LABELS, type TicketPriority } from "@/lib/validation/ticket";

/** Escalada visual discreta — só "Crítica" usa o tom de perigo (vermelho pontual, não decorativo). */
const PRIORITY_VARIANT: Record<TicketPriority, NonNullable<BadgeProps["variant"]>> = {
  low: "tag",
  normal: "neutral",
  high: "warning",
  critical: "danger",
};

export function TicketPriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority]} className={className}>
      {TICKET_PRIORITY_LABELS[priority]}
    </Badge>
  );
}
