import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// interactions.tsx importa a Server Action real (addCommentAction), que puxa
// "server-only" transitivamente — mockada aqui porque este teste só exercita
// a renderização do Client Component, nunca a submissão de fato.
vi.mock("@/app/(app)/suporte/actions", () => ({ addCommentAction: vi.fn() }));
// useRouter() exige o App Router montado; mockado porque este teste não navega.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TicketInteractions, type TicketCommentEntry } from "@/components/support/interactions";

function comment(overrides: Partial<TicketCommentEntry>): TicketCommentEntry {
  return { id: crypto.randomUUID(), content: "", authorName: "Ana", createdAt: new Date("2026-09-16T12:00:00Z"), ...overrides };
}

describe("<TicketInteractions /> — segurança do conteúdo do comentário (Checkpoint D)", () => {
  it("conteúdo malicioso nunca é interpretado como HTML — sempre renderizado como texto puro", () => {
    const payload = "<script>alert(1)</script>";
    const { container } = render(<TicketInteractions ticketId="t1" comments={[comment({ content: payload })]} canComment={false} />);
    // O texto literal aparece na tela...
    expect(screen.getByText(payload)).toBeInTheDocument();
    // ...mas nenhuma tag <script> real foi criada no DOM (React escapa por padrão).
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("composer só aparece com permissão de escrita (ticket:write)", () => {
    const comments = [comment({ content: "Olá" })];
    const { rerender } = render(<TicketInteractions ticketId="t1" comments={comments} canComment={false} />);
    expect(screen.queryByLabelText("Adicionar comentário")).not.toBeInTheDocument();
    rerender(<TicketInteractions ticketId="t1" comments={comments} canComment={true} />);
    expect(screen.getByLabelText("Adicionar comentário")).toBeInTheDocument();
  });
});
