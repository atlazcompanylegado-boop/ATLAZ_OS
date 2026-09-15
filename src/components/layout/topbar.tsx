"use client";

import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, User as UserIcon } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { GlobalSearch } from "@/components/ui/search";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FLAT_NAVIGATION } from "@/config/navigation";
import { signOutAction } from "@/app/(app)/actions";

function initials(nameOrEmail: string) {
  const base = nameOrEmail.split("@")[0] ?? nameOrEmail;
  return base.slice(0, 2).toUpperCase();
}

export function Topbar({
  userLabel,
  onOpenMobileNav,
  permissions,
}: {
  userLabel: string;
  onOpenMobileNav: () => void;
  permissions?: readonly string[];
}) {
  const pathname = usePathname();
  const current = FLAT_NAVIGATION.find((item) => pathname.startsWith(item.href));

  return (
    <header className="surface-elevation-1 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--glass-border)] px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileNav}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-ink-2 transition-colors duration-200 hover:bg-surface-2 hover:text-ink-1 md:hidden"
          aria-label="Abrir navegação"
        >
          <Menu className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </button>
        <Breadcrumb items={[{ label: "ATLΛZ OS", href: "/dashboard" }, { label: current?.label ?? "" }]} />
      </div>

      <div className="flex items-center gap-3">
        <GlobalSearch permissions={permissions} />

        <Tooltip>
          <TooltipTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1">
              <Bell className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Nenhuma notificação no momento</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-sm p-1 transition-colors hover:bg-surface-2">
              <Avatar>
                <AvatarFallback>{initials(userLabel)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="flex items-center gap-2 normal-case tracking-normal text-ink-1">
              <UserIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
              {userLabel}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void signOutAction();
              }}
              className="text-danger data-[highlighted]:text-danger"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
