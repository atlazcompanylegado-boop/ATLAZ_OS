# Banco de Dados — ATLΛZ OS

## 1. Baseline herdado do projeto anterior

O projeto Supabase usado pelo ATLΛZ OS **não nasceu vazio**: já continha, quando adotado nesta sessão, um schema completo (organização, usuários, papéis, permissões granulares, memberships, timeline e auditoria), aplicado por uma migration do projeto anterior (rastreada em `public._atlaz_migrations`, fora do Drizzle). Antes de aplicar qualquer coisa nova, o schema existente foi inspecionado a fundo e avaliado como reutilizável — não é "estado corrompido": é um RBAC granular coerente, já com RLS e seed de papéis/permissões, e mais alinhado à exigência de "permissões granulares" do escopo do que uma versão simplificada com enum fixo teria sido.

**Decisão**: adotar esse schema como fundação em vez de recriar um mais simples do zero. `src/server/db/schema/*.ts` (Drizzle) foi escrito para espelhar exatamente essas tabelas já existentes. A migration `0000_baseline.sql` documenta esse estado herdado sem executar nada (as tabelas já existem); só a partir da `0001` este projeto passa a gerar mudanças reais de schema.

Já existia e foi mantido como está:
- organização "Atlaz Company" (`orgs`, slug `atlaz`)
- 8 papéis do escopo (`roles`, `is_system = true`)
- 41 permissões granulares cobrindo todos os módulos do roadmap (`permissions`)
- 85 vínculos papel↔permissão já concedidos (`role_permissions`)
- RLS completo nas 8 tabelas + funções auxiliares em `atlaz.*` (ver docs/seguranca.md §3)
- extensão `supabase_vault` já instalada (usada pelo Cofre, Fase 1+)

O único gap encontrado: nenhuma trigger sincronizando `auth.users` → `public.users` no signup. Foi essa a única migration real escrita (`0001_auth_sync_trigger.sql`).

## 2. Plataforma

PostgreSQL gerenciado via **Supabase**. Acesso de aplicação por **Drizzle ORM**; acesso administrativo (migrations, RLS, funções) por SQL puro versionado.

## 3. Fluxo de schema

1. Alterar `src/server/db/schema/*.ts`.
2. `npm run db:generate` → drizzle-kit gera SQL em `src/server/db/migrations/`.
3. Revisar o SQL gerado manualmente (RLS e triggers não são geradas pelo Drizzle — entram como migration SQL manual complementar na mesma pasta, como a `0001`).
4. `npm run db:migrate` aplica no Supabase configurado em `.env.local`.
5. Nunca alterar tabela direto pelo painel do Supabase sem depois refletir a mudança numa migration.

## 4. Modelo de dados

```
orgs                                              -- organização (hoje só "Atlaz Company")
  id            uuid PK
  slug          text unique                       -- "atlaz"
  name          text
  legal_name    text
  settings      jsonb
  created_at, updated_at

users                                              -- perfil interno, desacoplado de auth.users
  id            uuid PK
  auth_user_id  uuid unique references auth.users(id) on delete cascade
  email         text
  full_name     text
  avatar_url    text
  is_active     boolean
  created_at, updated_at

roles                                              -- papel POR organização (não enum)
  id            uuid PK
  org_id        uuid references orgs(id)
  key           text                               -- "super_admin", "ceo", "dev", ...
  name          text                               -- "Super Admin", "CEO", "Desenvolvedor", ...
  description   text
  is_system     boolean                            -- true para os 8 papéis padrão
  unique (org_id, key)
  created_at, updated_at

permissions                                        -- catálogo global de permissões granulares
  key           text PK                            -- "resource:action", ex. "client:read"
  resource      text
  action        text
  description   text

role_permissions                                   -- concede uma permissão a um papel
  role_id         uuid references roles(id)
  permission_key  text references permissions(key)
  primary key (role_id, permission_key)

memberships                                        -- vínculo usuário ↔ organização ↔ papel
  id            uuid PK
  org_id        uuid references orgs(id)
  user_id       uuid references users(id)
  role_id       uuid references roles(id)
  job_title     text
  scope         text default 'org'
  is_active     boolean
  unique (org_id, user_id)
  created_at, updated_at

activity_events                                    -- timeline (escopo item 29) — ainda sem produtor
  id, org_id, entity_type, entity_id, kind, summary, payload jsonb,
  actor_user_id, source, occurred_at

audit.log                                          -- auditoria (escopo item 48) — schema próprio
  id, org_id, actor_user_id, actor_label, action, entity_type, entity_id,
  before jsonb, after jsonb, context jsonb, at
```

Toda tabela de negócio futura (clientes, projetos, domínios, chamados, propostas, contratos, financeiro, conteúdo...) carrega `org_id` e participa do mesmo padrão de RLS/permissão granular definido aqui.

## 5. Funções auxiliares (schema `atlaz`, já existentes)

```sql
atlaz.current_user_id()             -- id em public.users do usuário autenticado
atlaz.current_org_id()              -- org_id da membership ativa do usuário autenticado
atlaz.is_member()                   -- boolean: usuário tem membership ativa?
atlaz.has_permission(p_permission)  -- boolean: papel do usuário tem essa permission_key?
atlaz.set_updated_at()              -- trigger genérica para updated_at
```

`atlaz.has_permission()` é a mesma função usada nas policies de RLS (ver docs/seguranca.md §3) — a aplicação usa o equivalente em TypeScript (`can()`, em `config/permissions.ts`) sobre as permissões já carregadas na sessão, para não fazer uma query extra por checagem.

## 6. Migrations

| Ordem | Migration | Conteúdo |
|---|---|---|
| 0000 | `baseline` | Documenta o schema herdado (não executa nada — ver §1) |
| 0001 | `auth_sync_trigger` | Trigger `auth.users` → `public.users` (único gap real encontrado) |

## 7. Seed

`src/server/db/seed.ts` roda com `DATABASE_URL` (conexão direta, fora do RLS) e é idempotente:

1. Confirma que a organização "Atlaz Company" (slug `atlaz`) existe — **não a cria** (já existe).
2. Busca o papel `super_admin` dessa organização.
3. Se `SUPER_ADMIN_EMAIL` corresponder a um `public.users` já existente (populado pela trigger 0001 quando o usuário faz signup no Supabase Auth), garante uma `membership` com esse papel — sem criar usuário novo.
4. Não insere nenhum dado de negócio fake (clientes, projetos etc.).
