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

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** "available": rota real e funcional na Fase 0. "planned": placeholder honesto (ver docs/roadmap.md). */
  status: "available" | "planned";
  phase?: string;
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
      { label: "Clientes", href: "/clientes", icon: Users, status: "planned", phase: "Fase 1" },
      { label: "Projetos", href: "/projetos", icon: FolderKanban, status: "planned", phase: "Fase 1" },
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
