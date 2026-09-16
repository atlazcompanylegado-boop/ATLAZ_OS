import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** ID inexistente, inválido ou de outra organização — nunca revela qual é o caso (mesmo contrato de Clientes/Projetos). */
export default function ChamadoNaoEncontrado() {
  return (
    <EmptyState
      icon={SearchX}
      title="Chamado não encontrado"
      description="Ele pode ter sido removido ou o link pode estar incorreto."
      action={
        <Button asChild size="sm">
          <Link href="/suporte">Voltar para Suporte</Link>
        </Button>
      }
      className="mt-10"
    />
  );
}
