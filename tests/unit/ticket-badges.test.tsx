import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TicketStatusBadge } from "@/components/support/status-badge";
import { TicketPriorityBadge } from "@/components/support/priority-badge";
import { TICKET_STATUSES, TICKET_PRIORITIES, TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS } from "@/lib/validation/ticket";

describe("<TicketStatusBadge />", () => {
  it.each(TICKET_STATUSES)("renderiza o rótulo em português de %s", (status) => {
    render(<TicketStatusBadge status={status} />);
    expect(screen.getByText(TICKET_STATUS_LABELS[status])).toBeInTheDocument();
  });
});

describe("<TicketPriorityBadge />", () => {
  it.each(TICKET_PRIORITIES)("renderiza o rótulo em português de %s", (priority) => {
    render(<TicketPriorityBadge priority={priority} />);
    expect(screen.getByText(TICKET_PRIORITY_LABELS[priority])).toBeInTheDocument();
  });
});
