import { describe, it, expect } from "vitest";
import { getVisibleFlatNavigation } from "@/config/navigation";

function labels(permissions: string[] | undefined) {
  return getVisibleFlatNavigation(permissions).map((item) => item.label);
}

describe("navegação — Projetos exige as duas permissões (Checkpoint C2)", () => {
  it("some sem nenhuma permissão", () => {
    expect(labels([])).not.toContain("Projetos");
  });
  it("some com só project:read", () => {
    expect(labels(["project:read"])).not.toContain("Projetos");
  });
  it("some com só client:read", () => {
    expect(labels(["client:read"])).not.toContain("Projetos");
  });
  it("aparece com as duas permissões", () => {
    expect(labels(["project:read", "client:read"])).toContain("Projetos");
  });
  it("item de permissão única (Clientes) continua funcionando sem regressão", () => {
    expect(labels([])).not.toContain("Clientes");
    expect(labels(["client:read"])).toContain("Clientes");
  });
  it("item sem permissão declarada (Equipe) sempre visível", () => {
    expect(labels([])).toContain("Equipe");
  });
});

describe("navegação — Suporte exige as duas permissões (Checkpoint C2)", () => {
  it("some sem nenhuma permissão", () => {
    expect(labels([])).not.toContain("Suporte");
  });
  it("some com só ticket:read", () => {
    expect(labels(["ticket:read"])).not.toContain("Suporte");
  });
  it("some com só client:read", () => {
    expect(labels(["client:read"])).not.toContain("Suporte");
  });
  it("aparece com as duas permissões", () => {
    expect(labels(["ticket:read", "client:read"])).toContain("Suporte");
  });
  it("Clientes e Projetos continuam sem regressão", () => {
    expect(labels(["client:read", "project:read", "ticket:read"])).toEqual(
      expect.arrayContaining(["Clientes", "Projetos", "Suporte"]),
    );
  });
});
