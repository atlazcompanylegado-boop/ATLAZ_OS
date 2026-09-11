import { describe, it, expect } from "vitest";
import { can } from "@/config/permissions";

describe("can()", () => {
  it("permite super_admin gerenciar membros", () => {
    expect(can("super_admin", "org.manage_members")).toBe(true);
  });

  it("nega desenvolvedor gerenciar membros", () => {
    expect(can("desenvolvedor", "org.manage_members")).toBe(false);
  });

  it("nega quando não há papel (usuário sem membership)", () => {
    expect(can(null, "org.manage_members")).toBe(false);
  });

  it("permite desenvolvedor ver credencial do cofre", () => {
    expect(can("desenvolvedor", "cofre.view_credential")).toBe(true);
  });
});
