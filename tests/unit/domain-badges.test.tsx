import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DomainStatusBadge } from "@/components/domains/status-badge";
import { DomainExpirationBadge } from "@/components/domains/expiration-badge";
import { DOMAIN_STATUSES, DOMAIN_STATUS_LABELS } from "@/lib/validation/domain";
import { DOMAIN_EXPIRATION_STATE_LABELS } from "@/lib/domains/format";

describe("<DomainStatusBadge />", () => {
  it.each(DOMAIN_STATUSES)("renderiza o rótulo em português de %s", (status) => {
    render(<DomainStatusBadge status={status} />);
    expect(screen.getByText(DOMAIN_STATUS_LABELS[status])).toBeInTheDocument();
  });
});

describe("<DomainExpirationBadge />", () => {
  it("vencido", () => {
    render(<DomainExpirationBadge expirationDate="2020-01-01" status="active" />);
    expect(screen.getByText(DOMAIN_EXPIRATION_STATE_LABELS.expired)).toBeInTheDocument();
  });
  it("em dia", () => {
    render(<DomainExpirationBadge expirationDate="2099-01-01" status="active" />);
    expect(screen.getByText(DOMAIN_EXPIRATION_STATE_LABELS.ok)).toBeInTheDocument();
  });
  it("vence em breve (due_7)", () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    render(<DomainExpirationBadge expirationDate={today} status="active" />);
    expect(screen.getByText(DOMAIN_EXPIRATION_STATE_LABELS.due_7)).toBeInTheDocument();
  });
  it("inactive nunca gera urgência (not_applicable), mesmo vencido", () => {
    render(<DomainExpirationBadge expirationDate="2020-01-01" status="inactive" />);
    expect(screen.getByText(DOMAIN_EXPIRATION_STATE_LABELS.not_applicable)).toBeInTheDocument();
  });
});
