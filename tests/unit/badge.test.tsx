import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("<Badge />", () => {
  it("renderiza o texto passado", () => {
    render(<Badge>super_admin</Badge>);
    expect(screen.getByText("super_admin")).toBeInTheDocument();
  });
});
