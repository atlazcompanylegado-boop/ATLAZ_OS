import { Wallet } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function FinanceiroPage() {
  return (
    <ModulePlaceholder
      title="Financeiro"
      phase="Fase 2"
      icon={Wallet}
      description="Contas a pagar/receber, receitas, despesas, MRR, faturamento e projeções — ligado a cliente, projeto, chamado e contrato."
    />
  );
}
