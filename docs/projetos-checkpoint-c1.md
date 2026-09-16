# Projetos — Checkpoint C1: aplicação real da migration 0004

Data: 15/09/2026. Escopo autorizado: aplicar `0004_projects.sql` ao Supabase real,
validar estrutura/RLS/concorrência/eventos/auditoria em produção com segurança.
**Sem UI, sem navegação, sem integração com a Ficha Mestre.**

## 1–2. Preflight antes da aplicação

Releitura confirmada dos Checkpoints A e B, da migration `0004_projects.sql`, do
schema Drizzle (`projects.ts`), `project-access.ts`, `project-service.ts`,
`project-repository.ts`, `project-events.ts` e das suítes de teste — nenhuma
decisão foi reaberta. `git status`/`git diff --stat` confirmados idênticos ao
fim do Checkpoint B; HEAD seguia em `5d68be6`.

Preflight somente leitura reexecutado com `scripts/projects-preflight.mjs`
(mesma transação `REPEATABLE READ READ ONLY`, sem DDL/DML):

- Ledger: 4 entradas, hashes de 0000–0003 **idênticos** aos registrados no
  Checkpoint B (nenhuma migration concorrente aplicada nesse intervalo).
- `public.projects`: ainda **ausente**.
- Eventos `entity_type='project'`: **0**; órfãos: **0**.
- Grants de `project:*` por papel: inalterados em relação ao Checkpoint B.
- Comparação estrutural completa contra `0003_snapshot.json`: **0 divergências**
  em 10 tabelas (colunas, nullability, defaults, FKs/checks/uniques, índices, RLS).
- Verificação direta de objetos parciais com os nomes que a 0004 criaria
  (função `atlaz.validate_project_write`, triggers `projects_validate_write`/
  `projects_updated_at`, policy `projects_select`, índices `projects_*`, tabela
  `projects`): **nenhum objeto parcial encontrado**.

Preflight limpo em todos os pontos exigidos. Prosseguiu-se para a aplicação.

## 3. Aplicação da 0004

Executado `npm run db:migrate` (migrator padrão do projeto,
`drizzle-orm/postgres-js/migrator`, sem DDL manual). Saída:

```
Aplicando migrations em src/server/db/migrations ...
NOTICE: schema "drizzle" already exists, skipping
NOTICE: relation "__drizzle_migrations" already exists, skipping
Migrations aplicadas com sucesso.
```

As duas notices são do próprio bootstrap de controle do Drizzle (schema/tabela
de ledger já existentes de migrations anteriores) — nada relacionado ao
conteúdo de `0004_projects.sql`. Nenhuma migration antiga foi reexecutada
(o migrator pula automaticamente o que já está no ledger).

## 4. Estado final do ledger

5 entradas, ordenadas por `created_at`:

| # | hash | created_at |
|---|---|---|
| 1 | `7dc2a65a...546c6b` | 1789148132876 |
| 2 | `be4a08e2...79ab` | 1789148163227 |
| 3 | `bd848ae3...246224` | 1789426759886 |
| 4 | `409a0b44...30ea7e7` | 1789426759887 |
| 5 | `af04c98a...7888da` | 1789488000000 |

Os quatro primeiros hashes são **byte-a-byte idênticos** aos do preflight
(0000–0003 intocadas). O quinto hash (`af04c98abd83d7db416240fdb7f7c805df3092eb0bce9ce0d198505cfa7888da`)
**bate exatamente** com o SHA-256 do arquivo local `0004_projects.sql`, e o
`created_at` corresponde ao `when` da entrada `0004_projects` no journal.

## 5. Estrutura confirmada de `projects`

Comparação automática (mesma lógica de `projects-preflight-compare.mjs`, agora
contra `0004_snapshot.json`) sobre as 11 tabelas geridas: **0 divergências** em
nomes/tipos/nullability/presença de default, nomes de FK/check/unique/índice e
RLS. Inspeção direta das definições completas (não só nomes) confirmou:

- 16 colunas conforme especificado (`id`, `org_id`, `client_id`, `name`,
  `description`, `status` default `planning`, `priority` default `normal`,
  `owner_user_id`, `start_date`, `due_date`, `completed_at`, `progress`,
  `created_by`, `created_at`/`updated_at` com default `now()`, `version`
  default `1`).

## 6. Constraints/FKs

