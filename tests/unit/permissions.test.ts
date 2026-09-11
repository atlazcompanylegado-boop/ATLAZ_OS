import { describe, it, expect } from "vitest";
import { can } from "@/config/permissions";

describe("can()", () => {
  it("permite quando a permissão está na lista carregada para a sessão", () => {
    expect(can(["team:read", "team:manage"], "team:manage")).toBe(true);
  });

  it("nega quando a permissão não está na lista", () => {
    expect(can(["team:read"], "team:manage")).toBe(false);
  });

  it("nega quando não há permissões carregadas (sem membership)", () => {
    expect(can(undefined, "team:manage")).toBe(false);
  });

  it("nega lista vazia", () => {
    expect(can([], "vault:reveal")).toBe(false);
  });
});
