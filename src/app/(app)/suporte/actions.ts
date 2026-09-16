"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as ticketService from "@/server/services/ticket-service";
import { ServiceError, type ServiceErrorCode } from "@/server/services/service-error";
import type { TicketStatus } from "@/lib/validation/ticket";
import { fromDateTimeLocalValue } from "@/lib/support/format";

/** Server Actions pequenas — só extraem FormData, chamam o service e traduzem o resultado. */

export type TicketFormState =
  | { error?: string; fieldErrors?: Record<string, string>; code?: ServiceErrorCode }
  | undefined;

export type TicketStatusActionResult = { ok: true } | { ok: false; error: string };

function extractTicketInput(formData: FormData) {
  const dueAtRaw = formData.get("dueAt");
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    projectId: formData.get("projectId"),
    priority: formData.get("priority"),
    assignedUserId: formData.get("assignedUserId"),
    // <input type="datetime-local"> não carrega timezone — interpretado como horário de
    // Brasília antes de virar ISO-8601 (ver src/lib/support/format.ts).
    dueAt: typeof dueAtRaw === "string" && dueAtRaw ? fromDateTimeLocalValue(dueAtRaw) : dueAtRaw,
  };
}

export async function createTicketAction(_prevState: TicketFormState, formData: FormData): Promise<TicketFormState> {
  let ticketId: string;
  try {
    const result = await ticketService.createTicket({ ...extractTicketInput(formData), clientId: formData.get("clientId") });
    ticketId = result.id;
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    throw error;
  }
  revalidatePath("/suporte");
  redirect(`/suporte/${ticketId}`);
}

export async function updateTicketAction(_prevState: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const ticketId = String(formData.get("ticketId") ?? "");
  let resultId: string;
  try {
    const result = await ticketService.updateTicket(ticketId, extractTicketInput(formData), formData.get("version"));
    resultId = result.id;
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    throw error;
  }
  revalidatePath("/suporte");
  revalidatePath(`/suporte/${resultId}`);
  redirect(`/suporte/${resultId}`);
}

function toStatusResult(error: unknown): TicketStatusActionResult {
  if (error instanceof ServiceError) return { ok: false, error: error.message };
  throw error;
}

export async function changeTicketStatusAction(ticketId: string, version: number, status: TicketStatus): Promise<TicketStatusActionResult> {
  try {
    await ticketService.changeTicketStatus({ ticketId, version, status });
  } catch (error) {
    return toStatusResult(error);
  }
  revalidatePath("/suporte");
  revalidatePath(`/suporte/${ticketId}`);
  return { ok: true };
}

export async function reopenTicketAction(ticketId: string, version: number): Promise<TicketStatusActionResult> {
  try {
    await ticketService.reopenTicket({ ticketId, version });
  } catch (error) {
    return toStatusResult(error);
  }
  revalidatePath("/suporte");
  revalidatePath(`/suporte/${ticketId}`);
  return { ok: true };
}

export async function addCommentAction(ticketId: string, content: string): Promise<TicketStatusActionResult> {
  try {
    await ticketService.createTicketComment({ ticketId, content });
  } catch (error) {
    return toStatusResult(error);
  }
  revalidatePath(`/suporte/${ticketId}`);
  return { ok: true };
}

/** Busca paginada de Clientes para o seletor do formulário/filtros — nunca carrega todos de uma vez. */
export async function searchTicketClientsAction(q: string, page: number) {
  try {
    return await ticketService.listTicketClients({ q, page });
  } catch {
    return { rows: [], total: 0, page: 1, pageSize: 25 };
  }
}
/** Busca paginada de Projetos restrita ao Cliente informado — nunca carrega todos os projetos do sistema. */
export async function searchTicketProjectsAction(clientId: string, q: string, page: number) {
  try {
    return await ticketService.listTicketProjects({ clientId, q, page });
  } catch {
    return { rows: [], total: 0, page: 1, pageSize: 25 };
  }
}
