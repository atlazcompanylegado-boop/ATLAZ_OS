# Domínios — Checkpoint C1: aplicação real da migration 0006

Data: 16/09/2026. Escopo autorizado: preflight final, revisão da migration,
aplicação segura ao Supabase real, reconciliação pós-migration, smoke tests de
banco, regressão de Clientes/Projetos/Suporte e validação da policy de
`activity_events`. **Sem UI, sem navegação, sem commit/push/deploy.**

**Achado central desta etapa (ver §5):** ao rodar o preflight desta sessão, a
`0006` **já estava aplicada** ao Supabase real — condição de parada explícita
do pedido ("tabela `domains` já existente"). Parei, mostrei evidência completa
ao usuário e recebi aprovação explícita para tratar a aplicação como válida e
seguir com o restante do checklist (reconciliação, testes efêmeros, regressão,
testes locais, relatório) em vez de reaplicar ou reverter. Nenhuma parte desta
etapa reabriu decisões do Checkpoint A/B.

## 1. HEAD/branch

`main`, HEAD `74515e4` ("docs: registra hotfix de Suporte em producao") —
**inalterado durante toda esta etapa**. Nenhum commit foi feito.

## 2. `git status` inicial

Idêntico ao estado deixado pelo Checkpoint B: 9 arquivos rastreados
modificados, arquivos novos da fundação de Domínios (schema, migration,
validação, repositories, services, testes), `docs/dominios-checkpoint-a.md` e
`docs/dominios-checkpoint-b.md` untracked, mais `.tmp-domain-c1-ephemeral.mjs`
(script de teste efêmero já preparado, untracked, presumivelmente de uma
execução anterior interrompida desta mesma etapa — ver §5).

## 3. Banco real confirmado

`current_database() = postgres`, `current_user = postgres` — conexão
privilegiada de migração via `DATABASE_URL` de `.env.local`, mesma usada em
todos os checkpoints anteriores.

## 4. Ledger antes do preflight desta sessão

**7 entradas**, não 6. A 7ª já presente: hash
`04707c665b1e8202bdc46b8d5d9e1d9622a8769552aa4cea51044b929faef0ae`.

## 5. Confirmação: 0006 — condição de parada acionada

**A 0006 NÃO estava ausente.** Ao consultar `public.domains` no início desta
etapa, a tabela **já existia**, com `domains_select` já criada e o quarto
ramo de `activity_select` já presente. Isso corresponde literalmente à
condição de parada do pedido ("tabela `domains` já existente" → PARE, mostre
evidência).

**Investigação antes de parar:**
- Hash local de `src/server/db/migrations/0006_domains.sql` (`sha256`)
  calculado nesta sessão: **idêntico**, byte a byte, ao hash da 7ª entrada do
  ledger. Não é uma migration diferente nem drift — é exatamente este
  arquivo.
- `created_at` do ledger é o `folderMillis` do journal (timestamp de geração
  do arquivo pelo `drizzle-kit generate`), não o horário real do `INSERT` —
  confirmado lendo `node_modules/drizzle-orm/pg-core/dialect.js`. Por isso
  **não foi possível recuperar o horário exato** em que a aplicação real
  ocorreu.
- `drizzle-orm` aplica **todas** as migrations pendentes dentro de **uma
  única transação** (`session.transaction(async (tx) => { for (...) {...} }
  )`, mesmo arquivo) — ou tudo é commitado, ou nada. A reconciliação completa
  (§18–§31) não encontrou nenhum artefato parcial, confirmando que a
  aplicação foi atômica e completa.
- Zero resíduo de teste (nenhuma org/usuário/role com padrão `qa-*`), zero
  linhas em `domains`, contagens operacionais idênticas ao último baseline
  documentado (Checkpoint C1 de Suporte, §31) — nada sugere um script manual
  fora do `migrate()` padrão.

