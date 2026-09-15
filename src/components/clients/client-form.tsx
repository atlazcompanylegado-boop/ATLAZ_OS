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
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS, PERSON_TYPES, PERSON_TYPE_LABELS } from "@/lib/validation/client";
import { formatDocumentForDisplay } from "@/lib/validation/document";
import { createClientAction, updateClientAction, type ClientFormState } from "@/app/(app)/clientes/actions";
import type { ClientDetailRow, OwnerOption } from "@/server/repositories/client-repository";

const NO_OWNER = "__none__";
const NO_PERSON_TYPE = "__none__";

export interface ClientFormProps {
  mode: "create" | "edit";
  owners: OwnerOption[];
  client?: ClientDetailRow;
}

/**
 * Formulário único de Clientes — reaproveitado por /clientes/novo e
 * /clientes/[id]/editar (ver docs/clientes-checkpoint-1.md §36). O bloco de
 * "Contato principal" só aparece no cadastro: na edição, contatos são geridos na
 * aba própria da Ficha Mestre.
 */
export function ClientForm({ mode, owners, client }: ClientFormProps) {
  const router = useRouter();
  const action = mode === "create" ? createClientAction : updateClientAction;
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(action, undefined);
  const [personType, setPersonType] = React.useState<string>(client?.personType ?? NO_PERSON_TYPE);
  const [ownerUserId, setOwnerUserId] = React.useState<string>(client?.ownerUserId ?? NO_OWNER);

  const documentLabel = personType === "individual" ? "CPF" : personType === "company" ? "CNPJ" : "Documento";
  const fieldErrors = state?.fieldErrors ?? {};
  const isConflict = state?.code === "conflict";

  return (
    <form action={formAction} className="space-y-6">
      {mode === "edit" && client ? (
        <>
          <input type="hidden" name="clientId" value={client.id} />
          <input type="hidden" name="version" value={client.version} />
        </>
      ) : null}

      {isConflict ? (
        <Alert variant="warning" title="Cliente atualizado por outra pessoa">
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
          <CardDescription>Identificação do cliente na Atlaz Company.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="name" error={fieldErrors.name} className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={client?.name} required maxLength={160} error={!!fieldErrors.name} />
          </Field>
          <Field label="Nome fantasia" htmlFor="tradeName" error={fieldErrors.tradeName}>
            <Input id="tradeName" name="tradeName" defaultValue={client?.tradeName ?? ""} maxLength={160} error={!!fieldErrors.tradeName} />
          </Field>
          <Field label="Razão social" htmlFor="legalName" error={fieldErrors.legalName}>
            <Input id="legalName" name="legalName" defaultValue={client?.legalName ?? ""} maxLength={200} error={!!fieldErrors.legalName} />
          </Field>
          <Field label="Tipo de pessoa" htmlFor="personType" error={fieldErrors.personType}>
            {/* Sem `name` aqui de propósito — o Radix Select criaria um segundo campo
                "personType" no form (valor bruto, incluindo o sentinel "__none__"),
                e FormData.get() leria esse em vez do input hidden abaixo. */}
            <Select value={personType} onValueChange={setPersonType}>
              <SelectTrigger id="personType">
                <SelectValue placeholder="Não informado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PERSON_TYPE}>Não informado</SelectItem>
                {PERSON_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PERSON_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Select não envia valor "vazio" nativamente — replicamos como input hidden coerente com o schema. */}
            <input type="hidden" name="personType" value={personType === NO_PERSON_TYPE ? "" : personType} />
          </Field>
          <Field
            label={documentLabel}
            htmlFor="document"
            error={fieldErrors.document}
            hint={personType === "company" ? "Aceita CNPJ numérico ou o novo formato alfanumérico da Receita Federal." : undefined}
          >
            <Input
              id="document"
              name="document"
              defaultValue={formatDocumentForDisplay(client?.personType, client?.document ?? null) ?? ""}
              maxLength={32}
              error={!!fieldErrors.document}
              placeholder={personType === "individual" ? "000.000.000-00" : personType === "company" ? "00.000.000/0000-00" : ""}
            />
          </Field>
          <Field label="Status" htmlFor="status" error={fieldErrors.status}>
            <Select name="status" defaultValue={client?.status ?? "lead"}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {CLIENT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {mode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>Contato principal</CardTitle>
            <CardDescription>Opcional — pode ser preenchido depois, na Ficha Mestre.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="contactName" error={fieldErrors.contactName}>
              <Input id="contactName" name="contactName" maxLength={160} error={!!fieldErrors.contactName} />
            </Field>
            <Field label="Cargo" htmlFor="contactJobTitle" error={fieldErrors.contactJobTitle}>
              <Input id="contactJobTitle" name="contactJobTitle" maxLength={120} error={!!fieldErrors.contactJobTitle} />
            </Field>
            <Field label="Tipo" htmlFor="contactType" error={fieldErrors.contactType}>
              <Input id="contactType" name="contactType" maxLength={60} placeholder="Comercial, financeiro..." error={!!fieldErrors.contactType} />
            </Field>
            <Field label="E-mail" htmlFor="contactEmail" error={fieldErrors.contactEmail}>
              <Input id="contactEmail" name="contactEmail" type="email" maxLength={254} error={!!fieldErrors.contactEmail} />
            </Field>
            <Field label="Telefone" htmlFor="contactPhone" error={fieldErrors.contactPhone}>
              <Input id="contactPhone" name="contactPhone" maxLength={30} error={!!fieldErrors.contactPhone} />
            </Field>
            <Field label="WhatsApp" htmlFor="contactWhatsapp" error={fieldErrors.contactWhatsapp}>
              <Input id="contactWhatsapp" name="contactWhatsapp" maxLength={30} error={!!fieldErrors.contactWhatsapp} />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Gestão</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Origem" htmlFor="source" error={fieldErrors.source}>
            <Input id="source" name="source" defaultValue={client?.source ?? ""} maxLength={120} placeholder="Indicação, site, evento..." error={!!fieldErrors.source} />
          </Field>
          <Field label="Responsável Atlaz" htmlFor="ownerUserId" error={fieldErrors.ownerUserId}>
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
          <CardTitle>Outras informações</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <Field label="Site" htmlFor="website" error={fieldErrors.website} hint="Ex.: atlazcompany.com (adicionamos https:// automaticamente).">
            <Input id="website" name="website" defaultValue={client?.website ?? ""} maxLength={2048} error={!!fieldErrors.website} />
          </Field>
          <Field label="Observações" htmlFor="notes" error={fieldErrors.notes}>
            <Textarea id="notes" name="notes" defaultValue={client?.notes ?? ""} maxLength={10000} rows={4} error={!!fieldErrors.notes} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar cliente"}
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
