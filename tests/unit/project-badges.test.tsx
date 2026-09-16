import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { ProjectPriorityBadge } from "@/components/projects/priority-badge";
import { PROJECT_STATUSES, PROJECT_PRIORITIES, PROJECT_STATUS_LABELS, PROJECT_PRIORITY_LABELS } from "@/lib/validation/project";

describe("<ProjectStatusBadge />", () => {
  it.each(PROJECT_STATUSES)("renderiza o rótulo em português de %s", (status) => {
    render(<ProjectStatusBadge status={status} />);
    expect(screen.getByText(PROJECT_STATUS_LABELS[status])).toBeInTheDocument();
  });
});

describe("<ProjectPriorityBadge />", () => {
  it.each(PROJECT_PRIORITIES)("renderiza o rótulo em português de %s", (priority) => {
    render(<ProjectPriorityBadge priority={priority} />);
    expect(screen.getByText(PROJECT_PRIORITY_LABELS[priority])).toBeInTheDocument();
  });
});