14 constraints, todas com a definição exata do SQL revisado: `projects_pkey`,
`projects_org_id_id_key` (UNIQUE org_id+id), `projects_org_fkey` (RESTRICT →
orgs), `projects_client_fkey` (RESTRICT → clients(org_id,id)),
`projects_owner_fkey`/`projects_creator_fkey` (RESTRICT → memberships(org_id,
user_id)), `projects_name_check`, `projects_description_check`,
`projects_status_check` (6 valores), `projects_priority_check` (4 valores),
`projects_progress_check` (0–100), `projects_dates_check` (due≥start),
`projects_completed_check` (completed ⇔ progress=100 ∧ completed_at not null;
qualquer outro status ⇒ completed_at null), `projects_version_check` (≥1).

## 7. Índices

9 índices confirmados byte-a-byte: `projects_pkey`, `projects_org_id_id_key`,
`projects_org_client_created_idx`, `projects_org_created_idx`,
`projects_org_updated_idx`, `projects_org_name_idx`, `projects_org_status_idx`,
`projects_org_owner_idx` (parcial, owner not null), `projects_org_due_idx`
(parcial, due_date not null).

## 8. Triggers

`projects_validate_write` (BEFORE INSERT OR UPDATE →
`atlaz.validate_project_write()`) e `projects_updated_at` (BEFORE UPDATE →
`atlaz.set_updated_at()`), ambos presentes com a definição exata da migration.
Função sem `EXECUTE` público (confirmado via testes de trigger abaixo).

## 9. RLS/policies

RLS habilitada (`relrowsecurity=true`, `relforcerowsecurity=false` — força
desligada é o padrão do projeto para as demais tabelas também, sem alterar
esse comportamento). Policy `projects_select` (SELECT, `authenticated`) com a
condição exata: org da sessão + `project:read` + `client:read` + membership
ativa/scope `org` + Cliente pai existente. Nenhuma outra policy foi criada.

`activity_select` (activity_events) foi **substituída** (DROP + CREATE única,
não uma policy adicional combinada por OR), com os três ramos exatos:
`client` (predicado idêntico ao anterior), `project` (novo, via EXISTS em
`projects` — que por sua vez reaplica a RLS de `projects`), e demais tipos
(regra organizacional herdada, sem mudança). Confirmado por teste funcional
abaixo, não só pelo texto da policy.

## 10. Grants

`projects`: `authenticated` → **somente SELECT**; `service_role` → SELECT,
INSERT, UPDATE (**sem DELETE**); `anon` → nenhum grant. `postgres` (dono da
tabela) mantém privilégios plenos, como em todas as demais tabelas do schema —
não é um grant concedido pela 0004, é a posse padrão da tabela. Nenhum grant
de papel RBAC foi criado/alterado/removido.

## 11–13. Testes RLS, cross-org e concorrência (banco real)

Executados com fixtures efêmeras (duas orgs, papéis e usuários fictícios,
nunca reais) **dentro de uma única transação sempre revertida** (rollback
forçado ao final, com savepoints isolando cada assertiva que esperava erro,
já que o Postgres aborta a transação inteira após qualquer erro não tratado
via savepoint). Conexão usada é a mesma role privilegiada (`postgres`,
`BYPASSRLS=true`) do Drizzle da aplicação; os cenários de RLS trocam para a
role `authenticated` via `SET LOCAL ROLE` + `request.jwt.claim.sub`, replicando
exatamente como o PostgREST/Supabase Auth autentica uma sessão real.

**28 de 28 asserções aprovadas**, cobrindo exatamente a matriz pedida:

| Cenário | Resultado |
|---|---|
| Sem `project:read` nem `client:read` | 0 linhas visíveis |
| Só `client:read` (sem `project:read`) | 0 linhas |
| Só `project:read` (sem `client:read`) | 0 linhas |
| `project:read` + `client:read` | vê o projeto da própria org |
| `scope='assigned'` com todas as permissões | 0 linhas (negado) |
| Membership inativa | 0 linhas |
| Usuário de outra org, busca por ID exato | 0 linhas (cross-org bloqueado) |
| Usuário de outra org, listagem geral | 0 linhas |
| INSERT direto como `authenticated` | `42501 permission denied` |
| UPDATE direto como `authenticated` | `42501 permission denied` |
| Evento real de projeto, com `project:read`+`client:read` | visível |
| Evento órfão de projeto (sem projeto real) | invisível |
| Evento de projeto sem `project:read` | invisível |
| `audit.log` de projeto sem `audit:read` | invisível |
| `audit.log` de projeto com `audit:read` | visível |
| Evento de Cliente (regressão) | continua visível para `client:read` |
| UPDATE com version correta | aplica, avança exatamente 1 |
| UPDATE com version antiga (stale) | 0 linhas afetadas (sem sobrescrita) |
| UPDATE pulando version (+2) | rejeitado pelo trigger (`23514`) |
| UPDATE sem avançar version | rejeitado pelo trigger (`23514`) |
| Owner com membership inativa | rejeitado (`23514 invalid project owner`) |
| Owner com membership ativa | aceito na atribuição |
| Owner desativado depois; edita outro campo | **não falha** (sem revalidação) |
| UPDATE mudando `client_id`/`org_id`/`created_by` | rejeitado (`23514`, imutabilidade) |
| INSERT `completed` sem `progress=100`/`completed_at` | rejeitado (`23514`) |
| INSERT com `client_id` de outra org | rejeitado (`23503`, FK) |

