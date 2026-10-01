import { Badge, type BadgeProps } from "@/components/ui/badge";
import { DOMAIN_STATUS_LABELS, type DomainStatus } from "@/lib/validation/domain";

/** Uma cor por status — nunca todo mundo vermelho (mesmo critério dos Badges de Clientes/Projetos/Suporte). */
const STATUS_VARIANT: Record<DomainStatus, NonNullable<BadgeProps["variant"]>> = {
  active: "success",
  transferring: "warning",
  inactive: "neutral",
};

export function DomainStatusBadge({ status, className }: { status: DomainStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {DOMAIN_STATUS_LABELS[status]}
    </Badge>
  );
}