**Conclusão apresentada ao usuário:** a aplicação é genuína, completa,
byte-idêntica ao SQL revisado e sem qualquer efeito colateral detectável —
tudo indica uma execução anterior interrompida desta mesma etapa C1 (mesma
sessão de trabalho, antes de uma reinicialização de contexto), já que não há
commit novo nem relatório C1 anterior. **Perguntei ao usuário como proceder**
(continuar tratando como aplicada / investigar antes / reverter e reaplicar).
**Resposta do usuário: continuar a partir daqui.** Segui com reconciliação,
testes efêmeros, regressão e testes locais — nunca rodei `db:migrate` nesta
sessão.

## 6. Drift

**Nenhum encontrado** frente ao que a 0006 declara (ver reconciliação
completa em §18–§31). Nenhuma condição de parada adicional do §4 do pedido
foi acionada.

## 7. Grants `domain:*` reais (pós-migration, confirmados nesta sessão)

| Papel | `client:read` | `domain:read` | `domain:write` |
|---|---|---|---|
| dev | ✓ | ✓ | ✓ |
| socio | ✓ | ✓ | — |
| demais papéis | (ver Checkpoint B §5) | — | — |

Idêntico ao documentado no Checkpoint B — nenhum grant foi criado, alterado
ou removido por esta migration ou por esta sessão.

## 8. Policies antes

**Não recuperável nesta sessão** — quando o primeiro preflight desta etapa
rodou, a `0006` já estava aplicada (§5), então não existe um snapshot "antes"
capturado por mim para esta aplicação específica. O que posso confirmar:
comparando o texto da `0006_domains.sql` (revisado em §12) com o texto da
`activity_select` documentado no Checkpoint C1 de Suporte (3 ramos:
client/project/ticket + fallback), a 0006 só **adiciona** o ramo `domain` e
amplia a lista de exclusão do fallback — os três ramos anteriores são
reproduzidos byte a byte na própria migration. Confirmado também
funcionalmente em §26.

## 9. Domain events legados

**0** em `activity_events` (`entity_type='domain'`).

## 10. Órfãos

**0** — consequência direta do item 9.

## 11. Contagens operacionais "antes"

**Não capturável diretamente** pelo mesmo motivo do §8 (a migration já
estava aplicada quando comecei). Uso como baseline de comparação os números
do Checkpoint C1 de Suporte (§31, última aplicação real documentada,
16/09/2026): `clients: 1`, `projects: 1`, `support_tickets: 0`,
`ticket_comments: 0`, `activity_events: 3`, `audit.log: 3`. Os números
capturados nesta sessão (§38) são **idênticos**, confirmando ausência de
qualquer perda ou alteração de dado operacional entre aquele checkpoint e
este.

## 12. Revisão final do SQL

Lida a migration completa (`0006_domains.sql`) linha a linha. Confirmado que
contém **somente**: tabela `domains` com 7 CHECKs, 5 FKs, 1 UNIQUE aditiva;
função `atlaz.validate_domain_write()` (identidade imutável, versão, owner);
2 triggers; 8 índices definidos manualmente (mais os 2 automáticos de PK/
UNIQUE); RLS + policy `domains_select` (sem exigir `project:read`, comentário
explícito no próprio SQL); grants (`REVOKE ALL` + `SELECT` para
`authenticated` + `SELECT/INSERT/UPDATE` para `service_role`, sem `DELETE`);
substituição única de `activity_select` com o quarto ramo. **Não contém**:
dado fake/seed, `DELETE`/`TRUNCATE`, mudança em `clients`/`projects`/
`support_tickets`/`ticket_comments` não justificada, UI, permissão nova (
`domain:read`/`domain:write` já existiam no catálogo desde antes do
Checkpoint A), ou segredo. Nenhuma constraint nova em `projects` — a FK
tripla reaproveita `projects_org_client_id_key` (UNIQUE aditiva da 0005).

## 13. Backup/PITR