Nenhuma divergência. RLS, grants, triggers e constraints se comportam
exatamente como especificado nos Checkpoints A/B e como já cobertos pelos
testes de fundação em PGlite — agora confirmados também no banco real.

## 14. Fixtures temporárias usadas

2 orgs fictícias (`qa-fixture-a-*`, `qa-fixture-b-*`), 7 papéis fictícios
(`qa_none`, `qa_client_only`, `qa_project_only`, `qa_full`, `qa_editor`,
`qa_audit`, `qa_b_full`), 10 usuários fictícios (e-mails `*@qa.invalid`),
memberships, 2 clientes fictícios e 1 projeto fictício, 3 `activity_events`
(1 real de projeto, 1 órfão de projeto, 1 de cliente) e 1 `audit.log`. Nenhum
dado de cliente/usuário/organização real foi lido, alterado ou exposto.

## 15. Confirmação de rollback/limpeza

A transação terminou com um `throw` deliberado (sentinela interno) capturado
fora do `sql.begin(...)`, forçando ROLLBACK independentemente do resultado dos
testes. Verificação pós-execução: `count(*)` por `slug like 'qa-fixture-%'` em
`orgs`, por `email like '%@qa.invalid'` em `users` e por `key like 'qa_%'` em
`roles` — **todos retornaram 0**. O script usado (arquivo temporário fora do
repositório, na pasta scratchpad da sessão) foi apagado do diretório do
projeto ao final; nada foi commitado.

## 16. Divergências encontradas

**Nenhuma.** Preflight, aplicação, estrutura, constraints, índices, triggers,
RLS, policies, grants, concorrência, eventos e auditoria bateram exatamente
com o SQL revisado, o schema Drizzle e a documentação dos Checkpoints A/B.

## 17–21. Validação de código (pós-migration)

| Comando | Resultado |
|---|---|
| `npm run lint` | limpo |
| `npm run typecheck` | limpo |
| `npm run test` | **285 aprovados, 1 pulado** (13 arquivos) — idêntico ao Checkpoint B |
| `npm run test:foundation` | **207 aprovados**, 0 falhas — idêntico ao Checkpoint B |
| `npm run build` | **concluído com sucesso** após `rm -rf .next` prévio; mesmas rotas de antes, `/projetos` continua como placeholder dinâmico; nenhuma rota nova criada |

Nenhum arquivo de código foi alterado neste checkpoint — os números são
idênticos aos do Checkpoint B porque a aplicação da migration ao Supabase real
não muda nada no repositório local.

## 22–23. Git

`git diff --stat`: idêntico ao final do Checkpoint B — 9 arquivos rastreados
modificados (README, banco, roadmap, segurança, `package.json`, journal,
schema index, `service-error.ts`, teste de reconciliação), 40 inserções/3
remoções. `git status`: mesmos arquivos novos untracked de Projetos (schema,
`0004_projects.sql`, snapshot, `project-access.ts`, validação/normalização,
`activity.ts`, repositories, services, scripts, relatórios A/B/C1, testes).
**Nada foi staged, nada foi commitado.** HEAD continua em `5d68be6`.

## Conclusão

`0004_projects.sql` está **aplicada ao Supabase real**, validada estrutural e
funcionalmente (incluindo RLS, cross-org, concorrência, eventos e auditoria
com fixtures efêmeras sempre revertidas), sem qualquer divergência frente ao
que foi aprovado nos Checkpoints A e B. Nenhuma decisão anterior foi reaberta;
nenhuma linha de `0004_projects.sql` foi alterada.

Não foi criada UI, rota, navegação ou integração com a Ficha Mestre. Sem
commit, push, PR ou deploy. Parando aqui, aguardando aprovação explícita para
iniciar a UI de Projetos (listagem, cadastro, ficha, edição, timeline,
integração com Cliente, navegação).
