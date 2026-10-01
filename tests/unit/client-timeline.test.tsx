import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientTimeline } from "@/components/clients/client-timeline";
import type { ClientTimelineEntry } from "@/server/repositories/client-timeline-repository";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function entry(overrides: Partial<ClientTimelineEntry>): ClientTimelineEntry {
  return {
    id: crypto.randomUUID(),
    kind: "client.created",
    summary: "",
    actorName: "Ana",
    occurredAt: new Date("2026-09-15T12:00:00Z"),
    projectName: null,
    ticketNumber: null,
    domainName: null,
    ...overrides,
  };
}

/** total === entries.length em todos os cenários abaixo: "Carregar mais" (que usa next/link) não entra em jogo, fora do escopo desta correção visual. */
function renderTimeline(entries: ClientTimelineEntry[]) {
  return render(<ClientTimeline clientId="11111111-1111-4111-8111-111111111111" entries={entries} total={entries.length} page={1} pageSize={20} />);
}

describe("<ClientTimeline /> — tradução de eventos de Suporte (Checkpoint C2.1)", () => {
  it("1. ticket.created traduzido, com número humano do chamado", () => {
    renderTimeline([entry({ kind: "ticket.created", ticketNumber: 1042, summary: "Chamado #1042 criado · Aberto" })]);
    expect(screen.getByText("Chamado #1042 — Chamado criado")).toBeInTheDocument();
  });

  it("2. status traduzido, sem chave técnica", () => {
    renderTimeline([entry({ kind: "ticket.status_changed", ticketNumber: 1042, summary: "Aberto → Em atendimento" })]);
    expect(screen.getByText("Chamado #1042 — Status alterado")).toBeInTheDocument();
    expect(screen.getByText("Aberto → Em atendimento")).toBeInTheDocument();
    expect(screen.queryByText(/in_progress/)).not.toBeInTheDocument();
  });

  it("3. prioridade traduzida, sem chave técnica", () => {
    renderTimeline([entry({ kind: "ticket.priority_changed", ticketNumber: 1042, summary: "Baixa → Crítica" })]);
    expect(screen.getByText("Chamado #1042 — Prioridade alterada")).toBeInTheDocument();
    expect(screen.getByText("Baixa → Crítica")).toBeInTheDocument();
    expect(screen.queryByText(/critical/)).not.toBeInTheDocument();
  });

  it("4. responsável alterado sem dado técnico (nunca um UUID de usuário)", () => {
    renderTimeline([entry({ kind: "ticket.assignee_changed", ticketNumber: 1042, summary: "Responsável alterado" })]);
    expect(screen.getByText("Chamado #1042 — Responsável alterado")).toBeInTheDocument();
    expect(screen.queryByText(UUID_RE)).not.toBeInTheDocument();
  });

  it("5/6. projeto vinculado — texto genérico idêntico com ou sem project:read (masking já ocorre na origem: projectName sempre null para eventos de chamado)", () => {
    renderTimeline([entry({ kind: "ticket.project_changed", ticketNumber: 1042, summary: "Projeto vinculado" })]);
    expect(screen.getByText("Chamado #1042 — Projeto vinculado alterado")).toBeInTheDocument();
    expect(screen.getByText("Projeto vinculado")).toBeInTheDocument();
    expect(screen.queryByText(/Projeto Secreto/)).not.toBeInTheDocument();
    expect(screen.queryByText(UUID_RE)).not.toBeInTheDocument();
  });

  it("7. comment_added nunca mostra o conteúdo do comentário", () => {
    renderTimeline([entry({ kind: "ticket.comment_added", ticketNumber: 1042, summary: "Comentário adicionado" })]);
    expect(screen.getByText("Chamado #1042 — Comentário adicionado")).toBeInTheDocument();
    expect(screen.queryByText(/senha|confidencial|conteúdo sensível/i)).not.toBeInTheDocument();
  });

  it("8. ticket_number sempre no formato humano #NNNN", () => {
    renderTimeline([entry({ kind: "ticket.created", ticketNumber: 7, summary: "" })]);
    expect(screen.getByText("Chamado #7 — Chamado criado")).toBeInTheDocument();
  });

  it("9. nenhum UUID exposto no texto renderizado", () => {
    const { container } = renderTimeline([
      entry({ kind: "ticket.created", ticketNumber: 1042, summary: "Chamado #1042 criado · Aberto" }),
      entry({ kind: "ticket.status_changed", ticketNumber: 1042, summary: "Aberto → Em atendimento" }),
    ]);
    expect(container.textContent).not.toMatch(UUID_RE);
  });

  it("10. client, project e ticket intercalados — cada um traduzido pelo tradutor correto", () => {
    renderTimeline([
      entry({ kind: "client.created", summary: "" }),
      entry({ kind: "project.status_changed", projectName: "Projeto X", summary: "Ativo → Concluído" }),
      entry({ kind: "ticket.created", ticketNumber: 1042, summary: "Chamado #1042 criado · Aberto" }),
    ]);
    expect(screen.getByText("Cliente cadastrado")).toBeInTheDocument();
    expect(screen.getByText("Projeto X — Status alterado")).toBeInTheDocument();
    expect(screen.getByText("Chamado #1042 — Chamado criado")).toBeInTheDocument();
  });

  it("11. regressão: Timeline de Projetos continua traduzindo normalmente (sem lacuna nova)", () => {
    renderTimeline([entry({ kind: "project.owner_changed", projectName: "Projeto Y", summary: "Ana → Bia" })]);
    expect(screen.getByText("Projeto Y — Responsável alterado")).toBeInTheDocument();
  });

  it("12. regressão: Timeline de Clientes continua traduzindo normalmente (sem lacuna nova)", () => {
    renderTimeline([entry({ kind: "client.owner_changed", summary: "Ana → Bia" })]);
    expect(screen.getByText("Responsável alterado")).toBeInTheDocument();
  });

  it("kind de chamado desconhecido nunca vaza `kind` cru — cai no fallback humano", () => {
    renderTimeline([entry({ kind: "ticket.unknown_future_kind", ticketNumber: 1042, summary: "" })]);
    expect(screen.getByText("Chamado #1042 — Atividade do chamado")).toBeInTheDocument();
    expect(screen.queryByText(/unknown_future_kind/)).not.toBeInTheDocument();
  });
});