**Não verificável nesta sessão** — mesma limitação já registrada nos
Checkpoints C1 de Suporte/Projetos: não há MCP/API do Supabase conectado
nesta sessão, e backup/PITR é configuração de plataforma, não consultável via
SQL comum. Pendência recorrente, recomendo confirmar diretamente no Supabase
Dashboard → Project Settings → Database → Backups.

## 14. Atomicidade

Confirmada por leitura direta de `node_modules/drizzle-orm/pg-core/dialect.js`:
`migrate()` envolve **todas** as migrations pendentes numa única
`session.transaction(async (tx) => {...})` — cada statement da 0006 executado
dentro dessa transação, com o `INSERT` no ledger como último passo. Sem
suporte parcial: ou tudo aplica, ou nada. A reconciliação completa (§18–§31)
não encontrou nenhum artefato parcial ou órfão, consistente com uma aplicação
atômica bem-sucedida.

## 15. Resultado da aplicação

**Já aplicada quando esta sessão começou** (§5) — não executei `npm run
db:migrate` nesta etapa. A reconciliação estrutural completa (§18–§31)
confirma que o resultado é idêntico ao que a `0006_domains.sql` revisada
declara, sem divergência.

## 16. Timestamp da aplicação

**Não recuperável com precisão** (§5) — o `created_at` do ledger reflete o
`folderMillis` do journal (timestamp de geração do arquivo), não o horário
real do `INSERT`. Não há commit, log local ou outro registro que indique o
horário exato. Provável: mais cedo nesta mesma sessão de trabalho, antes de
uma reinicialização de contexto (hoje, 16/09/2026).

## 17. Estado do ledger depois

**Ainda 7 entradas** — inalterado por esta sessão (não rodei `db:migrate`).
Os 6 hashes anteriores (`0000`–`0005`) seguem **idênticos**, confirmados
byte a byte contra os arquivos locais no preflight desta sessão (§4 da
consulta original).

## 18. Tabela `domains` criada

Confirmada em `information_schema.tables` (`public.domains`).

## 19. Schema real

16 colunas, todas com tipo/nullability/default conferidos byte a byte contra
o esperado: `id` (uuid, PK, `gen_random_uuid()`), `org_id`/`client_id`/
`created_by` (uuid NOT NULL), `project_id`/`owner_user_id` (uuid nullable),
`domain_name` (text NOT NULL), `registrar`/`notes` (text nullable),
`registration_date` (date nullable), `expiration_date` (date NOT NULL),
`auto_renew_status` (text NOT NULL default `unknown`), `status` (text NOT
NULL default `active`), `created_at`/`updated_at` (timestamptz NOT NULL
default `now()`), `version` (integer NOT NULL default `1`). Nenhuma
divergência.

## 20. Unique parcial

`domains_org_active_name_key`: `UNIQUE (org_id, domain_name) WHERE status <>
'inactive'` — confirmada no catálogo e testada funcionalmente (transação
efêmera com `ROLLBACK` forçado): **A.** ativo+ativo mesmo nome → rejeita
(`23505`); **B.** inactive + novo ativo mesmo nome → permite; **C.** reativar
o antigo com o novo ativo existente → rejeita (`23505`); **D.** mesma string
em outra org → permite. Todos os 4 casos passaram.

## 21. FK Cliente

`domains_client_fkey`: `FOREIGN KEY (org_id, client_id) REFERENCES
clients(org_id, id) ON DELETE RESTRICT` — confirmada no catálogo e testada:
domínio para cliente de outra org rejeitado (`23503`).

## 22. FK Projeto

`domains_project_fkey`: `FOREIGN KEY (org_id, client_id, project_id)
REFERENCES projects(org_id, client_id, id) ON DELETE RESTRICT` — confirmada
no catálogo e testada: projeto do mesmo cliente aceito; projeto de outro
cliente da mesma org rejeitado (`23503`); projeto de outra org rejeitado
(`23503`); `NULL` aceito livremente (`MATCH SIMPLE`).

## 23. Owner protection

