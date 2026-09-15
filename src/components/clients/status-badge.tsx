import { Badge, type BadgeProps } from "@/components/ui/badge";
import { CLIENT_STATUS_LABELS, type ClientStatus } from "@/lib/validation/client";

/** Uma cor por status — nunca todo mundo vermelho (ver docs/clientes: item 61). */
const STATUS_VARIANT: Record<ClientStatus, NonNullable<BadgeProps["variant"]>> = {
  lead: "neutral",
  onboarding: "accent",
  active: "success",
  paused: "warning",
  closed: "danger",
};

export function ClientStatusBadge({ status, className }: { status: ClientStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {CLIENT_STATUS_LABELS[status]}
    </Badge>
  );
}
