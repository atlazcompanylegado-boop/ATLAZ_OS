"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, CheckCircle2, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";
import { changeDomainStatusAction } from "@/app/(app)/dominios/actions";
import type { DomainStatus } from "@/lib/validation/domain";

interface ActionDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  target: DomainStatus;
  destructive?: boolean;
  confirmTitle: string;
  confirmDescription: string;
}

/**
 * Ações válidas por status atual (Checkpoint A §18/§39) — nunca um select genérico de
 * status: cada estado só mostra as transições aprovadas. "Inativar" é a única ação
 * destrutiva (substitui exclusão — o histórico é preservado e o domínio pode ser
 * reativado depois, sujeito à unicidade parcial do nome).
 */
const ACTIONS_BY_STATUS: Record<DomainStatus, ActionDef[]> = {
  active: [
    { key: "transfer", label: "Marcar em transferência", icon: ArrowLeftRight, target: "transferring", confirmTitle: "Marcar em transferência", confirmDescription: "O domínio passa para Em transferência." },
    { key: "deactivate", label: "Inativar", icon: Ban, target: "inactive", destructive: true, confirmTitle: "Inativar domínio", confirmDescription: "O domínio deixa de ser gerido ativamente. O histórico é preservado e ele pode ser reativado depois." },
  ],
  transferring: [
    { key: "complete", label: "Concluir transferência", icon: CheckCircle2, target: "active", confirmTitle: "Concluir transferência", confirmDescription: "O domínio volta para Ativo." },
    { key: "deactivate", label: "Inativar", icon: Ban, target: "inactive", destructive: true, confirmTitle: "Inativar domínio", confirmDescription: "O domínio deixa de ser gerido ativamente. O histórico é preservado e ele pode ser reativado depois." },
  ],
  inactive: [
    { key: "reactivate", label: "Reativar", icon: RotateCcw, target: "active", confirmTitle: "Reativar domínio", confirmDescription: "O domínio volta para Ativo. Se já existir outro domínio ativo com o mesmo nome nesta organização, a reativação será rejeitada." },
  ],
};

export function DomainStatusActions({ domainId, status, version }: { domainId: string; status: DomainStatus; version: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState<ActionDef | null>(null);
  const [pending, setPending] = React.useState(false);
  const actions = ACTIONS_BY_STATUS[status];

  async function run() {
    if (!confirming) return;
    setPending(true);
    const result = await changeDomainStatusAction(domainId, version, confirming.target);
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