Trigger `domains_validate_write` valida `owner_user_id` só na
atribuição/troca (`FOR SHARE`) — testado: usuário inativo na atribuição
rejeitado (`23514`); responsável válido atribuído, depois inativado, e uma
edição de outro campo (`registrar`) **não falhou** — `owner_user_id`
preservado como histórico.

## 24. Status checks

`domains_status_check`: `active|transferring|inactive` — testado, valor fora
do enum (`expired`) rejeitado (`23514`).

## 25. Auto renew check

`domains_auto_renew_check`: `configured|disabled|unknown` — testado, valor
fora do enum (`enabled`) rejeitado (`23514`).

## 26. Expiration date

`expiration_date date NOT NULL` — confirmado no catálogo (sem timezone) e
testado: `INSERT` sem o campo rejeitado (`23502`).

## 27. Version

`version integer NOT NULL default 1`, `domains_version_check: version >= 1` —
testado: `UPDATE` sem avançar a versão em exatamente +1 rejeitado (`23514`).

## 28. Immutability

Trigger `domains_validate_write` bloqueia mudança em `id`, `org_id`,
`client_id`, `domain_name`, `created_by`, `created_at` — testados
individualmente (`client_id`, `domain_name`, `org_id`, `created_by`), todos
rejeitados (`23514`). `project_id` confirmado **mutável** (remoção aceita).

## 29. Indexes

10 no total: `domains_pkey` (PK), `domains_org_id_id_key` (UNIQUE aditiva
para a FK tripla), `domains_org_active_name_key` (único parcial), mais 7
índices regulares/parciais (`org_client`, `org_project` parcial,
`org_status`, `org_expiration`, `org_owner` parcial, `org_created`,
`org_updated`) — todos confirmados byte a byte contra a definição da
migration.

## 30. Triggers

`domains_validate_write` (`BEFORE INSERT OR UPDATE` →
`atlaz.validate_domain_write()`) e `domains_updated_at` (`BEFORE UPDATE` →
`atlaz.set_updated_at()`, função herdada) — ambos confirmados presentes com a
definição exata.

## 31. RLS `domains`

`relrowsecurity = true`, `relforcerowsecurity = false` (mesmo padrão das
demais tabelas). Policy `domains_select` confirmada com o texto exato: org da
sessão + `domain:read` + `client:read` + membership ativa/scope `org` +
Cliente pai existente — **sem** `project:read` em nenhuma parte da condição
(confirmado tanto pelo texto quanto funcionalmente: usuário com
`domain:read`+`client:read` sem `project:read` continua vendo domínios,
inclusive os que têm projeto vinculado). Usuário sem `domain:read` não vê
nada (0 linhas). `authenticated` bloqueado de `INSERT`/`UPDATE` (`42501` em
ambos). **`anon` não tem nenhum grant de tabela em `domains`** — mais
restritivo ainda do que RLS filtrando: qualquer tentativa de `SELECT` já
falha com `42501` antes mesmo da RLS ser avaliada (confirmado por teste
direto).

## 32. Grants pós-migration

`domains`: `REVOKE ALL` de PUBLIC/anon/authenticated/service_role, depois
`SELECT` para `authenticated`, `SELECT/INSERT/UPDATE` para `service_role` —
confirmado via `information_schema.table_privileges` (nenhuma linha para
`anon`) e testado funcionalmente: `service_role` mantém `SELECT` mas
`DELETE` é rejeitado (`42501`).

## 33. `activity_events` policy final

Quarto ramo (`entity_type='domain'`, `EXISTS` em `public.domains`) confirmado
presente, com o texto exato da migration. **Uma única** policy
`activity_select` existe na tabela (`activityPolicyCount: 1` — sem policy
adicional combinada por `OR`).

## 34. Preservação client/project/ticket

