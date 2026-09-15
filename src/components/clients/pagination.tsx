import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Paginação simples (25/página) — sem infinite scroll (ver docs/clientes-checkpoint-1.md §29). */
export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row">
      <p className="text-sm text-ink-2">
        {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-2">
        <PageLink href={buildHref(page - 1)} disabled={page <= 1} label="Anterior" icon={ChevronLeft} />
        <span className="px-2 text-sm text-ink-2">
          Página {page} de {totalPages}
        </span>
        <PageLink href={buildHref(page + 1)} disabled={page >= totalPages} label="Próxima" icon={ChevronRight} iconEnd />
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  icon: Icon,
  iconEnd,
}: {
  href: string;
  disabled: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconEnd?: boolean;
}) {
  const className = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-sm text-ink-2 transition-colors duration-150",
    disabled ? "pointer-events-none opacity-40" : "hover:border-border-strong hover:text-ink-1",
  );
  const content = (
    <>
      {!iconEnd ? <Icon className="h-3.5 w-3.5" strokeWidth={1.5} /> : null}
      {label}
      {iconEnd ? <Icon className="h-3.5 w-3.5" strokeWidth={1.5} /> : null}
    </>
  );
  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        {content}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
