import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="breadcrumb" className={cn("flex items-center gap-1.5 text-sm", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${i}`}>
            {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-ink-3" strokeWidth={1.5} /> : null}
            {item.href && !isLast ? (
              <Link href={item.href} className="text-ink-2 transition-colors hover:text-ink-1">
                {item.label}
              </Link>
            ) : (
              <span className={cn(isLast ? "text-ink-1" : "text-ink-2")} aria-current={isLast ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
