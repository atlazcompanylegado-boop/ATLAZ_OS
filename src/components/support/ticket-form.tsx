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
import { TICKET_PRIORITIES, TICKET_PRIORITY_LABELS } from "@/lib/validation/ticket";
import { toDateTimeLocalValue, formatTicketNumber } from "@/lib/support/format";
import { TicketClientSelector, type TicketClientOption } from "./client-selector";
import { TicketProjectSelector, type TicketProjectOption } from "./project-selector";
import { createTicketAction, updateTicketAction, searchTicketClientsAction, searchTicketProjectsAction, type TicketFormState } from "@/app/(app)/suporte/actions";
import type { AssigneeOption } from "@/server/repositories/ticket-repository";

const NO_ASSIGNEE = "__none__";

export interface TicketFormTicket {
  id: string;
  ticketNumber: number;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  hasProject: boolean;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedUserId: string | null;
  dueAt: string | null;
  version: number;
}

export interface TicketFormProps {
  mode: "create" | "edit";
  assignees: AssigneeOption[];
  ticket?: TicketFormTicket;
  preselectedClient?: TicketClientOption | null;
  /** project:read — sem ele, o campo Projeto não é renderizado nem enviado (o vínculo é preservado no servidor). */
  canManageProject: boolean;
}

/** Formulário único de Suporte — reaproveitado por /suporte/novo e /suporte/[id]/editar. Status nunca é editado aqui — só pelas ações explícitas da ficha. */
export function TicketForm({ mode, assignees, ticket, preselectedClient, canManageProject }: TicketFormProps) {
  const router = useRouter();
  const action = mode === "create" ? createTicketAction : updateTicketAction;
  const [state, formAction, pending] = useActionState<TicketFormState, FormData>(action, undefined);
  const [assignedUserId, setAssignedUserId] = React.useState<string>(ticket?.assignedUserId ?? NO_ASSIGNEE);
  const [clientId, setClientId] = React.useState<string | null>(mode === "edit" ? ticket!.clientId : (preselectedClient?.id ?? null));

  const fieldErrors = state?.fieldErrors ?? {};
  const isConflict = state?.code === "conflict";
  const initialProject: TicketProjectOption | null = canManageProject && ticket?.hasProject && ticket.projectId && ticket.projectName
    ? { id: ticket.projectId, name: ticket.projectName, status: "" }
    : null;

  return (
    <form action={formAction} className="space-y-6">
      {mode === "edit" && ticket ? (
        <>
          <input type="hidden" name="ticketId" value={ticket.id} />
          <input type="hidden" name="version" value={ticket.version} />
        </>
      ) : null}

      {isConflict ? (
        <Alert variant="warning" title="Chamado atualizado por outra pessoa">
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
          <CardTitle>{mode === "edit" ? `Chamado ${formatTicketNumber(ticket!.ticketNumber)}` : "Dados principais"}</CardTitle>
          <CardDescription>Identificação do chamado e vínculo com o cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {mode === "create" ? (
              <TicketClientSelector
                name="clientId"
                initialClient={preselectedClient ?? null}
                onSearch={searchTicketClientsAction}
                onChange={(client) => setClientId(client?.id ?? null)}
                error={fieldErrors.clientId}
              />
            ) : (
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <div className="flex h-10 items-center rounded-sm border border-border bg-surface-3 px-3 text-sm text-ink-2">
                  {ticket?.clientName}
                </div>
                <p className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                  O cliente de um chamado não pode ser alterado depois da criação.
                </p>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            {canManageProject ? (
              <>
                <TicketProjectSelector
                  name="projectId"
                  clientId={clientId}
                  initialProject={initialProject}
                  onSearch={searchTicketProjectsAction}
                />
                {fieldErrors.projectId ? <p className="mt-1 text-xs text-danger">{fieldErrors.projectId}</p> : null}
              </>
            ) : (
              <div className="space-y-1.5">
                <Label>Projeto</Label>
                <div className="flex h-10 items-center rounded-sm border border-border bg-surface-3 px-3 text-sm text-ink-2">
                  {ticket?.hasProject ? "Projeto vinculado" : "Nenhum projeto vinculado"}
                </div>
                <p className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                  Vincular ou alterar o Projeto exige acesso a Projetos.
                </p>
              </div>
            )}
          </div>

          <Field label="Título" htmlFor="title" error={fieldErrors.title} className="sm:col-span-2">
            <Input id="title" name="title" defaultValue={ticket?.title} required maxLength={160} error={!!fieldErrors.title} />
          </Field>

          <Field label="Descrição" htmlFor="description" error={fieldErrors.description} className="sm:col-span-2">
            <Textarea id="description" name="description" defaultValue={ticket?.description ?? ""} required maxLength={10000} rows={5} error={!!fieldErrors.description} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prioridade e responsável</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Prioridade" htmlFor="priority" error={fieldErrors.priority}>
            <Select name="priority" defaultValue={ticket?.priority ?? "normal"}>
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TICKET_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Responsável" htmlFor="assignedUserId" error={fieldErrors.assignedUserId}>
            <Select value={assignedUserId} onValueChange={setAssignedUserId}>
              <SelectTrigger id="assignedUserId">
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ASSIGNEE}>Sem responsável</SelectItem>
                {assignees.map((assignee) => (
                  <SelectItem key={assignee.userId} value={assignee.userId}>
                    {assignee.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="assignedUserId" value={assignedUserId === NO_ASSIGNEE ? "" : assignedUserId} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prazo</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label="Prazo (opcional)"
            htmlFor="dueAt"
            error={fieldErrors.dueAt}
            hint="Horário de Brasília (America/São_Paulo)."
            className="sm:max-w-xs"
          >
            <Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={toDateTimeLocalValue(ticket?.dueAt ?? null)} error={!!fieldErrors.dueAt} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar chamado"}
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
