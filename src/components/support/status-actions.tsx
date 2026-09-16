"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlayCircle, ListChecks, Clock3, RotateCcw as ResumeIcon, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";
import { changeTicketStatusAction, reopenTicketAction } from "@/app/(app)/suporte/actions";
import type { TicketStatus } from "@/lib/validation/ticket";

interface ActionDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  target: TicketStatus | "reopen";
  destructive?: boolean;
  confirmTitle: string;
  confirmDescription: string;
}

/**
 * Ações válidas por status atual (Checkpoint C2 §29) — nunca um select genérico de
 * status: cada estado só mostra transições que fazem sentido operacionalmente.
 * Transições entre não-finais (iniciar/triagem/aguardar/retomar) e resolver/cancelar
 * usam o mesmo `changeTicketStatusAction`; reabrir usa `reopenTicketAction` (o único
 * caminho válido para sair de um estado final).
 */
const ACTIONS_BY_STATUS: Record<TicketStatus, ActionDef[]> = {
  open: [
    { key: "start", label: "Iniciar atendimento", icon: PlayCircle, target: "in_progress", confirmTitle: "Iniciar atendimento", confirmDescription: "O chamado passa para Em atendimento." },
    { key: "triage", label: "Enviar para triagem", icon: ListChecks, target: "triage", confirmTitle: "Enviar para triagem", confirmDescription: "O chamado passa para Triagem." },
    { key: "cancel", label: "Cancelar", icon: XCircle, target: "cancelled", destructive: true, confirmTitle: "Cancelar chamado", confirmDescription: "O chamado será marcado como cancelado. O histórico é preservado e pode ser reaberto depois." },
  ],
  triage: [
    { key: "start", label: "Iniciar atendimento", icon: PlayCircle, target: "in_progress", confirmTitle: "Iniciar atendimento", confirmDescription: "O chamado passa para Em atendimento." },
    { key: "cancel", label: "Cancelar", icon: XCircle, target: "cancelled", destructive: true, confirmTitle: "Cancelar chamado", confirmDescription: "O chamado será marcado como cancelado. O histórico é preservado e pode ser reaberto depois." },
  ],
  in_progress: [
    { key: "wait", label: "Aguardar cliente", icon: Clock3, target: "waiting_client", confirmTitle: "Aguardar cliente", confirmDescription: "O chamado passa para Aguardando cliente." },
    { key: "resolve", label: "Resolver", icon: CheckCircle2, target: "resolved", confirmTitle: "Resolver chamado", confirmDescription: "O chamado será marcado como resolvido agora." },
    { key: "cancel", label: "Cancelar", icon: XCircle, target: "cancelled", destructive: true, confirmTitle: "Cancelar chamado", confirmDescription: "O chamado será marcado como cancelado. O histórico é preservado e pode ser reaberto depois." },
  ],
  waiting_client: [
    { key: "resume", label: "Retomar atendimento", icon: ResumeIcon, target: "in_progress", confirmTitle: "Retomar atendimento", confirmDescription: "O chamado volta para Em atendimento." },
    { key: "resolve", label: "Resolver", icon: CheckCircle2, target: "resolved", confirmTitle: "Resolver chamado", confirmDescription: "O chamado será marcado como resolvido agora." },
    { key: "cancel", label: "Cancelar", icon: XCircle, target: "cancelled", destructive: true, confirmTitle: "Cancelar chamado", confirmDescription: "O chamado será marcado como cancelado. O histórico é preservado e pode ser reaberto depois." },
  ],
  resolved: [
    { key: "reopen", label: "Reabrir", icon: RotateCcw, target: "reopen", confirmTitle: "Reabrir chamado", confirmDescription: "O chamado volta para Em atendimento." },
  ],
  cancelled: [
    { key: "reopen", label: "Reabrir", icon: RotateCcw, target: "reopen", confirmTitle: "Reabrir chamado", confirmDescription: "O chamado volta para Em atendimento." },
  ],
};

export function TicketStatusActions({ ticketId, status, version }: { ticketId: string; status: TicketStatus; version: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState<ActionDef | null>(null);
  const [pending, setPending] = React.useState(false);
  const actions = ACTIONS_BY_STATUS[status];

  async function run() {
    if (!confirming) return;
    setPending(true);
    const result = confirming.target === "reopen"
      ? await reopenTicketAction(ticketId, version)
      : await changeTicketStatusAction(ticketId, version, confirming.target);
    setPending(false);
    setConfirming(null);
    if (result.ok) {
      toast.success(`${confirming.label} — concluído.`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      {actions.map((actionDef) => (
        <Button key={actionDef.key} variant="outline" onClick={() => setConfirming(actionDef)}>
          <actionDef.icon className="h-4 w-4" strokeWidth={1.5} />
          {actionDef.label}
        </Button>
      ))}
      {confirming ? (
        <Modal open onOpenChange={(open) => !open && setConfirming(null)}>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>{confirming.confirmTitle}</ModalTitle>
              <ModalDescription>{confirming.confirmDescription}</ModalDescription>
            </ModalHeader>
            <ModalFooter>
              <Button variant="outline" onClick={() => setConfirming(null)} disabled={pending}>
                Voltar
              </Button>
              <Button variant={confirming.destructive ? "destructive" : "primary"} onClick={run} loading={pending}>
                {confirming.label}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ) : null}
    </>
  );
}
