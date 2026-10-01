import { Badge, type BadgeProps } from "@/components/ui/badge";
import { domainExpirationState, DOMAIN_EXPIRATION_STATE_LABELS } from "@/lib/domains/format";
import type { DomainStatus } from "@/lib/validation/domain";

/**
 * Badge de **situação de vencimento** — sempre separado do badge de **status** (Checkpoint A §19):
 * um domínio pode estar "Ativo" e "Vencido" ao mesmo tempo (renovação esquecida), e isso é
 * informação, não contradição. Tons por faixa exclusiva (Checkpoint A §20): `expired` é o único
 * `danger`; `due_*` são todos `warning` ("Vence em breve"); `ok`/`not_applicable` são neutros.
 */
const STATE_VARIANT: Record<ReturnType<typeof domainExpirationState>, NonNullable<BadgeProps["variant"]>> = {
  not_applicable: "neutral", expired: "danger", due_7: "warning", due_15: "warning",
  due_30: "warning", due_60: "warning", ok: "neutral",
};

export function DomainExpirationBadge({ expirationDate, status, className }: { expirationDate: string; status: DomainStatus; className?: string }) {
  const state = domainExpirationState(expirationDate, status);
  return (
    <Badge variant={STATE_VARIANT[state]} className={className}>
      {DOMAIN_EXPIRATION_STATE_LABELS[state]}
    </Badge>
  );
}
