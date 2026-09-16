"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as projectService from "@/server/services/project-service";
import { ServiceError, type ServiceErrorCode } from "@/server/services/service-error";
import type { ProjectStatus } from "@/lib/validation/project";

/** Server Actions pequenas — só extraem FormData, chamam o service e traduzem o resultado. */

export type ProjectFormState =
  | { error?: string; fieldErrors?: Record<string, string>; code?: ServiceErrorCode }
  | undefined;

export type ProjectStatusActionResult = { ok: true } | { ok: false; error: string };

function extractProjectInput(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    ownerUserId: formData.get("ownerUserId"),
    startDate: formData.get("startDate"),
    dueDate: formData.get("dueDate"),
    progress: formData.get("progress"),
  };
}

export async function createProjectAction(_prevState: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  let projectId: string;
  try {
    const result = await projectService.createProject({ ...extractProjectInput(formData), clientId: formData.get("clientId") });
    projectId = result.id;
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    throw error;
  }
  revalidatePath("/projetos");
  redirect(`/projetos/${projectId}`);
}

export async function updateProjectAction(_prevState: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const projectId = String(formData.get("projectId") ?? "");
  let resultId: string;
  try {
    const result = await projectService.updateProject(projectId, extractProjectInput(formData), formData.get("version"));
    resultId = result.id;
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    throw error;
  }
  revalidatePath("/projetos");
  revalidatePath(`/projetos/${resultId}`);
  redirect(`/projetos/${resultId}`);
}

function toStatusResult(error: unknown): ProjectStatusActionResult {
  if (error instanceof ServiceError) return { ok: false, error: error.message };
  throw error;
}

export async function changeProjectStatusAction(
  projectId: string,
  version: number,
  status: Extract<ProjectStatus, "completed" | "cancelled">,
): Promise<ProjectStatusActionResult> {
  try {
    await projectService.changeProjectStatus({ projectId, version, status });
  } catch (error) {
    return toStatusResult(error);
  }
  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { ok: true };
}

export async function reopenProjectAction(projectId: string, version: number): Promise<ProjectStatusActionResult> {
  try {
    await projectService.reopenProject({ projectId, version });
  } catch (error) {
    return toStatusResult(error);
  }
  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { ok: true };
}

/** Busca paginada de Clientes para o seletor do formulário — nunca carrega todos de uma vez. */
export async function searchProjectClientsAction(q: string, page: number) {
  try {
    return await projectService.listProjectClients({ q, page });
  } catch {
    return { rows: [], total: 0, page: 1, pageSize: 25 };
  }
}
