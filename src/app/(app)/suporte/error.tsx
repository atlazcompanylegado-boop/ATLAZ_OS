"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Error boundary do módulo Suporte — nunca vaza mensagem de banco/stack (mesmo padrão de Clientes/Projetos). */
export default function SuporteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar Suporte"
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
