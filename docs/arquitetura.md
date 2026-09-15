# Arquitetura — ATLΛZ OS

## 1. Decisão de stack

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend + Backend | **Next.js 16 (App Router), TypeScript** | Full-stack em um único deploy: UI, Server Actions e Route Handlers no mesmo projeto. Elimina a necessidade de manter/versionar uma API separada nesta fase. Maduro, bem documentado, excelente suporte no Windows. |
| Estilo | **Tailwind CSS v3 + tokens próprios (CSS variables)** | Utilitário, previsível, zero CSS-in-JS em runtime. Os tokens da identidade Atlaz (cor, tipografia, espaçamento) vivem em `src/design-system/tokens.ts` e em variáveis CSS — Tailwind só consome esses valores, nunca define a identidade sozinho. |
| Componentes acessíveis | **Radix UI (primitives) + CVA (class-variance-authority)** | Dialog, Dropdown, Tabs, Tooltip, Avatar, Popover prontos para teclado/ARIA. CVA controla variantes (size, tone) sem duplicar CSS entre telas. |
| Banco | **PostgreSQL via Supabase** | Já exigido pelo escopo. Dá Auth, Storage e Postgres gerenciado num único provedor, com RLS nativo. |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Schema como código TypeScript, migrations geradas e versionadas em `src/server/db/migrations`, SQL legível (nada de "magia" escondida). Mais simples que Prisma para este porte de projeto (sem binário próprio, sem client gerado pesado). |
| Auth | **Supabase Auth (`@supabase/ssr`)** | Sessão via cookies HTTP-only, integrada ao App Router (server components e middleware). Sem gestão própria de senha/token. |
| Validação | **Zod** | Mesmo schema valida formulário (client) e payload (server action). |
| Ícones | **lucide-react** | Lineares, sem emoji, consistentes com a identidade. |
| Testes | **Vitest + Testing Library** | Rápido, mesma config para unit e componente, sem dependência de browser real nesta fase. |
| Lint/format | **ESLint (eslint-config-next) + Prettier + prettier-plugin-tailwindcss** | Ordenação automática de classes Tailwind, uma única fonte de estilo de código. |
| Package manager | **npm** | Estável no Windows, sem symlink/store global do pnpm para dar problema em antivírus/OneDrive. `npm install` previsível. |

**Explicitamente fora da Fase 0 (por definição do escopo):** Turbo/monorepo, worker de vídeo/fila de jobs, microsserviços, GraphQL. Tudo isso pode entrar depois, sem exigir reescrever a fundação — a separação em `services/repositories` já prepara o terreno.

## 2. Localização do projeto

Por decisão explícita nesta sessão, a base nasce em:

```
C:\Users\ponte\OneDrive\Desktop\Legado Atlaz OS
```

(o caminho `F:\Legado Atlaz OS` mencionado originalmente não existe neste computador). Como o projeto vive dentro do OneDrive, duas medidas de proteção:

1. `node_modules`, `.next`, `dist`, `.env*` ficam no `.gitignore` **e** devem ser marcados como "sempre manter só neste dispositivo, sem upload" nas configurações do OneDrive (ou adicionados à lista de exclusão de sincronização do OneDrive) para evitar lentidão/bloqueio de arquivos durante `npm install`/`next build`.
2. Nenhum segredo é gravado em arquivo versionado — apenas em `.env.local`, que também é excluído do sync por estar no `.gitignore` (o OneDrive ainda sincroniza arquivos fora do git, então a exclusão manual do OneDrive continua necessária).

## 3. Camadas lógicas

```
UI (app/**/page.tsx, componentes)
   → actions (src/app/**/actions.ts — Server Actions, "controllers")
      → services (src/server/services/*)
         → repositories (src/server/repositories/*)
            → db (src/server/db — Drizzle + Postgres)

Integrações externas (GitHub, Vercel, Instagram, WhatsApp, ...)
   → adapters (src/server/adapters/*) — nunca chamadas direto da UI ou da service sem passar por um adapter com interface própria
```

Regras:

- **UI nunca fala com o banco.** Client Components só chamam Server Actions ou rotas internas; nunca importam `drizzle` ou `@supabase/*` com service role.
- **Service concentra regra de negócio.** Ex.: "criar cliente" valida CNPJ, decide status inicial, dispara timeline — tudo em `services/clientes.ts`, não espalhado em handlers.
- **Repository só faz acesso a dado.** Sem regra de negócio, só query/mutation tipada.
- **Adapter isola API externa.** Ex.: `adapters/github.ts` expõe `getLatestCommit(repoId)`; troca de provedor (ou mock em teste) não vaza para o resto do sistema.
- **Toda mutação relevante grava timeline/audit** (ver `docs/seguranca.md`) a partir da camada de service — nunca da UI.

## 4. Estrutura de pastas (Fase 0)

```
Legado Atlaz OS/
├── docs/                        # este documento e os demais (design-system, banco, seguranca, roadmap)
├── public/
│   └── brand/                   # logo, favicon, assets de marca
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   └── login/           # tela de login (grupo de rota sem shell autenticado)
│   │   ├── (app)/                # grupo de rota autenticado
│   │   │   ├── layout.tsx        # Shell: Sidebar + Topbar
│   │   │   └── dashboard/
│   │   ├── layout.tsx            # layout raiz (fontes, tema)
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                   # design system (Button, Input, Card, ...)
│   │   ├── layout/                # Sidebar, Topbar, Shell
│   │   └── brand/                 # AtlasParticles, Logo, motivos gráficos
│   ├── design-system/
│   │   └── tokens.ts              # cores, tipografia, espaçamento, radius, shadow, motion
│   ├── server/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── adapters/
│   │   └── db/
│   │       ├── schema/            # tabelas Drizzle
│   │       ├── migrations/        # geradas por drizzle-kit
│   │       ├── client.ts
│   │       └── seed.ts
│   ├── lib/
│   │   ├── supabase/              # client (browser) e server (cookies) adapters
│   │   ├── auth/                  # sessão, RBAC (can(), requireRole())
│   │   └── utils.ts                # cn(), formatters
│   ├── config/
│   │   └── permissions.ts          # matriz de papéis → permissões
│   └── types/
├── tests/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── drizzle.config.ts
```

Módulos funcionais futuros (Clientes, Projetos, CRM, Financeiro, Marketing, Atlas Studio, ...) entram em `src/app/(app)/<modulo>/` + `src/server/services/<modulo>.ts` + `src/server/repositories/<modulo>.ts`, seguindo o mesmo padrão — nada de estrutura nova por módulo.

## 5. Convenções

- TypeScript `strict: true`; sem `any` implícito.
- Server Actions retornam um tipo `Result<T> = { ok: true, data: T } | { ok: false, error: string }` — nunca lançam exceção para o cliente.
- Nomes de tabela em `snake_case` (Postgres), nomes de campo TS em `camelCase` (Drizzle faz o mapeamento).
- Todo texto de UI em português (idioma da operação da Atlaz); nomes de código em inglês.
