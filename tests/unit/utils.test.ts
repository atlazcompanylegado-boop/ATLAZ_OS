import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn()", () => {
  it("junta classes condicionais", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("resolve conflito de utilitário Tailwind (o último vence)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
