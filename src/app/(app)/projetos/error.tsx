"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Error boundary do módulo Projetos — nunca vaza mensagem de banco/stack (mesmo padrão de Clientes). */
export default function ProjetosError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar Projetos"
      description="Algo deu errado ao buscar os dados. Tente novamente em instantes."
      action={
        <Button variant="outline" size="sm" onClick={reset}>
          Tentar novamente
        </Button>
      }
      className="mt-10"
    />
  );
}
