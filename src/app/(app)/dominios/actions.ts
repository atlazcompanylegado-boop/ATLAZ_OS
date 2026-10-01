"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as domainService from "@/server/services/domain-service";
import { ServiceError, type ServiceErrorCode } from "@/server/services/service-error";
import type { DomainStatus } from "@/lib/validation/domain";

/** Server Actions pequenas — só extraem FormData, chamam o service e traduzem o resultado. */

export type DomainFormState =
  | { error?: string; fieldErrors?: Record<string, string>; code?: ServiceErrorCode }
  | undefined;

export type DomainStatusActionResult = { ok: true } | { ok: false; error: string };

function extractDomainInput(formData: FormData) {
  const input: Record<string, unknown> = {
    registrar: formData.get("registrar"),
    registrationDate: formData.get("registrationDate"),
    expirationDate: formData.get("expirationDate"),
    autoRenewStatus: formData.get("autoRenewStatus"),
    ownerUserId: formData.get("ownerUserId"),
    notes: formData.get("notes"),
  };
  // Allowlist por presença: o formulário só envia projectId a quem pode gerenciar Projeto.
  // Campo ausente preserva o vínculo na edição (nunca vira NULL); campo presente é uma alteração
  // explícita, que o service só aceita com project:read (e rejeita, nunca ignora, sem ela).
  if (formData.has("projectId")) input.projectId = formData.get("projectId");
  return input;
}

export async function createDomainAction(_prevState: DomainFormState, formData: FormData): Promise<DomainFormState> {
  let domainId: string;
  try {
    const result = await domainService.createDomain({
      ...extractDomainInput(formData),
      clientId: formData.get("clientId"),
      domainName: formData.get("domainName"),
    });
    domainId = result.id;
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    throw error;
  }
  revalidatePath("/dominios");
  redirect(`/dominios/${domainId}`);
}

export async function updateDomainAction(_prevState: DomainFormState, formData: FormData): Promise<DomainFormState> {
  const domainId = String(formData.get("domainId") ?? "");
  let resultId: string;
  try {
    const result = await domainService.updateDomain(domainId, extractDomainInput(formData), formData.get("version"));
    resultId = result.id;
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    throw error;
  }
  revalidatePath("/dominios");
  revalidatePath(`/dominios/${resultId}`);
  redirect(`/dominios/${resultId}`);
}

function toStatusResult(error: unknown): DomainStatusActionResult {
  if (error instanceof ServiceError) return { ok: false, error: error.message };
  throw error;
}

export async function changeDomainStatusAction(domainId: string, version: number, status: DomainStatus): Promise<DomainStatusActionResult> {
  try {
    await domainService.updateDomain(domainId, { status }, version);
  } catch (error) {
    return toStatusResult(error);
  }
  revalidatePath("/dominios");
  revalidatePath(`/dominios/${domainId}`);
  return { ok: true };
}

/** Busca paginada de Clientes para o seletor do formulário/filtros — nunca carrega todos de uma vez. */
export async function searchDomainClientsAction(q: string, page: number) {
  try {
    return await domainService.listDomainClients({ q, page });
  } catch {
    return { rows: [], total: 0, page: 1, pageSize: 25 };
  }
}
/** Busca paginada de Projetos restrita ao Cliente informado — nunca carrega todos os projetos do sistema. */
export async function searchDomainProjectsAction(clientId: string, q: string, page: number) {
  try {
    return await domainService.listDomainProjects({ clientId, q, page });
  } catch {
    return { rows: [], total: 0, page: 1, pageSize: 25 };
  }
}