Os três ramos anteriores comparados byte a byte com o texto da própria
migration (que os reproduz integralmente antes de adicionar o ramo `domain`)
— idênticos. Confirmado também que `clients_select`, `projects_select` e
`support_tickets_select` (policies das próprias tabelas, independentes de
`activity_select`) mantêm exatamente o texto documentado nos checkpoints
anteriores — nenhuma alteração.

## 35. Eventos órfãos

**0** — mesmo dado do §9/§10 (zero eventos `domain`, logo zero órfãos).

## 36. Testes efêmeros executados

**26 asserções**, em duas transações separadas (fixtures sintéticas, nunca
reais), ambas com `ROLLBACK` forçado por sentinela:

- **Script 1 (23/23 aprovadas):** FK cliente cross-org; FK projeto (mesmo
  cliente aceito, outro cliente rejeitado, outra org rejeitado); unicidade
  parcial (A/B/C/D); owner (inativo rejeitado na atribuição, histórico
  preservado); imutabilidade (`client_id`, `domain_name`, `org_id`,
  `created_by`); `project_id` mutável; `expiration_date NOT NULL`; CHECK de
  `status`; CHECK de `auto_renew_status`; `version` sem avanço rejeitado; RLS
  (leitura com `domain:read`+`client:read` sem `project:read`; sem
  `domain:read` não vê nada; `authenticated` bloqueado de `INSERT`/`UPDATE`).
  O script encerrou com um erro não capturado na 24ª asserção não protegida
  por `try/catch` (`anon` tentando `SELECT`) — o erro (`42501 permission
  denied for table domains`) é a **confirmação** de que `anon` não tem grant
  algum na tabela (mais restritivo que o esperado pelo script, não um
  defeito), mas impediu as 2 últimas asserções (anon, `service_role` sem
  `DELETE`) de rodar nesta transação. A transação foi revertida normalmente
  mesmo com o erro não capturado (`sql.begin` do `postgres.js` sempre reverte
  em caso de exceção, sentinela ou não) — zero resíduo confirmado.
- **Script 2, complementar (3/3 aprovadas):** `anon` sem grant algum em
  `domains` (permission denied, não apenas RLS vazio); `service_role`
  bloqueado de `DELETE`; `service_role` mantém `SELECT`.

## 37. Confirmação de ROLLBACK/zero resíduos

Confirmado após **ambas** as execuções: `count()` por `slug like
'qa-fixture%'` em `orgs`, `email like '%@qa.invalid'` em `users`, `key like
'qa_%'` em `roles`, e `count()` total/por nome em `domains` — **todos
retornaram 0** nas duas verificações. Os 5 scripts temporários usados nesta
etapa (`.tmp-domain-c1-preflight.mjs`, `.tmp-domain-c1-reconcile.mjs`,
`.tmp-domain-c1-ephemeral.mjs` — pré-existente, `.tmp-domain-c1-ephemeral2.mjs`,
`.tmp-domain-c1-regression.mjs`) foram apagados do diretório do projeto ao
final da etapa — confirmado ausente do `git status` final.

## 38. Contagens operacionais depois

`clients: 1`, `projects: 1`, `support_tickets: 0`, `ticket_comments: 0`,
`activity_events: 3`, `audit.log: 3`, `domains: 0` — **idênticas** ao último
baseline documentado (Checkpoint C1 de Suporte, §31). `domains: 0` é o
esperado (tabela nova, sem UI, sem dado real inserido). **Nenhum dado
operacional foi perdido, alterado ou criado.**

## 39. Reconciliação Drizzle × real

Feita manualmente, item a item, nesta sessão: colunas, tipos, defaults,
nullability, CHECKs, FKs, UNIQUE, índices, triggers, RLS e grants — **100%
de correspondência** com o schema Drizzle (`src/server/db/schema/domains.ts`)
e com o SQL da migration revisado em §12. Adicionalmente,
`tests/integration/schema-reconciliation.test.ts` (que compara o schema
Drizzle completo contra um banco PGlite migrado do zero até 0006) passou como
parte do `npm run test` (§46) — essa suíte roda contra PGlite efêmero, não
contra o Supabase real, mas a estrutura aplicada em produção é byte a byte a
mesma SQL, confirmado pelo hash do ledger (§5) e pela inspeção manual direta
do catálogo real (§19–§33).

