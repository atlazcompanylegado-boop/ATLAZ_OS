import { Badge, type BadgeProps } from "@/components/ui/badge";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/validation/ticket";

/** Uma cor por status — nunca todo mundo vermelho (mesmo critério dos Badges de Clientes/Projetos). */
const STATUS_VARIANT: Record<TicketStatus, NonNullable<BadgeProps["variant"]>> = {
  open: "neutral",
  triage: "warning",
  in_progress: "accent",
  waiting_client: "warning",
  resolved: "success",
  cancelled: "danger",
};

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}