describe("<ClientTimeline /> — tradução de eventos de Domínios (Checkpoint C2, fechada desde a origem — sem lacuna equivalente ao C2.1 de Suporte)", () => {
  it("domain.created traduzido, com o nome do domínio", () => {
    renderTimeline([entry({ kind: "domain.created", domainName: "empresa.com.br", summary: "Domínio empresa.com.br cadastrado · Ativo" })]);
    expect(screen.getByText("empresa.com.br — Domínio cadastrado")).toBeInTheDocument();
  });

  it("status alterado, sem chave técnica", () => {
    renderTimeline([entry({ kind: "domain.status_changed", domainName: "empresa.com.br", summary: "Ativo → Em transferência" })]);
    expect(screen.getByText("empresa.com.br — Status alterado")).toBeInTheDocument();
    expect(screen.getByText("Ativo → Em transferência")).toBeInTheDocument();
    expect(screen.queryByText(/transferring/)).not.toBeInTheDocument();
  });

  it("projeto vinculado — texto genérico, nunca nome/ID de Projeto (projectName sempre null para eventos de domínio)", () => {
    renderTimeline([entry({ kind: "domain.project_changed", domainName: "empresa.com.br", summary: "Projeto vinculado" })]);
    expect(screen.getByText("empresa.com.br — Projeto vinculado alterado")).toBeInTheDocument();
    expect(screen.getByText("Projeto vinculado")).toBeInTheDocument();
    expect(screen.queryByText(/Projeto Secreto/)).not.toBeInTheDocument();
    expect(screen.queryByText(UUID_RE)).not.toBeInTheDocument();
  });

  it("observações alteradas nunca mostram o conteúdo de notes", () => {
    renderTimeline([entry({ kind: "domain.updated", domainName: "empresa.com.br", summary: "Campos alterados: observações" })]);
    expect(screen.getByText("empresa.com.br — Domínio atualizado")).toBeInTheDocument();
    expect(screen.queryByText(/senha|confidencial|conteúdo sensível/i)).not.toBeInTheDocument();
  });

  it("nenhum UUID exposto no texto renderizado", () => {
    const { container } = renderTimeline([
      entry({ kind: "domain.created", domainName: "empresa.com.br", summary: "Domínio empresa.com.br cadastrado · Ativo" }),
      entry({ kind: "domain.expiration_changed", domainName: "empresa.com.br", summary: "Vencimento alterado para 2027-01-01" }),
    ]);
    expect(container.textContent).not.toMatch(UUID_RE);
  });

  it("client, project, ticket e domain intercalados — cada um traduzido pelo tradutor correto (quarta fonte)", () => {
    renderTimeline([
      entry({ kind: "client.created", summary: "" }),
      entry({ kind: "project.status_changed", projectName: "Projeto X", summary: "Ativo → Concluído" }),
      entry({ kind: "ticket.created", ticketNumber: 1042, summary: "Chamado #1042 criado · Aberto" }),
      entry({ kind: "domain.created", domainName: "empresa.com.br", summary: "Domínio empresa.com.br cadastrado · Ativo" }),
    ]);
    expect(screen.getByText("Cliente cadastrado")).toBeInTheDocument();
    expect(screen.getByText("Projeto X — Status alterado")).toBeInTheDocument();
    expect(screen.getByText("Chamado #1042 — Chamado criado")).toBeInTheDocument();
    expect(screen.getByText("empresa.com.br — Domínio cadastrado")).toBeInTheDocument();
  });

  it("kind de domínio desconhecido nunca vaza `kind` cru — cai no fallback humano", () => {
    renderTimeline([entry({ kind: "domain.unknown_future_kind", domainName: "empresa.com.br", summary: "" })]);
    expect(screen.getByText("empresa.com.br — Atividade do domínio")).toBeInTheDocument();
    expect(screen.queryByText(/unknown_future_kind/)).not.toBeInTheDocument();
  });

  it("regressão: Timeline de Suporte continua traduzindo normalmente (sem regressão da correção C2.1)", () => {
    renderTimeline([entry({ kind: "ticket.status_changed", ticketNumber: 7, summary: "Aberto → Em atendimento" })]);
    expect(screen.getByText("Chamado #7 — Status alterado")).toBeInTheDocument();
  });
});
