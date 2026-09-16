"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Info, RotateCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PROJECT_NON_FINAL_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  isFinalProjectStatus,
  type ProjectStatus,
} from "@/lib/validation/project";
import { ClientSelector, type ClientOption } from "./client-selector";
import { createProjectAction, updateProjectAction, searchProjectClientsAction, type ProjectFormState } from "@/app/(app)/projetos/actions";
import type { OwnerOption } from "@/server/repositories/project-repository";

const NO_OWNER = "__none__";

export interface ProjectFormProject {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: string;
  ownerUserId: string | null;
  startDate: string | null;
  dueDate: string | null;
  progress: number | null;
  version: number;
}

export interface ProjectFormProps {
  mode: "create" | "edit";
  owners: OwnerOption[];
  project?: ProjectFormProject;
  preselectedClient?: ClientOption | null;
}

/** Formulário único de Projetos — reaproveitado por /projetos/novo e /projetos/[id]/editar. */
export function ProjectForm({ mode, owners, project, preselectedClient }: ProjectFormProps) {
  const router = useRouter();
  const action = mode === "create" ? createProjectAction : updateProjectAction;
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(action, undefined);
  const [ownerUserId, setOwnerUserId] = React.useState<string>(project?.ownerUserId ?? NO_OWNER);
  const projectIsFinal = mode === "edit" && project ? isFinalProjectStatus(project.status) : false;
  const [status, setStatus] = React.useState<string>(project?.status ?? "planning");

  const fieldErrors = state?.fieldErrors ?? {};
  const isConflict = state?.code === "conflict";

  return (
    <form action={formAction} className="space-y-6">
      {mode === "edit" && project ? (
        <>
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="version" value={project.version} />
        </>
      ) : null}

      {isConflict ? (
        <Alert variant="warning" title="Projeto atualizado por outra pessoa">
          <p>{state?.error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => router.refresh()}>
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Recarregar dados
          </Button>
        </Alert>
      ) : state?.error ? (
        <Alert variant="danger" title="Não foi possível salvar">
          {state.error}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dados principais</CardTitle>
          <CardDescription>Identificação do projeto e vínculo com o cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome do projeto" htmlFor="name" error={fieldErrors.name} className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={project?.name} required maxLength={160} error={!!fieldErrors.name} />
          </Field>

          <div className="sm:col-span-2">
            {mode === "create" ? (
              <ClientSelector
                name="clientId"
                initialClient={preselectedClient ?? null}
                onSearch={searchProjectClientsAction}
                error={fieldErrors.clientId}
              />
            ) : (
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <div className="flex h-10 items-center rounded-sm border border-border bg-surface-3 px-3 text-sm text-ink-2">
                  {project?.clientName}
                </div>
                <p className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                  O cliente de um projeto não pode ser alterado depois da criação.
                </p>
              </div>
            )}
          </div>

          <Field label="Descrição" htmlFor="description" error={fieldErrors.description} className="sm:col-span-2">
            <Textarea id="description" name="description" defaultValue={project?.description ?? ""} maxLength={10000} rows={4} error={!!fieldErrors.description} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status e prioridade</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="status" error={fieldErrors.status}>
            {projectIsFinal ? (
              <>
                <div className="flex h-10 items-center rounded-sm border border-border bg-surface-3 px-3 text-sm text-ink-2">
                  {PROJECT_STATUS_LABELS[project!.status]}
                </div>
                <input type="hidden" name="status" value={project!.status} />
                <p className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                  Use “Reabrir projeto” na ficha para voltar a editar o status.
                </p>
              </>
            ) : (
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_NON_FINAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PROJECT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!projectIsFinal ? <input type="hidden" name="status" value={status} /> : null}
          </Field>

          <Field label="Prioridade" htmlFor="priority" error={fieldErrors.priority}>
            <Select name="priority" defaultValue={project?.priority ?? "normal"}>
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROJECT_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Progresso"
            htmlFor="progress"
            error={fieldErrors.progress}
            hint={projectIsFinal && project?.status === "completed" ? "Projeto concluído mantém 100%." : "Estimativa manual, de 0 a 100. Deixe em branco se ainda não informado."}
          >
            <Input
              id="progress"
              name="progress"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={project?.status === "completed" ? 100 : project?.progress ?? ""}
              readOnly={project?.status === "completed"}
              className={project?.status === "completed" ? "opacity-60" : undefined}
              error={!!fieldErrors.progress}
            />
          </Field>

          <Field label="Responsável" htmlFor="ownerUserId" error={fieldErrors.ownerUserId}>
            <Select value={ownerUserId} onValueChange={setOwnerUserId}>
              <SelectTrigger id="ownerUserId">
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OWNER}>Sem responsável</SelectItem>
                {owners.map((owner) => (
                  <SelectItem key={owner.userId} value={owner.userId}>
                    {owner.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="ownerUserId" value={ownerUserId === NO_OWNER ? "" : ownerUserId} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Início" htmlFor="startDate" error={fieldErrors.startDate}>
            <Input id="startDate" name="startDate" type="date" defaultValue={project?.startDate ?? ""} error={!!fieldErrors.startDate} />
          </Field>
          <Field label="Prazo" htmlFor="dueDate" error={fieldErrors.dueDate}>
            <Input id="dueDate" name="dueDate" type="date" defaultValue={project?.dueDate ?? ""} error={!!fieldErrors.dueDate} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar projeto"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="space-y-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {children}
        {hint && !error ? (
          <p className="flex items-start gap-1.5 text-xs text-ink-3">
            <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
            {hint}
          </p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
