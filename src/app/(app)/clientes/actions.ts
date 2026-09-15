"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as clientService from "@/server/services/client-service";
import { ServiceError, type ServiceErrorCode } from "@/server/services/service-error";

/**
 * Server Actions pequenas (ver docs/clientes-checkpoint-1.md §58): só extraem
 * FormData, chamam o service e traduzem o resultado — toda regra de negócio mora
 * em `client-service.ts`.
 */

export type ClientFormState =
  | { error?: string; fieldErrors?: Record<string, string>; code?: ServiceErrorCode }
  | undefined;

export type ContactActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function extractClientInput(formData: FormData) {
  return {
    name: formData.get("name"),
    tradeName: formData.get("tradeName"),
    legalName: formData.get("legalName"),
    personType: formData.get("personType"),
    document: formData.get("document"),
    status: formData.get("status"),
    source: formData.get("source"),
    ownerUserId: formData.get("ownerUserId"),
    website: formData.get("website"),
    notes: formData.get("notes"),
  };
}

function extractContactInput(formData: FormData) {
  return {
    name: formData.get("contactName"),
    jobTitle: formData.get("contactJobTitle"),
    type: formData.get("contactType"),
    email: formData.get("contactEmail"),
    phone: formData.get("contactPhone"),
    whatsapp: formData.get("contactWhatsapp"),
    notes: formData.get("contactNotes"),
  };
}

export async function createClientAction(_prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
  let clientId: string;
  try {
    const result = await clientService.createClient(extractClientInput(formData), extractContactInput(formData));
    clientId = result.id;
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    throw error;
  }
  revalidatePath("/clientes");
  redirect(`/clientes/${clientId}`);
}

export async function updateClientAction(_prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const clientId = String(formData.get("clientId") ?? "");
  let resultId: string;
  try {
    const result = await clientService.updateClient(clientId, extractClientInput(formData), formData.get("version"));
    resultId = result.id;
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    throw error;
  }
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${resultId}`);
  redirect(`/clientes/${resultId}`);
}

function toContactResult(error: unknown): ContactActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
  }
  throw error;
}

export async function createContactAction(clientId: string, input: Record<string, unknown>): Promise<ContactActionResult> {
  try {
    await clientService.createClientContact(clientId, input);
  } catch (error) {
    return toContactResult(error);
  }
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true };
}

export async function updateContactAction(
  clientId: string,
  contactId: string,
  input: Record<string, unknown>,
): Promise<ContactActionResult> {
  try {
    await clientService.updateClientContact(clientId, contactId, input);
  } catch (error) {
    return toContactResult(error);
  }
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true };
}

export async function deleteContactAction(clientId: string, contactId: string): Promise<ContactActionResult> {
  try {
    await clientService.deleteClientContact(clientId, contactId);
  } catch (error) {
    return toContactResult(error);
  }
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true };
}

export async function setPrimaryContactAction(clientId: string, contactId: string): Promise<ContactActionResult> {
  try {
    await clientService.setPrimaryClientContact(clientId, contactId);
  } catch (error) {
    return toContactResult(error);
  }
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true };
}
