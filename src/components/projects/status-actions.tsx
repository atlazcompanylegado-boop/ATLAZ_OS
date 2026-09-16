"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";
import { changeProjectStatusAction, reopenProjectAction } from "@/app/(app)/projetos/actions";
import { isFinalProjectStatus, type ProjectStatus } from "@/lib/validation/project";

type PendingAction = "completed" | "cancelled" | "reopen" | null;

/**
 * Concluir/Cancelar/Reabrir usam operações explícitas do service (não o formulário
 * de edição comum) — mesmo contrato descrito no Checkpoint B da fundação.
 */
export function ProjectStatusActions({ projectId, status, version }: { projectId: string; status: ProjectStatus; version: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState<PendingAction>(null);
  const [pending, setPending] = React.useState(false);

  async function run() {
    if (!confirming) return;
    setPending(true);
    const result =
      confirming === "reopen"
        ? await reopenProjectAction(projectId, version)
        : await changeProjectStatusAction(projectId, version, confirming);
    setPending(false);
    setConfirming(null);
    if (result.ok) {
      toast.success(
        confirming === "reopen" ? "Projeto reaberto." : confirming === "completed" ? "Projeto concluído." : "Projeto cancelado.",
      );
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  if (isFinalProjectStatus(status)) {
    return (
      <>
        <Button variant="outline" onClick={() => setConfirming("reopen")}>
          <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
          Reabrir projeto
        </Button>
        <ConfirmModal
          open={confirming === "reopen"}
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Reabrir projeto"
          description="O projeto voltará para Em andamento. O progresso e a data de conclusão anteriores serão limpos."
          confirmLabel="Reabrir"
          pending={pending}
          onConfirm={run}
        />
      </>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={() => setConfirming("completed")}>
        <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
        Concluir
      </Button>
      <Button variant="outline" onClick={() => setConfirming("cancelled")}>
        <XCircle className="h-4 w-4" strokeWidth={1.5} />
        Cancelar
      </Button>

      <ConfirmModal
        open={confirming === "completed"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Concluir projeto"
        description="O progresso será definido como 100% e a data de conclusão será registrada agora."
        confirmLabel="Concluir"
        pending={pending}
        onConfirm={run}
      />
      <ConfirmModal
        open={confirming === "cancelled"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Cancelar projeto"
        description="O projeto será marcado como cancelado. O histórico é preservado e o projeto pode ser reaberto depois."
        confirmLabel="Cancelar projeto"
        destructive
        pending={pending}
        onConfirm={run}
      />
    </>
  );
}

function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>{description}</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Voltar
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
