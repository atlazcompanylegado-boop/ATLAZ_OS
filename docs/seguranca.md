# Segurança — ATLΛZ OS

## 1. Princípio

Nenhuma permissão é confiável só porque a UI escondeu um botão. Toda ação sensível é validada em pelo menos duas camadas independentes: **aplicação** (service layer, antes de tocar o banco) e **banco** (RLS). As duas precisam concordar; se uma permitir e a outra negar, a operação falha.

## 2. RBAC — papéis e permissões

Papéis (enum `app_role`, ver `docs/banco.md`): `super_admin`, `ceo`, `socio`, `desenvolvedor`, `designer`, `social_media`, `financeiro`, `comercial`.

A matriz papel → permissão vive em código, um único lugar: `src/config/permissions.ts`. Formato:

```ts
export const PERMISSIONS = {
  "org.manage_members": ["super_admin", "ceo"],
  "financeiro.view": ["super_admin", "ceo", "socio", "financeiro"],
  "financeiro.edit": ["super_admin", "financeiro"],
  "cofre.view_credential": ["super_admin", "ceo", "desenvolvedor"],
  // cada módulo novo declara suas permissões aqui, não espalhado pelo código
} as const;
```

`can(membership, permission)` é a única função que decide autorização na aplicação; usada em Server Actions e em Route Handlers antes de qualquer leitura/escrita. Componentes de UI usam a mesma função só para *esconder* botão — nunca é a fonte de verdade.

## 3. RLS (Row Level Security)

RLS ativo em toda tabela com dado de negócio desde a Fase 0. Padrão de policy (organização é sempre o limite de isolamento):

```sql
create or replace function auth_org_ids()
returns setof uuid
language sql stable security definer
as $$
  select org_id from memberships where user_id = auth.uid()
$$;

alter table organizations enable row level security;
alter table memberships enable row level security;
alter table audit_log enable row level security;

create policy "member reads own org" on organizations
  for select using (id in (select auth_org_ids()));

create policy "member reads memberships of own org" on memberships
  for select using (org_id in (select auth_org_ids()));

create policy "only super_admin/ceo manage memberships" on memberships
  for all using (
    org_id in (select auth_org_ids())
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid() and m.org_id = memberships.org_id
        and m.role in ('super_admin','ceo')
    )
  );
```

Toda tabela de negócio futura (clientes, projetos, financeiro...) repete o padrão: policy de `select` por `org_id in auth_org_ids()`, policy de escrita restrita por papel via `exists (...)` na tabela `memberships`. `audit_log` é somente leitura para `super_admin`/`ceo`; escrita só pelo service role (nunca client-side).

## 4. Autenticação e bootstrap do super admin

- Login via **Supabase Auth** (email/senha nesta fase; SSO fica para fase de integrações). Sessão em cookie HTTP-only via `@supabase/ssr`, validada em `middleware.ts` para todo o grupo de rota `(app)`.
- **Não existe endpoint de "virar admin".** O primeiro super admin é criado por `src/server/db/seed.ts`, rodado manualmente por um desenvolvedor com a `DATABASE_URL` local (conexão direta ao Postgres, fora do RLS — por isso o script nunca roda a partir de código exposto à aplicação):
  1. O usuário precisa **já existir** em `auth.users` (criado pelo fluxo normal de signup/convite do Supabase Auth) — o script nunca cria usuário novo nem senha.
  2. O script é idempotente: rodar de novo não duplica membership nem rebaixa quem já é super admin.
  3. `SUPER_ADMIN_EMAIL` fica em `.env.local`, nunca commitado.
- Nenhuma rota HTTP pública promove papel. Mudança de papel depois do bootstrap passa pela tela de Equipe, protegida por `can(membership, "org.manage_members")` + RLS.

## 5. Cofre de credenciais (preparação)

A Fase 0 não implementa o módulo completo (isso é Fase 1+), mas já reserva a arquitetura:

- Segredo de cliente/projeto nunca fica em texto puro em nenhuma tabela de negócio — só um `vault_secret_id` de referência.
- Criptografia em repouso via `pgsodium`/Supabase Vault (extensão nativa do Postgres do Supabase) — a chave de criptografia nunca passa pela aplicação Next.js.
- Toda leitura de segredo grava `audit_log` (`action = "vault.secret_viewed"`) com `actor_id` e `entity_id`, mesmo que a leitura tenha sucesso.
- Na ficha do cliente/projeto, o campo aparece como "Credencial disponível no Cofre" com uma ação explícita de revelar — nunca o valor pré-carregado no HTML/JSON da página.

## 6. Segredos e ambiente

- `.env.local` (não versionado) guarda `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (públicas, seguras para o browser), `SUPABASE_SERVICE_ROLE_KEY` (só server-side, nunca em componente client nem em código que rode no browser) e `DATABASE_URL` (conexão direta do Drizzle, só server-side).
- `.env.example` traz as chaves sem valor, documentando o que é preciso configurar.
- `SUPABASE_SERVICE_ROLE_KEY` nunca é importada por um arquivo que possa ser incluído no bundle do client — o adapter `src/lib/supabase/admin.ts` tem `import "server-only"` no topo para o build falhar se isso acontecer.

## 7. Auditoria

Eventos mínimos gravados em `audit_log` desde a Fase 0: mudança de papel/membership, acesso a credencial do Cofre (quando existir), exclusão de registro. Cada módulo novo soma seus próprios eventos (exclusão de proposta, alteração de contrato, fechamento de chamado etc.) conforme entra — sempre a partir da service layer, nunca da UI.

## 8. Superfície de ataque — checklist aplicado

- CSRF: Server Actions do Next.js já incluem proteção nativa (token por origem); Route Handlers que recebem webhook externo (GitHub, etc., fase de integrações) validam assinatura do provedor.
- Escalação de privilégio: `can()` sempre recebe o papel lido do banco na própria request (via `memberships`), nunca de um valor guardado em cookie/JWT customizado que o client possa forjar.
- Enumeração: mensagens de erro de login não revelam se o e-mail existe.
- Rate limit de login/reset de senha: delegado ao Supabase Auth (já embutido).
