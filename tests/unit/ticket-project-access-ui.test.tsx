import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EDIT_FORM_FIELDS_WITHOUT_PROJECT } from "../helpers/ticket-form-fields";

const TICKET_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_NAME = "Projeto Secreto Alfa";

const nav = vi.hoisted(() => ({ search: "" }));
const searchProjects = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/suporte/actions", () => ({
  createTicketAction: vi.fn(),
  updateTicketAction: vi.fn(),
  searchTicketClientsAction: vi.fn(),
  searchTicketProjectsAction: searchProjects,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/suporte",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { TicketForm, type TicketFormTicket } from "@/components/support/ticket-form";
import { TicketFilters } from "@/components/support/ticket-filters";

/** Propositalmente com projectId/projectName preenchidos: o formulário não pode depender só do mascaramento do servidor. */
const linkedTicket: TicketFormTicket = {
  id: TICKET_ID, ticketNumber: 1042, clientId: CLIENT_ID, clientName: "Cliente A",
  projectId: PROJECT_ID, projectName: PROJECT_NAME, hasProject: true,
  title: "Chamado", description: "Descrição", status: "open", priority: "normal",
  assignedUserId: null, dueAt: null, version: 3,
};

function formFieldNames(container: HTMLElement) {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  return [...new Set([...new FormData(form!).keys()])].sort();
}

beforeEach(() => {
  nav.search = "";
  searchProjects.mockReset();
});

describe("<TicketForm /> sem project:read", () => {
  it("edição: mostra só 'Projeto vinculado', sem nome/UUID e sem enviar projectId", () => {
    const { container } = render(<TicketForm mode="edit" assignees={[]} ticket={linkedTicket} canManageProject={false} />);
    expect(screen.getByText("Projeto vinculado")).toBeInTheDocument();
    expect(screen.queryByText("Projeto (opcional)")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(PROJECT_NAME);
    expect(container.innerHTML).not.toContain(PROJECT_ID);
    expect(container.querySelector('[name="projectId"]')).toBeNull();
    // Mesma lista usada pelo teste de integração que chama a Server Action real.
    expect(formFieldNames(container)).toEqual([...EDIT_FORM_FIELDS_WITHOUT_PROJECT].sort());
    expect(searchProjects).not.toHaveBeenCalled();
  });

  it("edição de chamado sem projeto: 'Nenhum projeto vinculado'", () => {
    render(<TicketForm mode="edit" assignees={[]} ticket={{ ...linkedTicket, projectId: null, projectName: null, hasProject: false }} canManageProject={false} />);
    expect(screen.getByText("Nenhum projeto vinculado")).toBeInTheDocument();
  });

  it("criação: nenhum seletor de Projeto e nenhum projectId enviado", () => {
    const { container } = render(<TicketForm mode="create" assignees={[]} canManageProject={false} />);
    expect(screen.getByText("Nenhum projeto vinculado")).toBeInTheDocument();
    expect(container.querySelector('[name="projectId"]')).toBeNull();
    expect(formFieldNames(container)).not.toContain("projectId");
  });
});

describe("<TicketForm /> com project:read", () => {
  it("edição: seletor com o Projeto atual e projectId enviado explicitamente", () => {
    const { container } = render(<TicketForm mode="edit" assignees={[]} ticket={linkedTicket} canManageProject />);
    expect(screen.getByText("Projeto (opcional)")).toBeInTheDocument();
    expect(screen.getByText(PROJECT_NAME)).toBeInTheDocument();
    const field = container.querySelector<HTMLInputElement>('input[name="projectId"]');
    expect(field?.value).toBe(PROJECT_ID);
    expect(formFieldNames(container)).toEqual([...EDIT_FORM_FIELDS_WITHOUT_PROJECT, "projectId"].sort());
  });
});

describe("<TicketFilters /> e o filtro de Projeto", () => {
  const baseProps = {
    assignees: [],
    selectedClient: { id: CLIENT_ID, name: "Cliente A", status: "active" },
    selectedProject: null,
    onSearchClients: vi.fn(),
    onSearchProjects: searchProjects,
  };

  it("sem project:read: filtro de Projeto não existe, mesmo com projectId na URL", () => {
    nav.search = `clientId=${CLIENT_ID}&projectId=${PROJECT_ID}`;
    const { container } = render(<TicketFilters {...baseProps} canFilterByProject={false} />);
    expect(screen.queryByText("Projeto (opcional)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Buscar chamados")).toHaveAttribute("placeholder", "Buscar por número, título ou cliente...");
    expect(container.innerHTML).not.toContain(PROJECT_ID);
    expect(searchProjects).not.toHaveBeenCalled();
  });

  it("com project:read: filtro de Projeto disponível", () => {
    nav.search = `clientId=${CLIENT_ID}`;
    render(<TicketFilters {...baseProps} canFilterByProject />);
    expect(screen.getByText("Projeto (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar chamados")).toHaveAttribute("placeholder", "Buscar por número, título, cliente ou projeto...");
  });
});
