"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import type { ClientContactRow } from "@/server/repositories/client-contact-repository";

export interface ContactFormValues {
  name: string;
  jobTitle: string;
  type: string;
  email: string;
  phone: string;
  whatsapp: string;
  isPrimary: boolean;
  notes: string;
}

function toValues(contact?: ClientContactRow | null): ContactFormValues {
  return {
    name: contact?.name ?? "",
    jobTitle: contact?.jobTitle ?? "",
    type: contact?.type ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    whatsapp: contact?.whatsapp ?? "",
    isPrimary: contact?.isPrimary ?? false,
    notes: contact?.notes ?? "",
  };
}

/** Corpo do Drawer de contato — usado para adicionar e para editar (mesmo componente). */
export function ContactForm({
  contact,
  pending,
  formError,
  fieldErrors,
  onCancel,
  onSubmit,
}: {
  contact?: ClientContactRow | null;
  pending: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  onCancel: () => void;
  onSubmit: (values: ContactFormValues) => void;
}) {
  const [values, setValues] = React.useState<ContactFormValues>(() => toValues(contact));
  const errors = fieldErrors ?? {};

  function set<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <DrawerBody className="space-y-4">
        {formError ? (
          <Alert variant="danger" title="Não foi possível salvar o contato">
            {formError}
          </Alert>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Nome</Label>
          <Input id="contact-name" value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={160} required error={!!errors.name} />
          {errors.name ? <p className="text-xs text-danger">{errors.name}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="contact-job-title">Cargo</Label>
            <Input id="contact-job-title" value={values.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} maxLength={120} error={!!errors.jobTitle} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-type">Tipo</Label>
            <Input id="contact-type" value={values.type} onChange={(e) => set("type", e.target.value)} maxLength={60} placeholder="Comercial, financeiro..." error={!!errors.type} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact-email">E-mail</Label>
          <Input id="contact-email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} maxLength={254} error={!!errors.email} />
          {errors.email ? <p className="text-xs text-danger">{errors.email}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Telefone</Label>
            <Input id="contact-phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} error={!!errors.phone} />
            {errors.phone ? <p className="text-xs text-danger">{errors.phone}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-whatsapp">WhatsApp</Label>
            <Input id="contact-whatsapp" value={values.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} maxLength={30} error={!!errors.whatsapp} />
            {errors.whatsapp ? <p className="text-xs text-danger">{errors.whatsapp}</p> : null}
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-ink-1">
          <Checkbox checked={values.isPrimary} onCheckedChange={(checked) => set("isPrimary", checked === true)} />
          Definir como contato principal
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="contact-notes">Observações</Label>
          <Textarea id="contact-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} maxLength={5000} rows={3} error={!!errors.notes} />
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar contato"}
        </Button>
      </DrawerFooter>
    </form>
  );
}