## 40. Regressão Clientes

`clients`: 16 colunas, 15 constraints, 8 índices — **inalterado**. Uma única
policy `clients_select`, texto idêntico ao documentado. Grants inalterados.
`clients: 1` preservado.

## 41. Regressão Projetos

`projects`: 16 colunas, 15 constraints (14 originais + `UNIQUE` aditiva da
0005), 10 índices — **inalterado** frente ao estabelecido em Suporte C1.
`projects_org_client_id_key` e `projects_org_id_id_key` ambas presentes. Uma
única policy `projects_select`, texto idêntico. Grants inalterados.
`projects: 1` preservado.

## 42. Regressão Suporte

`support_tickets`: 16 colunas, 14 constraints, 11 índices — inalterado.
`ticket_comments`: 6 colunas, 5 constraints, 2 índices — inalterado. Uma
única policy cada (`support_tickets_select`, `ticket_comments_select`),
textos idênticos aos documentados no Checkpoint C1 de Suporte. Grants
inalterados (`ticket_comments`: `service_role` só `SELECT/INSERT`, sem
`UPDATE`/`DELETE` — imutabilidade preservada). `support_tickets: 0`,
`ticket_comments: 0` preservados.

## 43. Timeline consolidada — 4 fontes

Código já implementado no Checkpoint B (`client-timeline-repository.ts`,
`unionAll` dinâmico). Reexecutados nesta sessão como parte do `npm run test`:
`tests/integration/client-domain-timeline.test.ts` (12 testes, incluindo o
teste com as quatro fontes simultâneas e as combinações de permissão) e os
23 testes preexistentes de timeline de Clientes/Suporte — todos passaram,
confirmando que a refatoração da etapa B não regrediu nenhuma combinação
(client-only, client+project, client+ticket, client+project+ticket).

## 44. lint

`npm run lint`: **0 erros, 0 avisos.**

## 45. typecheck

`npm run typecheck`: limpo.

## 46. test

`npm run test`: **708 aprovados, 2 pulados** (36 arquivos) — idêntico ao
estado esperado do Checkpoint B, reexecutado (não presumido) nesta sessão.

## 47. test:foundation

`npm run test:foundation`: **512 aprovados**, 0 falhas (17 arquivos) —
idêntico ao esperado, reexecutado.

## 48. build

`npm run build` (após `rm -rf .next`): **concluído com sucesso**. Nenhuma
rota `/dominios`; nenhuma rota existente quebrada; navegação sem entrada de
Domínios (`grep` em `src/config/navigation.ts` sem resultado).

## 49. Total final de testes

**708 aprovados + 2 pulados** (suíte completa) — **512 aprovados**
(foundation). Nenhuma mudança de contagem em relação ao Checkpoint B.

## 50. Arquivos alterados no C1

Só este relatório (`docs/dominios-checkpoint-c1.md`). Nenhum arquivo de
código, schema, teste ou configuração foi criado/alterado nesta etapa. Cinco
scripts temporários (`.tmp-domain-c1-*.mjs`) foram criados/usados/apagados
durante a sessão — nenhum permanece no diretório do projeto.
`docs/banco.md` e `docs/seguranca.md` **não foram alterados**: seguindo o
mesmo padrão dos Checkpoints C1 de Projetos/Suporte (que também não os
tocaram nesta fase), essas atualizações ficam para o checkpoint de
publicação (D), quando o módulo for de fato marcado como concluído.

## 51. `git diff --stat`

