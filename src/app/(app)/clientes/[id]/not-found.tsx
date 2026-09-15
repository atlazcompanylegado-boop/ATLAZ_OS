import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** ID inexistente, inválido ou de outra organização — nunca revela qual é o caso (ver docs/clientes-checkpoint-1.md §53). */
export default function ClienteNaoEncontrado() {
  return (
    <EmptyState
      icon={SearchX}
      title="Cliente não encontrado"
      description="Ele pode ter sido removido ou o link pode estar incorreto."
      action={
        <Button asChild size="sm">
          <Link href="/clientes">Voltar para Clientes</Link>
        </Button>
      }
      className="mt-10"
    />
  );
}
