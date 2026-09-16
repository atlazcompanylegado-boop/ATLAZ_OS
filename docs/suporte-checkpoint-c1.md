# Suporte — Checkpoint C1: aplicação real da migration 0005

Data: 16/09/2026. Escopo autorizado: preflight final, revisão da migration,
aplicação segura ao Supabase real, reconciliação pós-migration, smoke tests de
banco, regressão de Clientes/Projetos e validação da policy de
`activity_events`. **Sem UI, sem navegação, sem commit/push/deploy.**

## 1. HEAD/branch inicial

Branch `main`, HEAD `b166c74` ("docs: marca Projetos como publicado —
Checkpoint D.2"). Nenhum commit de Suporte existe ainda.

## 2. `git status` inicial

Idêntico ao estado deixado pelo Checkpoint B: 9 arquivos rastreados
modificados (`package.json`, journal, schema index, `projects.ts`,
`client-timeline-repository.ts`, `client-service.ts`, `service-error.ts`,
`tests/helpers/projects.ts`, teste de reconciliação) e os mesmos arquivos
novos untracked da fundação de Suporte (schema, migration 0005, validação,
repositories, services, testes, relatórios A/B). Confirmado via `git status`/
`git diff --stat` no início desta etapa — nenhuma divergência.

## 3. Ambiente real confirmado

Preflight conectou usando `DATABASE_URL` de `.env.local` (o mesmo do
ambiente ATLΛZ OS já usado em todos os checkpoints anteriores de Clientes/
Projetos) — `current_database() = postgres`, `current_user = postgres`
(conexão privilegiada de migração, mesma usada por `npm run db:migrate`).

## 4. Estado do ledger antes

5 entradas (`0000_baseline` → `0004_projects`), hashes **idênticos**
byte-a-byte aos arquivos locais (`ledgerMatches0004: true`) — nenhuma
migration concorrente aplicada desde a publicação de Projetos (Checkpoint
D.2, 16/09/2026, commit `82539d2`).

## 5. Confirmação: 0005 não existia

`public.support_tickets`: **ausente**. `public.ticket_comments`: **ausente**.
Nenhuma sequência com nome contendo "ticket" (`pg_sequences`). Único `UNIQUE`
em `projects`: `projects_org_id_id_key` — o `projects_org_client_id_key`
proposto pela 0005 **ainda não existia**.

## 6. Drift encontrado

**Nenhum.** `activity_select` real batia exatamente com o texto esperado de
0004 (só os ramos `client`/`project`, sem `ticket`). 12 tabelas geridas, 107
colunas — nenhuma divergência estrutural encontrada frente ao esperado até
0004. **Nenhuma condição de parada do §4 do pedido foi acionada** — preflight
limpo, aplicação autorizada a prosseguir.

## 7. Grants pré-migration

Revalidados para `projects`/`clients`/`client_contacts`/`activity_events`/
`audit.log`: idênticos aos documentados nos Checkpoints de Projetos (sem
grant de escrita direta para `anon`/`authenticated`; `service_role` com
SELECT/INSERT/UPDATE em `projects`/`clients` e SELECT/INSERT/UPDATE/DELETE em
`client_contacts`/`activity_events`, herdado e inalterado).

## 8. Policies pré-migration

16 policies no total (schemas `public`+`audit`), nenhuma relacionada a
Suporte — confirmando ausência total de qualquer artefato parcial de uma
tentativa anterior de aplicar 0005.

## 9. Eventos legados `entity_type='ticket'`

**0.**

## 10. Órfãos

**0** (consequência direta do item 9 — sem eventos, não há órfãos a avaliar).

## 11. Contagens operacionais antes

`clients: 1`, `projects: 1`, `activity_events: 3`, `audit.log: 3` — **dados
reais de produção** (o usuário já opera a aplicação publicada). Registrados
para comparação exata pós-migration (ver §31).

## 12. Revisão final do SQL

Lida a migration completa (`0005_support.sql`) linha a linha antes de aplicar.
Confirmado que contém **somente** o necessário: `UNIQUE` aditiva em
`projects`; `support_tickets`+`ticket_comments` (constraints, índices,
triggers, RLS, grants); substituição controlada de `activity_select` com o
terceiro ramo. **Não contém**: mudança visual, CRUD de Cliente/Projeto,
permissão nova não aprovada, alteração de login, dado seed/fake, `DELETE`,
`TRUNCATE` ou `DROP` destrutivo — o único `DROP` é `DROP POLICY
activity_select` imediatamente seguido de `CREATE POLICY` com o mesmo nome
(substituição, mesmo padrão já usado em 0003/0004, não uma remoção de dado).

## 13. Estratégia de recuperação disponível

**Não verificável nesta sessão** — não há nenhum MCP/API do Supabase
conectado (só o de Render, conectado no checkpoint de publicação de
Projetos), e o status de backup/PITR é uma configuração de plataforma do
Supabase, não uma informação consultável via SQL comum a partir da própria
conexão do banco. **Não presumi nem inventei uma resposta.** Recomendo
verificar diretamente em Supabase Dashboard → Project Settings → Database →
Backups antes de qualquer aplicação futura de migration mais arriscada — para
esta 0005 especificamente, o risco é baixo (só cria objetos novos + uma
constraint aditiva + substitui uma policy, sem tocar em nenhuma linha de
dado), mas a verificação de PITR continua sendo uma boa prática independente
do risco de cada migration.

## 14. Resultado da aplicação 0005

`npm run db:migrate` — sucesso. Saída:

```
Aplicando migrations em src/server/db/migrations ...
NOTICE: schema "drizzle" already exists, skipping
NOTICE: relation "__drizzle_migrations" already exists, skipping
Migrations aplicadas com sucesso.
```

As duas notices são do bootstrap do próprio controle do Drizzle (schema/
tabela de ledger já existentes de migrations anteriores) — nada relacionado
ao conteúdo de `0005_support.sql`.

## 15. Timestamp da aplicação

`2026-09-16T02:04:xx` aproximadamente (confirmado pelo `created_at` da nova
entrada do ledger, capturado no preflight local antes da sessão: `when:
1789522283997`, e pelo `checkedAt` do postcheck imediatamente em seguida,
`2026-09-16T02:05:32Z`).

## 16. Estado do ledger depois

6 entradas. A 5ª (nova) tem hash **idêntico** ao SHA-256 do arquivo local
`0005_support.sql` e `created_at` correspondente ao `when` do journal —
confirmado por comparação byte-a-byte no postcheck (`ledgerMatches: true`).
Os 5 hashes anteriores permanecem **intocados**.

## 17. Tabelas criadas

`public.support_tickets` e `public.ticket_comments`, ambas com
`relrowsecurity = true` e `relforcerowsecurity = false` (mesmo padrão de
todas as demais tabelas do schema, não uma mudança de política de força).

## 18. `ticket_number` real

Confirmado no catálogo: `bigint`, `is_nullable = NO`, `is_identity = YES`,
`identity_generation = ALWAYS`, com `UNIQUE(ticket_number)`. Testado com
fixtures efêmeras (sempre revertidas): dois chamados sequenciais receberam
números crescentes gerados pelo banco (não `MAX()+1`); uma tentativa de
`INSERT` especificando `ticket_number` manualmente foi rejeitada pelo próprio
Postgres com `428C9` ("cannot insert a non-DEFAULT value into column"),
**antes mesmo do trigger de imutabilidade rodar** — confirmando a garantia
estrutural mais forte possível para este campo. Nenhum chamado real foi
inserido para este teste — tudo dentro de uma transação com `ROLLBACK`
forçado (ver §29).

## 19. FK tripla real

`support_tickets_project_fkey`: `FOREIGN KEY (org_id, client_id, project_id)
REFERENCES projects(org_id, client_id, id) ON DELETE RESTRICT` — confirmado
byte-a-byte no catálogo. Testado com fixtures efêmeras: projeto de outro
cliente da mesma org rejeitado (`23503`); projeto de outra org rejeitado
(`23503`); projeto do mesmo cliente aceito; chamado sem projeto (`NULL`)
aceito livremente (`MATCH SIMPLE` não avalia a constraint).

## 20. Constraint aditiva em Projects

`projects_org_client_id_key`: `UNIQUE (org_id, client_id, id)` — confirmada
presente, **junto** com a `projects_org_id_id_key` original (nenhuma
substituída). Como `id` já é PK (globalmente único por si só), esta nova
`UNIQUE` é **estruturalmente redundante para a garantia de unicidade em si**
— sua única função é servir de **chave referenciada** para a FK tripla acima
(o Postgres exige que o conjunto de colunas referenciado por uma FK
composta tenha uma `UNIQUE`/`PK` exatamente correspondente). Documentado
explicitamente aqui conforme pedido (§25) — não é uma constraint "a mais" por
engano, é a peça estrutural que torna a FK tripla possível.

## 21. Indexes

11 em `support_tickets` (PK + 2 `UNIQUE` explícitas + 8 índices regulares/
parciais) e 2 em `ticket_comments` (PK + 1) — todos confirmados byte-a-byte
contra a definição esperada da migration, nenhum a mais nem a menos.
`projects` passou de 9 para 10 índices — o acréscimo é exatamente o índice
único que o Postgres cria automaticamente para sustentar a nova constraint
`UNIQUE`, não um índice manual extra.

## 22. Triggers

`support_tickets_validate_write` (`BEFORE INSERT OR UPDATE` →
`atlaz.validate_ticket_write()`) e `support_tickets_updated_at` (`BEFORE
UPDATE` → `atlaz.set_updated_at()`, função herdada reaproveitada) —
confirmados presentes com a definição exata da migration. Nenhum trigger em
`ticket_comments` (imutabilidade garantida só por grants, conforme desenhado).

## 23. RLS `support_tickets`

Policy `support_tickets_select` confirmada com a condição exata: org da
sessão + `ticket:read` + `client:read` + membership ativa/scope `org` +
Cliente pai existente/visível. **Sem** `project:read` em nenhuma parte da
condição — confirmado tanto pelo texto da policy quanto por teste funcional
(usuário com `ticket:read`+`client:read` sem `project:read` continua vendo os
chamados). Sem `INSERT`/`UPDATE`/`DELETE` para `authenticated` — testado
diretamente (`42501` em ambas as tentativas).

## 24. RLS `ticket_comments`

Policy `ticket_comments_select` confirmada: org da sessão + `EXISTS` no
chamado pai (reaplica a própria RLS de `support_tickets`, mesmo truque
recursivo de `client_contacts → clients`) — sem duplicar nenhuma condição de
permissão. Testado: usuário com acesso ao chamado vê o comentário; usuário
sem `ticket:read` (chamado pai invisível) não vê o comentário, mesmo sabendo
o `ticket_id`. Sem escrita direta para nenhum papel (ver §28).

## 25. Grants pós-migration

`support_tickets`: `authenticated` → SELECT; `service_role` → SELECT/INSERT/
UPDATE (**sem DELETE**). `ticket_comments`: `authenticated` → SELECT;
`service_role` → **SELECT/INSERT apenas** (sem UPDATE, sem DELETE — nem para
a própria role de aplicação). Todos confirmados via
`information_schema.table_privileges` e reforçados por teste funcional
direto (§28).

## 26. `activity_events` policy final

Terceiro ramo (`entity_type='ticket'`) confirmado presente, com a condição
exata (`EXISTS` em `support_tickets`, reaplicando a RLS de chamado). **Uma
única policy `activity_select`** existe na tabela (sem policy adicional
combinada por `OR`) — confirmado por contagem (`activityPolicyCount: 1`).

## 27. Preservação de eventos client/project

Ramos `client` e `project` da policy **idênticos** ao texto anterior
(comparação de string exata contra o preflight). Testado funcionalmente:
evento de Cliente continua visível para quem tem `client:read`; evento de
Projeto continua **exigindo** `project:read` mesmo depois do terceiro ramo
existir — confirmando que a adição do ramo `ticket` não afrouxou nada dos
outros dois (regressão testada, não só assumida).

## 28. Comments immutability

Confirmado em duas camadas: **grants** (nem `authenticated` nem `service_role`
têm `UPDATE`/`DELETE` em `ticket_comments`) e **teste funcional direto** —
com um comentário real de fixture (dentro da transação revertida), tentativas
de `UPDATE`/`DELETE` como `service_role` foram ambas rejeitadas com `42501`.
Isso confirma que nem mesmo a conexão de aplicação (que teria BYPASSRLS se
fosse a role `postgres`, mas aqui testada como `service_role` real do
PostgREST/Supabase) consegue alterar um comentário — a imutabilidade é
estrutural, não apenas uma convenção do código do service.

## 29. Testes efêmeros executados

21 asserções (fixtures sintéticas — 2 orgs, 4 papéis, 5 usuários, 3 clientes,
3 projetos — nunca reais) dentro de **uma única transação sempre revertida**
(`ROLLBACK` forçado por sentinela, com `SAVEPOINT` isolando cada asserção que
esperava erro). **20 de 21 passaram.** A 1 restante ("ticket_number: gerado
pelo banco, crescente, sem MAX()+1") foi um **falso negativo do próprio
script de teste**, não um defeito real: o driver `postgres.js` devolve
colunas `bigint` como string JavaScript (para não perder precisão), e minha
asserção verificava `typeof === "bigint" || "number"` — o valor real (`"4"`,
depois `"5"`) estava correto e crescente, confirmado pela asserção **seguinte**
("segundo maior que o primeiro"), que converteu corretamente com `BigInt()` e
**passou**. Nenhum comportamento real do banco falhou.

## 30. Confirmação de ROLLBACK/zero resíduos

A transação terminou com um `throw` deliberado capturado fora do
`sql.begin(...)`, forçando `ROLLBACK` independentemente do resultado das
asserções. Verificação pós-execução: `count(*)` por `slug like
'qa-fixture-%'` em `orgs`, por `email like '%@qa.invalid'` em `users`, por
`key like 'qa_%'` em `roles`, e `count(*)` total em `support_tickets`/
`ticket_comments` — **todos retornaram 0**. Os três scripts temporários
usados nesta etapa (`.tmp-support-c1-preflight.mjs`,
`.tmp-support-c1-postcheck.mjs`, `.tmp-support-c1-rls-check.mjs`,
`.tmp-support-c1-residue-check.mjs`) foram apagados do diretório do projeto
ao final de cada uso — confirmado ausente do `git status`.

## 31. Contagens operacionais depois

`clients: 1`, `projects: 1`, `activity_events: 3`, `audit.log: 3` —
**idênticas, exatamente**, às capturadas antes da migration (§11).
`support_tickets: 0`, `ticket_comments: 0` — exatamente o esperado (tabelas
novas, vazias). **Nenhum dado operacional foi perdido, alterado ou criado.**

## 32. Reconciliação Drizzle × banco

Além da comparação manual acima, `npm run test` incluiu
`tests/integration/schema-reconciliation.test.ts`, que compara **automaticamente**
o schema Drizzle completo (todas as tabelas geridas, não só as novas) contra
um banco PGlite migrado do zero até 0005 — colunas, tipos, nullability,
defaults, nomes/ações de FK, checks, índices e RLS — e passou. Essa suíte
não roda contra o Supabase real (não há credencial de produção em testes
automatizados), mas a estrutura aplicada agora em produção é **byte-a-byte a
mesma SQL** que gerou esse schema testado — confirmado pelo hash do ledger
(§16) e pela inspeção manual direta do catálogo real (§17–§26).

## 33. Regressão Clientes

`clients`: 16 colunas, 15 constraints, 8 índices — **inalterado** frente ao
estabelecido nos Checkpoints de Clientes. `client_contacts` não foi tocado
(não aparece em nenhuma parte da migration 0005). RLS/policies de
`clients`/`client_contacts` confirmadas com o mesmo texto de antes (nenhuma
policy dessas duas tabelas foi recriada ou alterada). Timeline de Cliente
continua funcionando (coberta pela suíte automatizada completa, incluindo os
10 testes de `client-support-timeline.test.ts`).

## 34. Regressão Projetos

`projects`: 16 colunas (inalteradas), 15 constraints (14 originais + 1
`UNIQUE` aditiva), 10 índices (9 originais + 1 backing index da nova
`UNIQUE`) — **nenhuma coluna, FK, CHECK, trigger ou policy original foi
alterada**. `projects_select` confirmada com o texto exato de antes. Eventos
`entity_type='project'` continuam exigindo `project:read` exatamente como
antes (§27). Dados reais (`projects: 1`) preservados.

## 35. lint

`npm run lint`: **0 erros, 0 avisos.**

## 36. typecheck

`npm run typecheck`: limpo.

## 37. test

`npm run test`: **460 aprovados, 2 pulados** (23 arquivos) — **idêntico** ao
estado esperado do Checkpoint B, reexecutado (não presumido) após a aplicação
real.

## 38. test:foundation

`npm run test:foundation`: **342 aprovados**, 0 falhas (11 arquivos) —
idêntico ao esperado, reexecutado.

## 39. build

`npm run build` (após `rm -rf .next`): **concluído com sucesso**. `/suporte`
continua exatamente o mesmo placeholder; nenhuma rota nova; todas as rotas
existentes de Clientes/Projetos inalteradas.

## 40. Total final de testes

**460 aprovados + 2 pulados** (suíte completa) — **342 aprovados**
(foundation). Nenhuma mudança de contagem em relação ao Checkpoint B — a
aplicação real da migration não altera nenhum teste local (eles rodam contra
PGlite efêmero, não contra o Supabase).

## 41. Arquivos alterados no C1

Só este relatório (`docs/suporte-checkpoint-c1.md`). Nenhum arquivo de
código, schema, teste ou configuração foi criado/alterado nesta etapa — C1 é
puramente aplicação de banco + verificação, usando os arquivos já preparados
e aprovados no Checkpoint B.

## 42. `git diff --stat`

```
 package.json                                       |  2 +-
 src/server/db/migrations/meta/_journal.json        |  9 ++-
 src/server/db/schema/index.ts                      |  2 +
 src/server/db/schema/projects.ts                   |  4 ++
 src/server/repositories/client-timeline-repository.ts | 84 ++++++++++++----------
 src/server/services/client-service.ts              | 15 ++--
 src/server/services/service-error.ts               |  1 +
 tests/helpers/projects.ts                          |  2 +-
 tests/integration/schema-reconciliation.test.ts    | 20 ++++--
 9 files changed, 89 insertions(+), 50 deletions(-)
```

Idêntico ao final do Checkpoint B — nenhuma mudança de código nesta etapa.

## 43. `git status`

Idêntico ao §2 (início desta etapa), mais o novo relatório
`docs/suporte-checkpoint-c1.md`. Nada staged, nenhum commit.

## 44. Confirmação: nenhum commit/push/deploy

Confirmado — nenhum `git add`/`git commit`/`git push` executado. O único
efeito real desta etapa foi a aplicação da migration `0005_support.sql` ao
Supabase configurado, via `npm run db:migrate` (mesmo mecanismo já usado e
aprovado para 0002/0004).

## 45. Riscos/pendências para C2

1. **Estratégia de recuperação (§13):** não verificável nesta sessão por
   falta de acesso ao painel/API do Supabase — recomendo confirmar
   backup/PITR diretamente no dashboard antes de qualquer migration futura
   mais arriscada (esta 0005 já foi aplicada com sucesso e sem incidentes).
2. Nenhum risco técnico novo encontrado na aplicação real — schema, RLS,
   grants e policy de eventos bateram exatamente com o que foi testado em
   PGlite no Checkpoint B, sem surpresas.
3. Dados reais de produção (`clients: 1`, `projects: 1`, alguns eventos)
   permanecem intocados — confirmado antes e depois, byte a byte nas
   contagens.
4. As duas integrações conscientemente adiadas desde o Checkpoint A/B
   (timeline do Projeto incluindo chamados; aba de chamados na Ficha do
   Projeto) continuam pendentes para a integração final dos quatro módulos —
   não fazem parte do escopo de C1 nem de C2.

## 46. Recomendação para implementação da UI (Checkpoint C2)

**Critério de sucesso do C1 atingido integralmente:** 0005 aplicada
integralmente (transação única, sem erro, sem NOTICE de conteúdo próprio);
schema reconciliado (Drizzle × banco real, byte a byte); RLS correto (testado
funcionalmente, não só lido); grants corretos; nenhum dado operacional
perdido (contagens idênticas antes/depois); Clientes preservado; Projetos
preservado; testes verdes (460+2); foundation verde (342); build verde; zero
fixture persistente (confirmado por `count()` pós-rollback).

Fundação de Suporte está **aplicada e validada em produção**, pronta para a
Etapa C2 (UI: listagem, cadastro, ficha, comentários, ações de status,
integração com a aba Suporte da Ficha do Cliente e ativação de navegação) —
seguindo o mesmo padrão arquitetural já usado em Clientes e Projetos.

Parando aqui, aguardando aprovação explícita para C2. Sem UI, sem navegação,
sem commit/push/deploy nesta etapa.
