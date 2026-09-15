# Segurança — ATLΛZ OS

## 1. Princípio

Nenhuma permissão é confiável só porque a UI escondeu um botão. Operações pela conexão Drizzle com **BYPASSRLS** exigem autorização na aplicação e filtros explícitos de organização. RLS protege o acesso como usuário final; não bloqueia consultas executadas pela conexão privilegiada. Constraints e transações continuam protegendo integridade nesse caminho.

## 2. RBAC — papéis e permissões

**Herdado do projeto anterior e adotado como está** (ver docs/banco.md §1) — mais granular do que uma versão simplificada com enum fixo teria sido:

- `roles`: 8 papéis por organização (`super_admin`, `ceo`, `socio`, `dev`, `designer`, `social_media`, `financeiro`, `comercial`), marcados `is_system = true`.
- `permissions`: catálogo global de 41 permissões `"resource:action"` (ex.: `client:read`, `finance:write`, `vault:reveal`) cobrindo todos os módulos do roadmap.
- `role_permissions`: concede permissões a papéis (85 vínculos já seedados).

`src/config/permissions.ts` espelha as 41 chaves só para autocomplete/erro de compilação — a fonte da verdade é o banco:

```ts
export const PERMISSION_KEYS = ["audit:read", "client:read", "finance:write", /* ... */] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function can(grantedPermissions: readonly string[] | undefined, permission: PermissionKey): boolean {
  if (!grantedPermissions) return false;
  return grantedPermissions.includes(permission);
}
```

`grantedPermissions` vem de `getCurrentSession()` (`src/lib/auth/session.ts`). A sessão rejeita perfil inativo, seleciona membership ativa por `created_at, id`, valida a org do papel e inclui scope. `super_admin` recebe o catálogo, alinhado à exceção existente em `atlaz.has_permission()`; os demais papéis recebem apenas `role_permissions`. Nenhum grant extra foi dado ao CEO.

`can()` verifica as permissões efetivas. Em Clientes, `authorizeClientSession()` também exige scope `org` e contexto válido: leitura requer `client:read`, escrita requer leitura + `client:write`. `assigned` é negado explicitamente. O futuro service deve chamar esse helper com a sessão obtida no servidor antes de acessar repositories. A UI não é a fonte de autoridade.

## 3. RLS (Row Level Security)

**Já aplicado** em `orgs`, `users`, `roles`, `permissions`, `role_permissions`, `memberships`, `activity_events` e `audit.log` (herdado — ver docs/banco.md §1), usando funções auxiliares no schema `atlaz`:

```sql
atlaz.current_user_id()             -- id em public.users do usuário autenticado
atlaz.current_org_id()              -- org_id da membership ativa
atlaz.is_member()                   -- tem membership ativa?
atlaz.has_permission(p_permission)  -- o papel do usuário tem essa permission_key?
```

Exemplo de política real (`memberships`):

```sql
create policy "memberships_write" on memberships
  for all using (org_id = atlaz.current_org_id() and atlaz.has_permission('team:manage'))
  with check (org_id = atlaz.current_org_id() and atlaz.has_permission('team:manage'));
```

`clients` e `client_contacts` têm RLS e SELECT para authenticated com organização, `client:read`, usuário/membership ativos, scope `org` e papel coerente. Não há grants/policies de escrita direta nessas tabelas para authenticated/anon: as mutations deverão passar pelo servidor e pela transação de negócio.

A migration 0003 removeu INSERT policies e grants de escrita pública em `audit.log`/`activity_events`. Timeline de `entity_type='client'` exige cliente existente e acessível via RLS; contatos usarão eventos no cliente pai. Outros tipos mantêm a leitura organizacional herdada. Auditoria detalhada exige `audit:read`.

Também foi restringido UPDATE direto em `users` a nome/avatar, preservando a policy de perfil próprio. Antes, o usuário podia reativar o próprio `is_active`; esse caminho foi bloqueado. A conexão administrativa continua responsável pelas alterações de identidade/atividade.

**Nuance importante**: `atlaz.current_org_id()`/`current_user_id()` dependem de `auth.uid()` e do contexto autenticado, como nas chamadas REST do Supabase com JWT. As queries do Next.js via Drizzle usam `DATABASE_URL` com **BYPASSRLS**. Nesse caminho, a service layer verifica sessão, scope e permissões; todo repository filtra `org_id`. RLS não compensa ausência dessas verificações na conexão privilegiada.

## 4. Autenticação e bootstrap do super admin

- Login via **Supabase Auth** (email/senha nesta fase; SSO fica para fase de integrações). Sessão via cookies do `@supabase/ssr`, validada por `getUser()` em `src/proxy.ts` e no layout autenticado.
- **Não existe endpoint de "virar admin".** O primeiro super admin é criado por `src/server/db/seed.ts`, rodado manualmente por um desenvolvedor com a `DATABASE_URL` local (conexão direta ao Postgres, fora do RLS — por isso o script nunca roda a partir de código exposto à aplicação):
  1. O usuário precisa **já existir** em `auth.users` (criado pelo fluxo normal de signup/convite do Supabase Auth) — o script nunca cria usuário novo nem senha.
  2. O script é idempotente: rodar de novo não duplica membership nem rebaixa quem já é super admin.
  3. `SUPER_ADMIN_EMAIL` fica em `.env.local`, nunca commitado.
- Nenhuma rota HTTP pública promove papel. Equipe ainda é leitura; futuras alterações de papel deverão exigir `team:manage`. A lacuna herdada de leitura de Equipe sem `team:read` foi registrada na auditoria e não foi ampliada para Clientes.

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

As tabelas `audit.log` e `activity_events` existiam sem produtores de negócio até o Checkpoint 1. O [Checkpoint 2](clientes-checkpoint-2.md) implementou os eventos de Clientes na mesma transação de cadastro/edição/contatos, usando ator da sessão e sem expor JSON de auditoria na timeline operacional. Falha de evento/auditoria reverte a operação inteira (testado).

O Checkpoint 1 validou constraints, grants, RLS e rollback em PostgreSQL em memória, com claims simuladas. O [Checkpoint 3](clientes-checkpoint-3.md#7-resultado-do-teste-real-sem-membership) repetiu essa validação contra o Postgres real (não a fixture em memória) — perfil próprio visível, nenhum dado operacional exposto — mas ainda não é um login real via Supabase Auth/GoTrue (a claim JWT é simulada). Organizações, clientes, memberships alheias e eventos operacionais não podem ser expostos.

## 8. Superfície de ataque — checklist aplicado

- CSRF: Server Actions do Next.js já incluem proteção nativa (token por origem); Route Handlers que recebem webhook externo (GitHub, etc., fase de integrações) validam assinatura do provedor.
- Escalação de privilégio: `can()` sempre recebe o papel lido do banco na própria request (via `memberships`), nunca de um valor guardado em cookie/JWT customizado que o client possa forjar.
- Enumeração: mensagens de erro de login não revelam se o e-mail existe.
- Rate limit de login/reset de senha: delegado ao Supabase Auth (já embutido).
