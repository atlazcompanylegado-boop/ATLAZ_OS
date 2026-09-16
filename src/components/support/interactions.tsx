"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { addCommentAction } from "@/app/(app)/suporte/actions";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export interface TicketCommentEntry {
  id: string;
  content: string;
  authorName: string | null;
  createdAt: Date;
}

/**
 * Interações — comentários em ordem cronológica ASCENDENTE (conversa, diferente da
 * Timeline, que é descendente). Imutáveis: sem editar/excluir na UI (contrato aprovado
 * no Checkpoint B). Conteúdo sempre como texto puro (`whitespace-pre-wrap`), nunca
 * `dangerouslySetInnerHTML` — sem rich text/HTML.
 */
export function TicketInteractions({ ticketId, comments, canComment }: { ticketId: string; comments: TicketCommentEntry[]; canComment: boolean }) {
  return (
    <div className="space-y-6">
      {comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Nenhum comentário ainda" description="O histórico de atendimento aparecerá aqui." />
      ) : (
        <ol className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-md border border-border bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink-1">{comment.authorName ?? "Sistema"}</p>
                <p className="text-xs text-ink-3">{dateFormatter.format(comment.createdAt)}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{comment.content}</p>
            </li>
          ))}
        </ol>
      )}

      {canComment ? <CommentComposer ticketId={ticketId} /> : null}
    </div>
  );
}

function CommentComposer({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [content, setContent] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (!content.trim()) return;
    setPending(true);
    setError(null);
    const result = await addCommentAction(ticketId, content);
    setPending(false);
    if (result.ok) {
      setContent("");
      toast.success("Comentário adicionado.");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <Label htmlFor="new-comment">Adicionar comentário</Label>
      <Textarea
        id="new-comment"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={10000}
        placeholder="Escreva uma atualização sobre o atendimento..."
        error={!!error}
        aria-describedby={error ? "new-comment-error" : undefined}
      />
      {error ? <p id="new-comment-error" className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="button" onClick={submit} loading={pending} disabled={!content.trim()}>
          Adicionar comentário
        </Button>
      </div>
    </div>
  );
}