```
 package.json                                       |  2 +-
 src/server/db/migrations/meta/_journal.json        |  7 ++
 src/server/db/schema/index.ts                      |  1 +
 .../repositories/client-timeline-repository.ts     | 94 +++++++++++++---------
 src/server/services/client-service.ts              | 18 +++--
 src/server/services/service-error.ts               |  1 +
 tests/helpers/projects.ts                          |  2 +-
 tests/integration/schema-reconciliation.test.ts    | 16 ++--
 tests/unit/client-timeline.test.tsx                |  1 +
 9 files changed, 87 insertions(+), 55 deletions(-)
```

Idêntico ao final do Checkpoint B — nenhuma mudança de código nesta etapa.

## 52. `git status`

Idêntico ao §2 (início desta etapa), menos `.tmp-domain-c1-ephemeral.mjs`
(apagado após uso), mais este novo relatório
(`docs/dominios-checkpoint-c1.md`). Nada staged, nenhum commit.

## 53. Confirmação: nenhum commit/push/deploy

Confirmado — nenhum `git add`/`git commit`/`git push` executado nesta sessão.
Nenhum `npm run db:migrate` executado por mim nesta sessão (a 0006 já estava
aplicada ao chegar — ver §5).

## 54. Riscos/pendências para C2

1. **Origem exata da aplicação da 0006 (§5, §16) não é 100% rastreável** —
   evidência forte (hash idêntico, atomicidade do Drizzle, reconciliação
   perfeita, zero resíduo, contagens preservadas) aponta para uma execução
   anterior interrompida desta mesma etapa, mas o timestamp real não pôde ser
   recuperado. Recomendo, como boa prática, revisar os logs do provedor
   (Supabase) se precisar do horário exato por algum motivo de auditoria
   externa a este processo.
2. **Backup/PITR (§13):** ainda não verificável nesta sessão — mesma
   pendência recorrente dos checkpoints anteriores.
3. Nenhum risco técnico novo encontrado na reconciliação — schema, RLS,
   grants e policy de eventos batem exatamente com o que foi projetado e
   testado no Checkpoint B, sem surpresas.
4. Dados reais de produção (`clients: 1`, `projects: 1`, eventos existentes)
   permanecem intocados — confirmado nesta sessão, byte a byte nas
   contagens.
5. Grants `domain:*` hoje não exercitam o caminho de mascaramento de Projeto
   (nenhum papel tem `domain:read` sem `project:read`) — mesma observação já
   registrada no Checkpoint B §54, não é um risco de código.
6. As integrações adiadas (timeline do Projeto incluindo Domínios; aba de
   Domínios na Ficha do Projeto) continuam fora do escopo de C1/C2.

## 55. Recomendação para implementação da UI (Checkpoint C2)

**Critério de sucesso do C1 atingido integralmente:** 0006 aplicada
integralmente (transação única, sem artefato parcial); schema reconciliado
(Drizzle × banco real, byte a byte); unicidade parcial correta (4/4 casos);
FKs corretas (cliente + projeto tripla); RLS correta (testada
funcionalmente); grants corretos (`anon` sem nenhum acesso, `authenticated`
só leitura, `service_role` sem `DELETE`); `activity_events` preservado (4
ramos, 1 única policy); zero perda de dados (contagens idênticas); Clientes
preservado; Projetos preservado; Suporte preservado; testes verdes (708+2);
foundation verde (512); build verde; zero fixture persistente (confirmado
por `count()` pós-rollback nas duas transações efêmeras).

A única ressalva registrada é de **proveniência/rastreabilidade** (§54.1),
não de correção técnica — a aplicação em si é verificadamente completa,
atômica e sem efeitos colaterais.

Fundação de Domínios está **aplicada e validada em produção**, pronta para a
Etapa C2 (UI: listagem, cadastro, ficha, ações de status, integração com a
aba Domínios da Ficha do Cliente e ativação de navegação) — seguindo o mesmo
padrão arquitetural já usado em Clientes, Projetos e Suporte.

Parando aqui, aguardando aprovação explícita para C2. Sem UI, sem navegação,
sem commit/push/deploy nesta etapa.
