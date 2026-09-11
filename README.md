# ATLΛZ OS

Sistema operacional interno da **Atlaz Company**. Ver `docs/` para arquitetura, design system, banco, segurança e roadmap completo.

## Stack

Next.js 15 (App Router) + TypeScript, Tailwind CSS, Radix UI, Drizzle ORM, Supabase (Postgres + Auth), Zod, Vitest. Ver justificativa em [`docs/arquitetura.md`](docs/arquitetura.md).

## Setup local

```bash
npm install
cp .env.example .env.local
```

Preencha `.env.local` com as credenciais do projeto Supabase (URL, anon key, service role key, `DATABASE_URL`) e o e-mail que deve virar o primeiro super admin (`SUPER_ADMIN_EMAIL`).

```bash
npm run db:generate   # gera migrations a partir de src/server/db/schema
npm run db:migrate    # aplica as migrations no Supabase configurado
npm run db:seed       # garante a organização Atlaz Company e o bootstrap do super admin
npm run dev           # http://localhost:3000
```

O `SUPER_ADMIN_EMAIL` precisa já existir como usuário no Supabase Auth (crie via convite/signup) **antes** de rodar o seed — ver [`docs/seguranca.md`](docs/seguranca.md) §4.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run db:generate` | gera SQL de migration a partir do schema Drizzle |
| `npm run db:migrate` | aplica migrations pendentes |
| `npm run db:seed` | seed idempotente (organização + bootstrap do super admin) |

## Estrutura

Ver [`docs/arquitetura.md`](docs/arquitetura.md) §4.

## Nota sobre o caminho do projeto

Este projeto nasce em `C:\Users\ponte\OneDrive\Desktop\Legado Atlaz OS` (não `F:\Legado Atlaz OS` — pasta que não existia neste computador). Como o caminho está dentro do OneDrive, exclua `node_modules`, `.next` e `.env.local` da sincronização do OneDrive (clique direito → "Liberar espaço"/excluir da sincronização) para evitar lentidão e bloqueio de arquivo durante `npm install`/`next build`. Esses diretórios já estão fora do Git via `.gitignore`.
