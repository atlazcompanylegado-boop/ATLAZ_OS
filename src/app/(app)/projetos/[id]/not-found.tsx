import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** ID inexistente, inválido ou de outra organização — nunca revela qual é o caso (mesmo contrato de Clientes). */
export default function ProjetoNaoEncontrado() {
  return (
    <EmptyState
      icon={SearchX}
      title="Projeto não encontrado"
      description="Ele pode ter sido removido ou o link pode estar incorreto."
      action={
        <Button asChild size="sm">
          <Link href="/projetos">Voltar para Projetos</Link>
        </Button>
      }
      className="mt-10"
    />
  );
}
