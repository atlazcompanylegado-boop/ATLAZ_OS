import {
  LayoutDashboard,
  Users,
  FolderKanban,
  LifeBuoy,
  Target,
  FileText,
  FileSignature,
  Wallet,
  UsersRound,
  Megaphone,
  Instagram,
  Clapperboard,
  Sparkles,
  Lock,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { can, type PermissionKey } from "@/config/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** "available": rota real e funcional na Fase 0. "planned": placeholder honesto (ver docs/roadmap.md). */
  status: "available" | "planned";
  phase?: string;
  /**
   * Some itens "available" exigem permissão para até aparecer (ex.: Clientes →
   * `client:read`). Aceita uma chave única ou uma lista (ex.: Projetos precisa de
   * `project:read` **e** `client:read`, o mesmo par exigido por `authorizeProjectSession`).
   * Ausente = sempre visível (comportamento herdado, ex.: Equipe).
   */
  permission?: PermissionKey | PermissionKey[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Fonte única da informação de navegação — usada pela Sidebar, pela Busca Global e
 * pelas páginas de placeholder de módulo ainda não implementado. Ver docs/design-system.md §11.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: "Visão",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, status: "available" }],
  },
  {
    label: "Operação",
    items: [
      { label: "Clientes", href: "/clientes", icon: Users, status: "available", permission: "client:read" },
      { label: "Projetos", href: "/projetos", icon: FolderKanban, status: "available", permission: ["project:read", "client:read"] },
      { label: "Suporte", href: "/suporte", icon: LifeBuoy, status: "planned", phase: "Fase 1" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { label: "CRM", href: "/crm", icon: Target, status: "planned", phase: "Fase 2" },
      { label: "Propostas", href: "/propostas", icon: FileText, status: "planned", phase: "Fase 2" },
      { label: "Contratos", href: "/contratos", icon: FileSignature, status: "planned", phase: "Fase 2" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { label: "Financeiro", href: "/financeiro", icon: Wallet, status: "planned", phase: "Fase 2" },
      { label: "Equipe", href: "/equipe", icon: UsersRound, status: "available" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { label: "Marketing", href: "/marketing", icon: Megaphone, status: "planned", phase: "Fase 3" },
      { label: "Atlas Social", href: "/atlas-social", icon: Instagram, status: "planned", phase: "Fase 3" },
      { label: "Atlas Studio", href: "/atlas-studio", icon: Clapperboard, status: "planned", phase: "Fase 4" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Atlas Intelligence", href: "/atlas-intelligence", icon: Sparkles, status: "planned", phase: "Fase 5" },
    ],
  },
  {
    label: "Segurança",
    items: [{ label: "Cofre", href: "/cofre", icon: Lock, status: "planned", phase: "Fase 1" }],
  },
  {
    label: "Sistema",
    items: [{ label: "Configurações", href: "/configuracoes", icon: Settings, status: "planned", phase: "Fase 1" }],
  },
];

export const FLAT_NAVIGATION: NavItem[] = NAVIGATION.flatMap((group) => group.items);

function isNavItemVisible(item: NavItem, permissions: readonly string[] | undefined): boolean {
  if (!item.permission) return true;
  const required = Array.isArray(item.permission) ? item.permission : [item.permission];
  return required.every((key) => can(permissions, key));
}

/** Filtra grupos/itens que exigem uma permissão o usuário não possui — nunca lista o que ele não pode abrir. */
export function getVisibleNavigation(permissions: readonly string[] | undefined): NavGroup[] {
  return NAVIGATION.map((group) => ({ ...group, items: group.items.filter((item) => isNavItemVisible(item, permissions)) })).filter(
    (group) => group.items.length > 0,
  );
}

export function getVisibleFlatNavigation(permissions: readonly string[] | undefined): NavItem[] {
  return FLAT_NAVIGATION.filter((item) => isNavItemVisible(item, permissions));
}
