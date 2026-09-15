# Banco de Dados — ATLΛZ OS

## 1. Baseline herdado do projeto anterior

O projeto Supabase usado pelo ATLΛZ OS **não nasceu vazio**: já continha, quando adotado nesta sessão, um schema completo (organização, usuários, papéis, permissões granulares, memberships, timeline e auditoria), aplicado por uma migration do projeto anterior (rastreada em `public._atlaz_migrations`, fora do Drizzle). Antes de aplicar qualquer coisa nova, o schema existente foi inspecionado a fundo e avaliado como reutilizável — não é "estado corrompido": é um RBAC granular coerente, já com RLS e seed de papéis/permissões, e mais alinhado à exigência de "permissões granulares" do escopo do que uma versão simplificada com enum fixo teria sido.

**Decisão**: adotar esse schema como fundação. A representação em `src/server/db/schema/*.ts` foi reconciliada com o catálogo real no Checkpoint 1 de Clientes — ver [classificação das diferenças](clientes-reconciliacao.md). A migration `0000_baseline.sql` documenta esse estado herdado sem executar nada; não recria um banco vazio. Só a partir da `0001` este projeto aplica mudanças reais de schema.

Inventário herdado (segurança de eventos ajustada em 0003):
- organização "Atlaz Company" (`orgs`, slug `atlaz`)
- 8 papéis do escopo (`roles`, `is_system = true`)
- 41 permissões granulares cobrindo todos os módulos do roadmap (`permissions`)
- 85 vínculos papel↔permissão já concedidos (`role_permissions`)
- RLS completo nas 8 tabelas + funções auxiliares em `atlaz.*` (ver docs/seguranca.md §3)
- extensão `supabase_vault` já instalada (usada pelo Cofre, Fase 1+)

A migration `0001_auth_sync_trigger.sql` adicionou sincronização de `auth.users` → `public.users`. No Checkpoint 1, 0002/0003 adicionaram Clientes/Contatos e corrigiram permissões de eventos/perfil. As quatro entradas estão aplicadas; nenhum dado de teste foi inserido no Supabase.

## 2. Plataforma

PostgreSQL gerenciado via **Supabase**. Acesso de aplicação por **Drizzle ORM**; acesso administrativo (migrations, RLS, funções) por SQL puro versionado.

## 3. Fluxo de schema

1. Conferir o catálogo real e classificar divergências antes de alterar `src/server/db/schema/*.ts`; não gerar DDL cegamente a partir de representação desatualizada.
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
  auth_user_id  uuid unique                       -- sem FK no banco herdado
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
  scope         text default 'org' check ('org', 'assigned')
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

`clients` e `client_contacts` já existem com `org_id`, FKs compostas, CHECKs, índices e RLS. O [schema final e as decisões de nullability](clientes-checkpoint-1.md#d--schema-final) estão no relatório. A interface e os produtores de eventos foram implementados no [Checkpoint 2](clientes-checkpoint-2.md).

`audit.log.org_id`, `actor_label` e `context` são obrigatórios; `context` tem default `{}`. A tabela preserva identificadores históricos sem FKs. `activity_events.source` tem default `app`, e a FK do ator usa ON DELETE SET NULL.

## 5. Funções auxiliares (schema `atlaz`, já existentes)

```sql
atlaz.current_user_id()             -- id em public.users do usuário autenticado
atlaz.current_org_id()              -- org_id da membership ativa do usuário autenticado
atlaz.is_member()                   -- boolean: usuário tem membership ativa?
atlaz.has_permission(p_permission)  -- boolean: papel do usuário tem essa permission_key?
atlaz.set_updated_at()              -- trigger genérica para updated_at
```

`atlaz.has_permission()` possui a exceção herdada de `super_admin`. A sessão traduz essa regra carregando o catálogo de permissões para esse papel; os demais usam apenas grants. `can()` verifica a lista efetiva. `current_org_id()` desempata memberships por `created_at, id`, como a sessão. As triggers `validate_client_write()`/`validate_client_contact_write()` protegem identidade, responsável e avanço de versão.

## 6. Migrations

| Ordem | Migration | Conteúdo |
|---|---|---|
| 0000 | `baseline` | Documenta o schema herdado (não executa nada — ver §1) |
| 0001 | `auth_sync_trigger` | Trigger `auth.users` → `public.users` |
| 0002 | `clients` | Clientes/Contatos, integridade, versão, índices, RLS e desempate de membership |
| 0003 | `client_event_security` | Escrita de eventos restrita ao servidor, timeline por acesso ao cliente e proteção contra auto-reativação do perfil |

Os SQL e snapshots 0000/0001 não foram alterados. Os snapshots 0002/0003 registram a representação reconciliada. Migrations e integração são exercitadas em PostgreSQL em memória via `npm run test:foundation`, com fixture sanitizada, sem conexão remota. O teste de RLS contra o Postgres real (sem login GoTrue completo) foi executado no [Checkpoint 3](clientes-checkpoint-3.md#7-resultado-do-teste-real-sem-membership).

## 7. Seed

`src/server/db/seed.ts` roda com `DATABASE_URL` (conexão direta, fora do RLS) e é idempotente:

1. Confirma que a organização "Atlaz Company" (slug `atlaz`) existe — **não a cria** (já existe).
2. Busca o papel `super_admin` dessa organização.
3. Se `SUPER_ADMIN_EMAIL` corresponder a um `public.users` já existente (populado pela trigger 0001 quando o usuário faz signup no Supabase Auth), garante uma `membership` com esse papel — sem criar usuário novo.
4. Não insere nenhum dado de negócio fake (clientes, projetos etc.).
