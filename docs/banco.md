# Banco de Dados — ATLΛZ OS

## 1. Plataforma

PostgreSQL gerenciado via **Supabase**. Acesso de aplicação por **Drizzle ORM**; acesso administrativo (migrations, RLS, funções) por SQL puro versionado.

## 2. Fluxo de schema

1. Alterar `src/server/db/schema/*.ts` (fonte de verdade em TypeScript).
2. `npm run db:generate` → drizzle-kit gera SQL em `src/server/db/migrations/`.
3. Revisar o SQL gerado manualmente (RLS e triggers não são geradas pelo Drizzle — entram como migration SQL manual complementar na mesma pasta).
4. `npm run db:migrate` aplica no Supabase configurado em `.env.local`.
5. Nunca alterar tabela direto pelo painel do Supabase em produção sem depois refletir a mudança numa migration — schema manual sem registro é proibido (regra 56 do escopo).

## 3. Modelo de dados — Fase 0

Fase 0 cria só o necessário para autenticação, organização, papéis e auditoria. Módulos de negócio (clientes, projetos, CRM, financeiro, marketing...) entram nas fases seguintes, cada um com sua própria migration.

```
organizations
  id           uuid PK default gen_random_uuid()
  name         text not null                    -- "Atlaz Company"
  slug         text unique not null
  created_at   timestamptz not null default now()

profiles                                          -- espelha auth.users (1:1)
  id           uuid PK references auth.users(id) on delete cascade
  full_name    text
  email        text not null
  avatar_url   text
  created_at   timestamptz not null default now()
  updated_at   timestamptz not null default now()

memberships                                       -- vínculo usuário ↔ organização ↔ papel
  id           uuid PK default gen_random_uuid()
  org_id       uuid not null references organizations(id) on delete cascade
  user_id      uuid not null references profiles(id) on delete cascade
  role         app_role not null                 -- enum, ver abaixo
  created_at   timestamptz not null default now()
  unique (org_id, user_id)

audit_log                                         -- trilha de auditoria (seção 48 do escopo)
  id           bigint generated always as identity PK
  org_id       uuid references organizations(id)
  actor_id     uuid references profiles(id)
  action       text not null                      -- ex.: "membership.role_changed"
  entity       text not null                       -- ex.: "membership"
  entity_id    text
  before       jsonb
  after        jsonb
  created_at   timestamptz not null default now()
```

```sql
create type app_role as enum (
  'super_admin', 'ceo', 'socio', 'desenvolvedor',
  'designer', 'social_media', 'financeiro', 'comercial'
);
```

Todas as tabelas de negócio futuras (clientes, projetos, domínios, chamados, propostas, contratos, financeiro, conteúdo...) carregam `org_id` e, quando fizer sentido, `created_by`/`updated_by`, seguindo o mesmo padrão de auditoria e RLS por organização definido aqui.

## 4. Índices e integridade

- FK com `on delete cascade` só onde a entidade filha não faz sentido sem a pai (ex.: membership sem org); nos demais casos, `on delete restrict` para evitar perda de histórico (ex.: nunca apagar cliente com projetos ligados sem decisão explícita).
- Índice em toda FK usada em filtro (`org_id`, `user_id` em `memberships`).
- `created_at`/`updated_at` em toda tabela de negócio (obrigatório desde a Fase 0).
- Soft delete (`deleted_at timestamptz`) será adotado nas tabelas de negócio a partir da Fase 1 (clientes, projetos, contratos) — não se aplica às tabelas de auth/org da Fase 0.

## 5. Migrations aplicadas na Fase 0

| Ordem | Migration | Conteúdo |
|---|---|---|
| 0001 | `init_enums_and_org` | `app_role`, `organizations` |
| 0002 | `profiles_and_membership` | `profiles`, `memberships`, trigger de sincronização `auth.users` → `profiles` |
| 0003 | `audit_log` | tabela `audit_log` |
| 0004 | `rls_policies` | ativação de RLS + políticas (ver `docs/seguranca.md`) |

## 6. Seed

`src/server/db/seed.ts` roda com a service role key (nunca com a chave pública) e é idempotente:

1. Garante a organização "Atlaz Company" (upsert por `slug`).
2. Se `SUPER_ADMIN_EMAIL` (env) corresponder a um usuário já existente em `auth.users`, garante uma `membership` com `role = 'super_admin'` para ele nessa organização — sem criar usuário novo (ver `docs/seguranca.md`, bootstrap do super admin).
3. Não insere nenhum dado de negócio fake (clientes, projetos etc.) — isso violaria a regra de não criar UI/dados fictícios sem indicar.
