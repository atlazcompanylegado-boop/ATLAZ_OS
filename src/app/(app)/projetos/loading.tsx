import { Skeleton } from "@/components/ui/skeleton";

/** Mesma estrutura da página real para evitar layout shift (mesmo padrão de Clientes). */
export default function ProjetosLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-9 w-48" />
      </div>

      <Skeleton className="h-96 w-full" />
    </div>
  );
}
