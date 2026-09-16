# ATLΛZ OS

Sistema operacional interno da **Atlaz Company**. Ver `docs/` para arquitetura, design system, banco, segurança e roadmap completo.

## Stack

Next.js 16 (App Router) + React 19, TypeScript, Tailwind CSS, Radix UI, Drizzle ORM, Supabase (Postgres + Auth), Zod, Vitest. Ver justificativa em [`docs/arquitetura.md`](docs/arquitetura.md).

Clientes / Ficha Mestre está **concluído** (Checkpoints 1–3): sessão/autorização,
migrations, repository/service, validação, listagem, cadastro, ficha, contatos,
timeline, edição/concorrência, navegação, Dashboard e QA (segurança, responsividade,
build) entregues e testados. Ver os relatórios de
[Checkpoint 1](docs/clientes-checkpoint-1.md), [Checkpoint 2](docs/clientes-checkpoint-2.md),
[Checkpoint 3](docs/clientes-checkpoint-3.md) e a
[reconciliação do schema](docs/clientes-reconciliacao.md). Projetos também está
**concluído e publicado** (ver abaixo). Suporte está tecnicamente pronto,
aguardando decisão de publicação (ver abaixo). Domínios e Infraestrutura —
os módulos restantes da Fase 1 — ainda não foram implementados, ver
[`docs/roadmap.md`](docs/roadmap.md). Os testes isolados de fundação rodam com
`npm run test:foundation`, sem credenciais nem banco remoto.

Projetos: fundação aplicada e validada em produção
([Checkpoint A](docs/projetos-checkpoint-a.md), [B](docs/projetos-checkpoint-b.md),
[C1](docs/projetos-checkpoint-c1.md)), UI/integração com a Ficha Mestre do Cliente
implementadas ([Checkpoint C2](docs/projetos-checkpoint-c2.md)), QA técnico final
([Checkpoint D](docs/projetos-checkpoint-d.md)) e a timeline consolidada do
Cliente (eventos de Projetos incluídos com autorização correta,
[Checkpoint D.1](docs/projetos-checkpoint-d1.md)) concluídos: lint, typecheck,
testes (318+1), foundation (210) e build verdes, navegação ativa. **Publicado
em produção em 16/09/2026** ([Checkpoint D.2](docs/projetos-checkpoint-d2.md):
commit `82539d2`, deploy Render, smoke test aprovado), com o QA visual
autenticado aceito como pendência conhecida (ver Checkpoint D §37–42).

Suporte: fundação aplicada e validada em produção
([Checkpoint A](docs/suporte-checkpoint-a.md), [B](docs/suporte-checkpoint-b.md),
[C1](docs/suporte-checkpoint-c1.md)), UI/integração com a Ficha Mestre do Cliente
implementadas ([Checkpoint C2](docs/suporte-checkpoint-c2.md)), tradução dos
eventos de Suporte na Timeline consolidada do Cliente
([Checkpoint C2.1](docs/suporte-checkpoint-c2-1.md)) e QA técnico final
([Checkpoint D](docs/suporte-checkpoint-d.md)) concluídos: listagem, KPIs,
filtros/busca (incluindo por número do chamado), formulário, ficha,
comentários, ações de status explícitas, timeline, navegação ativa. Lint,
typecheck, testes (500+2), foundation (343) e build verdes. **Implementação
concluída localmente, aguardando publicação** — QA visual autenticado
permanece pendente (mesma ressalva de Clientes/Projetos).

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
| `npm run test:foundation` | testes de sessão/fundação de Clientes, isolados (Postgres em memória) |
| `npm run db:generate` | gera SQL de migration a partir do schema Drizzle |
| `npm run db:migrate` | aplica migrations pendentes |
| `npm run db:seed` | seed idempotente (organização + bootstrap do super admin) |

## Estrutura

Ver [`docs/arquitetura.md`](docs/arquitetura.md) §4.

## Nota sobre o caminho do projeto

Este projeto nasce em `C:\Users\ponte\OneDrive\Desktop\Legado Atlaz OS` (não `F:\Legado Atlaz OS` — pasta que não existia neste computador). Como o caminho está dentro do OneDrive, exclua `node_modules`, `.next` e `.env.local` da sincronização do OneDrive (clique direito → "Liberar espaço"/excluir da sincronização) para evitar lentidão e bloqueio de arquivo durante `npm install`/`next build`. Esses diretórios já estão fora do Git via `.gitignore`.
