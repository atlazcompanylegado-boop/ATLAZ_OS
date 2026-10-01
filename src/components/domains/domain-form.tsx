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
import { DOMAIN_AUTO_RENEW_STATUSES, DOMAIN_AUTO_RENEW_LABELS } from "@/lib/validation/domain";
import { DomainClientSelector, type DomainClientOption } from "./client-selector";
import { DomainProjectSelector, type DomainProjectOption } from "./project-selector";
import {
  createDomainAction, updateDomainAction, searchDomainClientsAction, searchDomainProjectsAction, type DomainFormState,
} from "@/app/(app)/dominios/actions";
import type { AvailableOwnerOption } from "@/server/repositories/domain-repository";

const NO_OWNER = "__none__";

export interface DomainFormDomain {
  id: string;
  clientId: string;
  clientName: string;
  domainName: string;
  projectId: string | null;
  projectName: string | null;
  hasProject: boolean;
  registrar: string | null;
  registrationDate: string | null;
  expirationDate: string;
  autoRenewStatus: string;
  ownerUserId: string | null;
  notes: string | null;
  version: number;
}

export interface DomainFormProps {
  mode: "create" | "edit";
  owners: AvailableOwnerOption[];
  domain?: DomainFormDomain;
  preselectedClient?: DomainClientOption | null;
  /** project:read — sem ele, o campo Projeto não é renderizado nem enviado (o vínculo é preservado no servidor). */
  canManageProject: boolean;
}

/** Formulário único de Domínios — reaproveitado por /dominios/novo e /dominios/[id]/editar. Status nunca é editado aqui — só pelas ações explícitas da ficha (Checkpoint A §18). */
export function DomainForm({ mode, owners, domain, preselectedClient, canManageProject }: DomainFormProps) {
  const router = useRouter();
  const action = mode === "create" ? createDomainAction : updateDomainAction;
  const [state, formAction, pending] = useActionState<DomainFormState, FormData>(action, undefined);
  const [ownerUserId, setOwnerUserId] = React.useState<string>(domain?.ownerUserId ?? NO_OWNER);
  const [clientId, setClientId] = React.useState<string | null>(mode === "edit" ? domain!.clientId : (preselectedClient?.id ?? null));

  const fieldErrors = state?.fieldErrors ?? {};
  const isConflict = state?.code === "conflict";
  const initialProject: DomainProjectOption | null = canManageProject && domain?.hasProject && domain.projectId && domain.projectName
    ? { id: domain.projectId, name: domain.projectName, status: "" }
    : null;

  return (
    <form action={formAction} className="space-y-6">
      {mode === "edit" && domain ? (
        <>
          <input type="hidden" name="domainId" value={domain.id} />
          <input type="hidden" name="version" value={domain.version} />
        </>
      ) : null}

      {isConflict ? (
        <Alert variant="warning" title="Domínio atualizado por outra pessoa">
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
          <CardTitle>{mode === "edit" ? domain!.domainName : "Dados principais"}</CardTitle>
          <CardDescription>Identificação do domínio e vínculo com o cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {mode === "create" ? (
              <DomainClientSelector
                name="clientId"
                initialClient={preselectedClient ?? null}
                onSearch={searchDomainClientsAction}
                onChange={(client) => setClientId(client?.id ?? null)}
                error={fieldErrors.clientId}
              />
            ) : (
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <div className="flex h-10 items-center rounded-sm border border-border bg-surface-3 px-3 text-sm text-ink-2">
                  {domain?.clientName}
                </div>
                <p className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                  O cliente de um domínio não pode ser alterado depois da criação.
                </p>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            {mode === "create" ? (
              <Field label="Domínio" htmlFor="domainName" error={fieldErrors.domainName} hint="Ex.: empresa.com.br — sem http://, www. ou caminho.">
                <Input id="domainName" name="domainName" placeholder="empresa.com.br" required maxLength={253} error={!!fieldErrors.domainName} />
              </Field>
            ) : (
              <div className="space-y-1.5">
                <Label>Domínio</Label>
                <div className="flex h-10 items-center rounded-sm border border-border bg-surface-3 px-3 text-sm text-ink-2">
                  {domain?.domainName}
                </div>
                <p className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                  O nome do domínio não pode ser alterado depois do cadastro. Em caso de erro de digitação, inative este registro e cadastre novamente.
                </p>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            {canManageProject ? (
              <>
                <DomainProjectSelector
                  name="projectId"
                  clientId={clientId}
                  initialProject={initialProject}
                  onSearch={searchDomainProjectsAction}
                />
                {fieldErrors.projectId ? <p className="mt-1 text-xs text-danger">{fieldErrors.projectId}</p> : null}
              </>
            ) : (
              <div className="space-y-1.5">
                <Label>Projeto</Label>
                <div className="flex h-10 items-center rounded-sm border border-border bg-surface-3 px-3 text-sm text-ink-2">
                  {domain?.hasProject ? "Projeto vinculado" : "Nenhum projeto vinculado"}
                </div>
                <p className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
                  Vincular ou alterar o Projeto exige acesso a Projetos.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registro</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Registrador (opcional)" htmlFor="registrar" error={fieldErrors.registrar}>
            <Input id="registrar" name="registrar" defaultValue={domain?.registrar ?? ""} maxLength={160} error={!!fieldErrors.registrar} />
          </Field>

          <Field label="Data de registro (opcional)" htmlFor="registrationDate" error={fieldErrors.registrationDate}>
            <Input id="registrationDate" name="registrationDate" type="date" defaultValue={domain?.registrationDate ?? ""} error={!!fieldErrors.registrationDate} />
          </Field>

          <Field label="Data de vencimento" htmlFor="expirationDate" error={fieldErrors.expirationDate}>
            <Input id="expirationDate" name="expirationDate" type="date" defaultValue={domain?.expirationDate ?? ""} required error={!!fieldErrors.expirationDate} />
          </Field>

          <Field label="Renovação automática" htmlFor="autoRenewStatus" error={fieldErrors.autoRenewStatus}>
            <Select name="autoRenewStatus" defaultValue={domain?.autoRenewStatus ?? "unknown"}>
              <SelectTrigger id="autoRenewStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOMAIN_AUTO_RENEW_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {DOMAIN_AUTO_RENEW_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="flex items-start gap-1.5 text-xs text-ink-3">
              <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
              Informação declarada, nunca verificada automaticamente com o registrador.
            </p>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Responsável e observações</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Responsável pela renovação" htmlFor="ownerUserId" error={fieldErrors.ownerUserId}>
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

          <Field label="Observações (opcional)" htmlFor="notes" error={fieldErrors.notes} className="sm:col-span-2" hint="Nunca registre senhas, códigos de transferência (EPP), tokens ou chaves aqui.">
            <Textarea id="notes" name="notes" defaultValue={domain?.notes ?? ""} maxLength={2000} rows={4} error={!!fieldErrors.notes} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar domínio"}
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
