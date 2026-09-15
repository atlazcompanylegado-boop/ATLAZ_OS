"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Phone, MessageCircle, MoreVertical, Plus, Star, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { ContactForm, type ContactFormValues } from "./contact-form";
import {
  createContactAction,
  deleteContactAction,
  setPrimaryContactAction,
  updateContactAction,
  type ContactActionResult,
} from "@/app/(app)/clientes/actions";
import type { ClientContactRow } from "@/server/repositories/client-contact-repository";

export function ContactManager({ clientId, contacts, canWrite }: { clientId: string; contacts: ClientContactRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [drawerContact, setDrawerContact] = React.useState<ClientContactRow | null | undefined>(undefined); // undefined = fechado, null = criar
  const [deleteTarget, setDeleteTarget] = React.useState<ClientContactRow | null>(null);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string> | undefined>();

  function closeDrawer() {
    setDrawerContact(undefined);
    setFormError(undefined);
    setFieldErrors(undefined);
  }

  function handleResult(result: ContactActionResult, successMessage: string) {
    if (result.ok) {
      toast.success(successMessage);
      closeDrawer();
      router.refresh();
      return true;
    }
    setFormError(result.error);
    setFieldErrors(result.fieldErrors);
    return false;
  }

  async function handleSubmit(values: ContactFormValues) {
    setPending(true);
    setFormError(undefined);
    setFieldErrors(undefined);
    const input = {
      name: values.name,
      jobTitle: values.jobTitle,
      type: values.type,
      email: values.email,
      phone: values.phone,
      whatsapp: values.whatsapp,
      isPrimary: values.isPrimary,
      notes: values.notes,
    };
    const result =
      drawerContact === null
        ? await createContactAction(clientId, input)
        : await updateContactAction(clientId, drawerContact!.id, input);
    setPending(false);
    handleResult(result, drawerContact === null ? "Contato adicionado." : "Contato atualizado.");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setPending(true);
    const result = await deleteContactAction(clientId, deleteTarget.id);
    setPending(false);
    if (result.ok) {
      toast.success("Contato removido.");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleSetPrimary(contact: ClientContactRow) {
    const result = await setPrimaryContactAction(clientId, contact.id);
    if (result.ok) {
      toast.success(`${contact.name} agora é o contato principal.`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">
          {contacts.length} {contacts.length === 1 ? "contato" : "contatos"}
        </p>
        {canWrite ? (
          <Button size="sm" onClick={() => setDrawerContact(null)}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Adicionar contato
          </Button>
        ) : null}
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          title="Nenhum contato cadastrado"
          description="Adicione o primeiro contato deste cliente."
          action={canWrite ? <Button size="sm" onClick={() => setDrawerContact(null)}>Adicionar contato</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <Card key={contact.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink-1">{contact.name}</p>
                  {contact.isPrimary ? <Badge variant="accent">Principal</Badge> : null}
                  {contact.type ? <Badge variant="neutral">{contact.type}</Badge> : null}
                </div>
                {contact.jobTitle ? <p className="text-xs text-ink-3">{contact.jobTitle}</p> : null}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-ink-2">
                  {contact.email ? (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" strokeWidth={1.5} /> {contact.email}
                    </span>
                  ) : null}
                  {contact.phone ? (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" strokeWidth={1.5} /> {contact.phone}
                    </span>
                  ) : null}
                  {contact.whatsapp ? (
                    <span className="flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> {contact.whatsapp}
                    </span>
                  ) : null}
                </div>
              </div>
              {canWrite ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Ações de ${contact.name}`}>
                      <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDrawerContact(contact)}>
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} /> Editar
                    </DropdownMenuItem>
                    {!contact.isPrimary ? (
                      <DropdownMenuItem onClick={() => handleSetPrimary(contact)}>
                        <Star className="h-3.5 w-3.5" strokeWidth={1.5} /> Definir como principal
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => setDeleteTarget(contact)} className="text-danger">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <Drawer open={drawerContact !== undefined} onOpenChange={(open) => !open && closeDrawer()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{drawerContact === null ? "Adicionar contato" : "Editar contato"}</DrawerTitle>
          </DrawerHeader>
          {drawerContact !== undefined ? (
            <ContactForm
              key={drawerContact?.id ?? "new"}
              contact={drawerContact}
              pending={pending}
              formError={formError}
              fieldErrors={fieldErrors}
              onCancel={closeDrawer}
              onSubmit={handleSubmit}
            />
          ) : null}
        </DrawerContent>
      </Drawer>

      <Modal open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Remover contato</ModalTitle>
            <ModalDescription>
              Tem certeza que deseja remover {deleteTarget?.name}? Esta ação não pode ser desfeita.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} loading={pending}>
              Remover
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
