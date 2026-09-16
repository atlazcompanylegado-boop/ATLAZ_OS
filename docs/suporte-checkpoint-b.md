# Suporte — Checkpoint B: fundação

Data: 16/09/2026. Escopo autorizado: fundação, migration `0005` preparada e testes
isolados. **0005 NÃO aplicada ao Supabase real. Sem UI, sem navegação, sem
integração com a Ficha Mestre além da timeline consolidada do Cliente (aprovada
explicitamente para esta etapa).**

## 1. Preflight (somente leitura)

Reexecutado com script temporário (`.tmp-support-preflight.mjs`, criado e apagado
nesta sessão — confirmado ausente do `git status` final), mesma transação
`REPEATABLE READ READ ONLY`, sem DDL/DML:

- Ledger Drizzle: 5 entradas (0000–0004), hashes **idênticos** aos arquivos
  locais — `ledgerMatches: true`, nenhuma migration concorrente aplicada desde
  a publicação de Projetos.
- `public.support_tickets`/`tickets`/`ticket_comments`/`ticket_messages`:
  **nenhuma existe**.
- `projects`: só a constraint `projects_org_id_id_key` existe hoje (confirma
  que o `UNIQUE(org_id, client_id, id)` proposto no Checkpoint A ainda não foi
  criado por ninguém).
- Catálogo tem só `ticket:read`/`ticket:write` (sem `ticket:delete`/`manage`).
- Eventos `entity_type='ticket'`: **0**; `audit.log` com `entity_type='ticket'`: **0**.

## 2. Grants `ticket:*` reais (organização `atlaz`)

Idênticos aos já documentados no Checkpoint A — reconfirmados nesta etapa:

| Papel | Grants explícitos `ticket:*` |
|---|---|
| ceo | Nenhum |
| comercial | Nenhum |
| designer | read |
| dev | read, write |
| financeiro | read |
| social_media | Nenhum |
| socio | read, write |
| super_admin | Nenhum grant explícito; catálogo efetivo via resolver central |

## 3. Eventos legados / 4. Órfãos

Zero eventos `entity_type='ticket'` e zero `audit.log` equivalente no Supabase
real (ver §1). Nenhuma migração de dados necessária antes de ativar produtores.

## 5. Arquivos criados

- `src/server/db/schema/support-tickets.ts`, `ticket-comments.ts`; migration
  `0005_support.sql` + `meta/0005_snapshot.json`.
- `src/lib/auth/ticket-access.ts`.
- `src/lib/validation/ticket.ts`, `ticket-normalize.ts`; `src/lib/support/activity.ts`.
- `src/server/repositories/ticket-repository.ts`, `ticket-comment-repository.ts`,
  `ticket-timeline-repository.ts`.
- `src/server/services/ticket-service.ts`, `ticket-events.ts`.
- `tests/helpers/tickets.ts`, `tests/unit/ticket-validation.test.ts`.
- `tests/integration/ticket-foundation.test.ts`, `ticket-service.test.ts`,
  `ticket-concurrency.test.ts`, `ticket-migration.test.ts`,
  `client-support-timeline.test.ts`.
- Este relatório.

## 6. Arquivos modificados

- `src/server/db/schema/index.ts` (exporta os dois schemas novos).
- `src/server/db/schema/projects.ts` (`UNIQUE(org_id, client_id, id)` aditivo — ver §11).
- `src/server/repositories/client-timeline-repository.ts` e
  `src/server/services/client-service.ts` — terceiro ramo da timeline
  consolidada do Cliente (`entity_type='ticket'`, `canReadTickets`) — ver §34.
- `src/server/services/service-error.ts` (código aditivo `invalid_project`).
- `package.json` (`test:foundation` ganha os 4 arquivos de fundação de Suporte).
- `tests/helpers/projects.ts` (`seedProjects` passa a registrar `ticket:read`/
  `ticket:write` no catálogo de permissões da fixture — aditivo, necessário
  para qualquer teste conceder essas chaves; **não mudei os grants padrão** de
  `ownerA`/`ownerB`, que continuam só com `project:*`+`client:read` — os testes
  de Suporte concedem `ticket:*` explicitamente onde precisam, para não alterar
  o comportamento de nenhum teste existente de Clientes/Projetos).
- `tests/integration/schema-reconciliation.test.ts` (encadeia 0005; compara o
  novo snapshot; trata a exceção pontual do `UNIQUE` aditivo em `projects`).

Nenhum arquivo de UI, navegação ou Ficha Mestre (além do repository/service da
timeline) foi tocado. Nenhuma migration antiga foi editada.

## 7. Schema final — `support_tickets`

| Campo | Tipo, default e regra |
|---|---|
| `id` | UUID PK, gerado no banco |
| `ticket_number` | `bigint GENERATED ALWAYS AS IDENTITY`, único — ver §9 |
| `org_id` | UUID NOT NULL, FK `orgs`, RESTRICT |
| `client_id` | UUID NOT NULL, FK composta `(org_id, client_id) → clients`, imutável |
| `project_id` | UUID opcional, FK tripla `(org_id, client_id, project_id) → projects` — ver §10/§11; **pode mudar depois da criação** (vincular/trocar/remover), ao contrário de `client_id` |
| `title` | Texto NOT NULL, trim, 1–160 |
| `description` | Texto NOT NULL, trim, 1–10.000 (obrigatória — decisão do Checkpoint B, ajustando a recomendação do Checkpoint A) |
| `status` | Texto NOT NULL, default `open`; CHECK dos 6 estados aprovados (sem `closed`) |
| `priority` | Texto NOT NULL, default `normal`; CHECK `low/normal/high/critical` |
| `assigned_user_id` | UUID opcional, FK composta `(org_id, user_id)` para membership |
| `due_at` | TIMESTAMPTZ opcional |
| `resolved_at` | TIMESTAMPTZ opcional; preenchido só quando `status='resolved'` |
| `created_by` | UUID NOT NULL, FK composta para membership; só da sessão |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL, default now; `updated_at` por trigger |
| `version` | Inteiro NOT NULL, default 1; avança exatamente 1 por UPDATE |

Sem `opened_at` (redundante com `created_at` — Checkpoint A §19, confirmado) e
sem `closed_at` (não existe mais `closed` — §14/§15 aprovados nesta etapa).

## 8. Schema final — `ticket_comments`

| Campo | Tipo |
|---|---|
| `id` | UUID PK |
| `org_id` | UUID NOT NULL, FK `orgs` |
| `ticket_id` | UUID NOT NULL, FK composta `(org_id, ticket_id) → support_tickets` |
| `author_user_id` | UUID NOT NULL, FK composta para membership; só da sessão |
| `content` | Texto NOT NULL, trim, 1–10.000 |
| `created_at` | TIMESTAMPTZ NOT NULL, default now |

Sem `updated_at`, sem `version`, sem exclusão — imutável por completo (grants
não concedem UPDATE/DELETE a ninguém, nem ao `service_role`; ver §32).

## 9. `ticket_number`

`bigint NOT NULL GENERATED ALWAYS AS IDENTITY` — sequência interna própria do
Postgres, **global** (não por organização, conforme aprovado): cada INSERT
recebe o próximo valor da sequência de forma atômica, sem `SELECT MAX()+1` e
sem condição de corrida entre transações concorrentes (garantia do próprio
banco, testada em `ticket-foundation.test.ts`: dois inserts sequenciais
recebem números crescentes). `GENERATED ALWAYS` impede a aplicação de definir
o valor manualmente — uma tentativa de `INSERT`/`UPDATE` explícito no campo é
rejeitada pelo próprio Postgres com o código `428C9`, **antes mesmo do
trigger de imutabilidade rodar** (verificado explicitamente no teste "ticket_number
é GENERATED ALWAYS"). `UNIQUE(ticket_number)` adicionado como defesa em
profundidade e para a busca por número (Checkpoint A §33).

**Comportamento em rollback:** se uma transação de criação falhar e reverter
(ex.: falha simulada em `activity_events`/`audit.log`, testada em "falha em ...
reverte CREATE e UPDATE"), o valor da sequência **não volta atrás** — é o
comportamento padrão e documentado de sequências/identity no Postgres.
**Buracos na numeração são aceitáveis e esperados** (conforme aprovado
explicitamente no pedido, §48): não há nenhuma tentativa de preencher lacunas
ou renumerar depois. Isso é análogo ao mesmo comportamento já aceito para
`version`/timestamps em Clientes e Projetos.

## 10. Constraints

14 constraints em `support_tickets`: PK, `UNIQUE(org_id,id)`,
`UNIQUE(ticket_number)`, 5 FKs (org/cliente/projeto tripla/responsável/criador,
todas RESTRICT), e 6 CHECKs (título, descrição, status, prioridade, consistência
de `resolved_at`, versão). `ticket_comments`: PK, 3 FKs (org/chamado/autor,
RESTRICT) e 1 CHECK (conteúdo).

## 11. FK tripla — implementação e verificação

`UNIQUE(org_id, client_id, id)` aditivo em `projects` (nova constraint,
nenhuma coluna/trigger/policy/grant de Projetos alterado) permite:

```sql
FOREIGN KEY (org_id, client_id, project_id)
  REFERENCES projects (org_id, client_id, id) ON DELETE RESTRICT
```

Testado explicitamente contra as duas formas de violação possíveis — projeto
de **outro cliente da mesma org** e projeto de **outra org inteira** — ambas
rejeitadas com `23503` (violação de FK), e o caso positivo (projeto do mesmo
cliente) aceito. `project_id IS NULL` nunca aciona a constraint (`MATCH
SIMPLE`, padrão do Postgres) — chamado sem projeto passa livre, testado
explicitamente. O teste de reconciliação de schema confirma que **nenhuma
outra característica de `projects`** (colunas, demais FKs, checks, índices,
RLS, policies) mudou — só a nova chave única foi adicionada.

## 12. Índices

9 em `support_tickets` (PK, `org_id+id`, `ticket_number`, `org+created`,
`org+updated`, `org+client+created`, `org+project` parcial, `org+status`,
`org+priority`, `org+assignee` parcial, `org+due` parcial — 8 índices
adicionais além da PK, conforme lista do Checkpoint A §49, sem nenhum extra
não pedido) e 1 em `ticket_comments` (`org+ticket+created`).

## 13. Triggers

`validate_ticket_write()` (mesma estrutura de `validate_project_write`):
identidade (`id`, `org_id`, `client_id`, `created_by`, `created_at`,
`ticket_number`) imutável; versão inicial 1 e avanço exatamente 1;
`assigned_user_id` validado (membership+usuário ativos) só na
atribuição/troca, com `FOR SHARE`. `support_tickets_updated_at` reaproveita
`atlaz.set_updated_at()` (função herdada, não recriada). Nenhum trigger em
`ticket_comments` — imutabilidade garantida só por grants (ver §32), sem
trigger redundante.

## 14. Status

Os seis estados aprovados (`open/triage/in_progress/waiting_client/
resolved/cancelled`, sem `closed`) implementados exatamente como decidido.
`TICKET_NON_FINAL_STATUSES`/`isFinalTicketStatus` seguem o mesmo contrato de
Projetos. Transição entre não-finais é edição comum; entrar/sair de um estado
final exige ação explícita (`changeTicketStatus`/`reopenTicket`) — testado.

## 15. Prioridade

`low/normal/high/critical`, CHECK e rótulos próprios (`TICKET_PRIORITY_LABELS`),
nunca reaproveitando o enum de Projetos. Sem SLA automático por "Crítica"
(confirmado: nenhuma lógica de negócio olha para `priority` além de exibição e
o KPI "Críticos", que é uma contagem, não uma automação).

## 16. Resolved/Reopen

- **Resolver:** `resolved_at = now()` no servidor, testado (`resolved.resolvedAt`
  é `instanceof Date`).
- **Cancelar:** `resolved_at = NULL` sempre — nunca finge resolução, testado
  explicitamente ("cancelar mantém resolved_at nulo desde o início").
- **Reabrir:** `resolved/cancelled → in_progress`, `resolved_at = NULL`,
  gera `ticket.status_changed`. Tentar reabrir um chamado não-final é
  `invalid_transition`, testado.
- **Editar campos comuns com chamado já resolvido** (sem tocar status)
  continua funcionando, preservando `resolved_at` — mesmo contrato de
  Projetos para `completed`, testado explicitamente.

## 17. Responsável (`assigned_user_id`)

Mesma abordagem estrutural de Projetos: validado (membership+usuário ativos,
mesma org) só na atribuição/troca; responsável desativado depois permanece
como referência histórica sem bloquear outras edições — os dois cenários têm
teste dedicado, incluindo a tentativa de **nova** atribuição a alguém já
inativo (rejeitada com `invalid_owner`, reaproveitando o código existente em
vez de criar `invalid_assignee`).

## 18. `project_id` — vínculo mutável

Implementado exatamente como aprovado (§31 do pedido, ajustando minha
recomendação original do Checkpoint A que sugeria imutabilidade): `project_id`
pode ser vinculado, trocado e removido em qualquer edição posterior, sempre
revalidado contra `client_id` (imutável) via `ensureProject` — mesma
verificação de aplicação usada na criação, além da FK tripla no banco. Toda
mudança gera `ticket.project_changed` com `{before, after}` = IDs brutos
(nunca nome), no payload do evento.

## 19. Authorization

`src/lib/auth/ticket-access.ts::authorizeTicketSession(session, access)`:
sessão válida, membership ativa, `scope='org'`, `ticket:read`+`client:read`
(leitura), soma `ticket:write` (escrita). `project:read` **nunca** entra
nesta função — testado explicitamente ("leitura/escrita nunca dependem de
project:read"). `scope='assigned'` negado sem exceção, inclusive para
`super_admin` "assigned" (matriz de autorização com 9 casos, todos passando).

## 20. Project masking (Opção A aprovada)

`ticket-service.ts::maskProjectVisibility()`: toda linha de chamado ganha
`hasProject: boolean` (sempre seguro — só indica que existe vínculo, sem
detalhe) e `projectId`/`projectName` são **nulados** quando o chamador não
tem `project:read`. Aplicado em `getTicketDetail`, `listTickets` (por linha) e
`getTicketWorkspace`. Testado explicitamente: sem `project:read`, o chamado
continua 100% acessível (`hasProject: true`), mas `projectId`/`projectName`
vêm `null` e o nome real do projeto **não aparece em lugar nenhum do JSON**
serializado da resposta — com `project:read`, os dois campos vêm completos.

## 21. Validation

`src/lib/validation/ticket.ts`: schemas Zod para criação, edição, ação de
status (só `resolved`/`cancelled`), reabertura, filtros, paginação, seletor de
Cliente, seletor de Projeto (por Cliente) e criação de comentário. `title`
1–160; `description` obrigatória 1–10.000; `dueAt` aceita ISO-8601 e vira
`Date` (vazio = ausente, não erro); `clientId` nunca reenviável na edição
(`z.never()`); `projectId` aceita mudança livre na edição (union
UUID/null). 42 testes unitários cobrindo cada regra.

## 22. Normalization

`src/lib/validation/ticket-normalize.ts`: trim, `""→null`, número de
formulário, UUID minúsculo, escape literal de `%`/`_` — mesmo padrão de
`project-normalize.ts`, arquivo próprio (não compartilhado) para manter os
módulos independentes, como já é a convenção entre Clientes e Projetos.

## 23. Repositories

`ticket-repository.ts` (listagem/contagem/detalhe/lock/criação/edição,
seletor de Cliente, seletor de Projeto por Cliente, responsáveis disponíveis,
KPIs), `ticket-comment-repository.ts` (listar ascendente, criar), 
`ticket-timeline-repository.ts` (timeline própria do chamado, janelas fixas de
20). Toda função recebe `orgId` explícito e filtra por ele em toda
query/join/contagem — confirmado por revisão linha a linha, sem nenhuma
consulta por UUID isolado.

## 24. Services

`ticket-service.ts` centraliza sessão, autorização, validação, cliente,
projeto (`ensureProject`), responsável (`ensureAssignee`), transições,
mascaramento de Projeto, diff, version, transações, eventos, auditoria e
comentários — seguindo exatamente o padrão de `project-service.ts`
(`requireAccess`, `parse`, `validId`, `safe`, `mutate`).

## 25. Comments

Criação apenas (`createTicketComment`), exige `ticket:read`+`ticket:write`+
`client:read` (testado: `ticket:read` sozinho não basta) — **sem
`comment:write`** conforme decidido. Listagem em ordem cronológica
**ascendente** (conversa), diferente da Timeline (descendente) — testado
explicitamente. Não existe `updateTicketComment`/`deleteTicketComment` no
service (testado que essas funções nem existem, não só que falham).

## 26. Version

`support_tickets` tem `version` seguindo exatamente o contrato de
Clientes/Projetos. `ticket_comments` não tem — imutabilidade elimina a
necessidade (ver §8/§25).

## 27. No-op

Edição sem mudança real (título/descrição idênticos após trim, sem mudança de
status/prioridade/responsável/projeto/prazo) não gera `UPDATE`, evento ou
auditoria, e não avança `version` — testado. Versão desatualizada **sempre**
é conflito, mesmo quando o conteúdo enviado seria um no-op — testado
explicitamente (mesmo contrato de Clientes/Projetos).

## 28. Transactions

Criação: chamado + evento + auditoria numa única `db.transaction()`. Edição:
mesma lógica, `UPDATE` condicionado a `org_id+id+version`. Comentário: `INSERT`
do comentário + `ticket.comment_added` + `audit.log` na mesma transação. Falha
de qualquer `INSERT` de evento/auditoria reverte tudo — testado explicitamente
com um trigger de falha injetada em `activity_events` e em `audit.log`,
separadamente, para CREATE e UPDATE de chamado.

## 29. Events

Kinds implementados: `ticket.created`, `ticket.updated` (título/descrição
agrupados), `ticket.status_changed`, `ticket.priority_changed`,
`ticket.assignee_changed`, `ticket.project_changed`, `ticket.due_date_changed`,
`ticket.comment_added`. **Sem** `ticket.resolved`/`ticket.closed` — resolver/
cancelar/reabrir são só `status_changed` com o `before`/`after` corretos,
testado (nenhum kind redundante aparece). Payload de `ticket.project_changed`
guarda só os UUIDs antes/depois — nunca nome do Projeto (Checkpoint A §33).
`ticket.comment_added` não inclui o conteúdo do comentário no `summary` nem
no `payload` — só `commentId`, testado explicitamente com uma string de
conteúdo sensível que nunca aparece em nenhum dos dois lugares.

## 30. Audit

`ticket.create`/`ticket.update` com `before`/`after` serializados
(allowlist, nunca linha crua). **Ajuste aprovado nesta etapa** (Checkpoint B
§2, revisando minha recomendação original do Checkpoint A): `ticket.comment.create`
grava **só** `commentId`, `ticketId`, `authorUserId`, `createdAt` e o
`clientId` de contexto — **nunca o texto do comentário**. Testado
explicitamente: uma string de conteúdo sensível criada via
`createTicketComment` nunca aparece em `audit.log` nem em `activity_events`.

## 31. RLS

`support_tickets_select`: org da sessão + `ticket:read` + `client:read` +
membership ativa/scope `org` + Cliente pai visível — **sem** exigir
`project:read` (confirmado no texto da policy e testado: usuário com
`ticket:read`+`client:read` mas sem `project:read` continua vendo o chamado).
`ticket_comments_select`: org da sessão + `EXISTS` no chamado pai (reaplica a
RLS de `support_tickets` recursivamente, mesmo truque de `client_contacts →
clients`).

## 32. Grants

`support_tickets`: `authenticated` → SELECT; `service_role` → SELECT/INSERT/
UPDATE (sem DELETE). `ticket_comments`: `authenticated` → SELECT;
`service_role` → **SELECT/INSERT apenas** (sem UPDATE/DELETE, nem para o
próprio `service_role`) — testado explicitamente que mesmo a role
privilegiada de aplicação não consegue editar/apagar um comentário via SQL
direto (`42501`), reforçando a imutabilidade a nível de banco, não só de
código.

## 33. `activity_events` policy

Terceiro ramo (`entity_type='ticket'`) adicionado à **mesma** policy
`activity_select`, por substituição única (não `OR` adicional) — mesma
disciplina das duas trocas anteriores (Clientes→Projetos, Projetos→Suporte).
Testado com os três tipos coexistindo: evento de chamado só visível com
`ticket:read`+`client:read`; eventos de Cliente/Projeto/outros tipos
continuam exatamente como antes (regressão coberta); chamado forjado com
`org_id` de outra org nunca aparece; evento órfão de chamado nunca aparece;
só uma policy `activity_select` existe no banco (testado).

## 34. Timeline consolidada do Cliente

`client-timeline-repository.ts::listClientTimeline` ganhou um terceiro
parâmetro (`includeTicketEvents`) e um terceiro ramo de `UNION ALL`
(`entity_type='ticket'`, `INNER JOIN support_tickets` exigindo
`org_id`+`client_id` corretos — nunca `payload.clientId`). `client-service.ts`
calcula `canReadTickets` do mesmo jeito que já calculava `canReadProjects`
(`can(permissions, "ticket:read")`, sem consulta extra). As três flags
(`includeProjectEvents`, `includeTicketEvents`) são independentes — testado
com as quatro combinações possíveis, incluindo as três fontes juntas no mesmo
stream (teste K), cada uma com seu campo próprio (`projectName`/`ticketNumber`)
preenchido só na fonte correspondente. Paginação/ordenação continuam sobre o
fluxo já unido (uma única consulta), nunca somadas por fonte — testado com 30
eventos (15+15) devolvendo exatamente 20 na página 1. Nada muda no
comportamento para quem não tem `ticket:read` nem `project:read` (branch
antigo, sem `UNION`, preservado byte-a-byte).

**Fora desta etapa, conforme aprovado:** timeline consolidada do **Projeto**
(§41 do Checkpoint A, item 9 das decisões aprovadas) e aba de chamados na
Ficha do **Projeto** (§39/item 8) — ambas fica para a integração final dos
quatro módulos.

## 35. Testes adicionados

| Arquivo | Testes |
|---|---|
| `tests/unit/ticket-validation.test.ts` | 42 |
| `tests/integration/ticket-foundation.test.ts` | 53 |
| `tests/integration/ticket-service.test.ts` | 38 |
| `tests/integration/ticket-migration.test.ts` | 1 |
| `tests/integration/ticket-concurrency.test.ts` | 1 (pulado — exige Postgres local disposable, mesmo contrato do equivalente de Projetos) |
| `tests/integration/client-support-timeline.test.ts` | 10 |
| **Total novo** | **145** (144 executados + 1 pulado) |

## 36. Total de testes

`npm run test`: **460 aprovados, 2 pulados** (era 318 aprovados + 1 pulado
antes de Suporte). `npm run test:foundation`: **342 aprovados** (era 210).

## 37. lint

`npm run lint`: **0 erros, 0 avisos.**

## 38. typecheck

`npm run typecheck`: limpo.

## 39. test

`npm run test`: **460 aprovados, 2 pulados** (23 arquivos: 21 aprovados, 2 com
teste pulado).

## 40. foundation

`npm run test:foundation`: **342 aprovados**, 0 falhas (11 arquivos).

## 41. build

`npm run build` (após `rm -rf .next`): **concluído com sucesso**. `/suporte`
continua como o mesmo placeholder de antes (nenhuma rota nova criada,
conforme exigido); todas as rotas existentes de Clientes/Projetos inalteradas.

## 42. Resumo da 0005

`src/server/db/migrations/0005_support.sql`: `UNIQUE` aditivo em `projects`;
tabelas `support_tickets`+`ticket_comments` com todas as constraints/índices/
triggers; RLS+grants das duas tabelas; substituição controlada de
`activity_select` com o terceiro ramo. Ordem: constraint aditiva → tabelas →
função/triggers → RLS/grants → policy de eventos — mesma estrutura de `0004`.
Nenhuma migration antiga foi editada.

## 43. Confirmação: 0005 NÃO aplicada ao Supabase real

Confirmado — toda a validação (schema-reconciliation, foundation, service,
migration) rodou exclusivamente contra PGlite efêmero (em memória). A única
consulta ao Supabase real nesta etapa foi o preflight somente leitura do §1,
sem DDL/DML. `docs/suporte-checkpoint-a.md`/`b.md` documentam isso
explicitamente; nenhum script de aplicação (`db:migrate`) foi executado.

## 44. git diff --stat

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

(A maior parte do trabalho é arquivo novo — listado em `git status` abaixo,
não neste diff de arquivos já rastreados.)

## 45. git status

```
 M package.json
 M src/server/db/migrations/meta/_journal.json
 M src/server/db/schema/index.ts
 M src/server/db/schema/projects.ts
 M src/server/repositories/client-timeline-repository.ts
 M src/server/services/client-service.ts
 M src/server/services/service-error.ts
 M tests/helpers/projects.ts
 M tests/integration/schema-reconciliation.test.ts
?? docs/suporte-checkpoint-a.md
?? docs/suporte-checkpoint-b.md
?? src/lib/auth/ticket-access.ts
?? src/lib/support/
?? src/lib/validation/ticket-normalize.ts
?? src/lib/validation/ticket.ts
?? src/server/db/migrations/0005_support.sql
?? src/server/db/migrations/meta/0005_snapshot.json
?? src/server/db/schema/support-tickets.ts
?? src/server/db/schema/ticket-comments.ts
?? src/server/repositories/ticket-comment-repository.ts
?? src/server/repositories/ticket-repository.ts
?? src/server/repositories/ticket-timeline-repository.ts
?? src/server/services/ticket-events.ts
?? src/server/services/ticket-service.ts
?? tests/helpers/tickets.ts
?? tests/integration/client-support-timeline.test.ts
?? tests/integration/ticket-concurrency.test.ts
?? tests/integration/ticket-foundation.test.ts
?? tests/integration/ticket-migration.test.ts
?? tests/integration/ticket-service.test.ts
?? tests/unit/ticket-validation.test.ts
```

Nada staged, nenhum commit. Nenhum arquivo temporário, secret, `.env`, dump ou
screenshot presente — os dois scripts de preflight desta sessão
(`.tmp-support-preflight.mjs` e o reaproveitado de auditoria da Checkpoint A)
foram apagados antes deste relatório.

## 46. Riscos antes de C1

1. **`description` obrigatória** (ajuste desta etapa) muda o formulário
   futuro: todo chamado precisará de descrição não-vazia desde a criação —
   sem impacto em dado existente (não há chamado real ainda).
2. **`project_id` mutável** exige que a futura UI trate corretamente "trocar
   projeto" como uma ação de edição normal (não uma ação especial), incluindo
   o evento `ticket.project_changed` na timeline — já coberto pelo service e
   testado, mas a UI (Checkpoint C) precisa refletir essa mutabilidade
   corretamente no formulário.
3. **Mascaramento de Projeto (Opção A)** precisa ser respeitado também na UI
   futura — o componente de ficha do chamado não pode assumir que
   `projectId`/`projectName` sempre vêm preenchidos; `hasProject` é o sinal
   correto para decidir mostrar "Projeto vinculado" genérico.
4. **`ticket_number` como sequência global**: se decidir migrar para
   numeração por organização no futuro, é uma migration de dados (renumerar),
   não uma extensão trivial — decisão a reconfirmar antes de haver dado real.
5. **Duas integrações adiadas** (timeline do Projeto, aba de chamados na
   Ficha do Projeto) precisam ficar documentadas no roadmap para não serem
   esquecidas nem reabertas sem necessidade.
6. Nenhuma falha de segurança nova foi encontrada nesta fundação — os itens
   acima são decisões de desenho/sequenciamento, não vulnerabilidades.

## Recomendação para Checkpoint C1

Fundação completa, testada e verde (lint, typecheck, test, test:foundation e
build). Nenhuma decisão do Checkpoint A foi revista sem justificar
explicitamente a mudança (description obrigatória, project_id mutável, audit
de comentário sem conteúdo — todas seguindo as decisões explícitas deste
Checkpoint B, não escolhas minhas). `0005_support.sql` está pronta, revisada e
**não aplicada** ao Supabase real — só em PGlite efêmero.

Antes de avançar ao Checkpoint C1 (aplicação real): revisão humana explícita
deste relatório e do SQL de `0005_support.sql`; reconfirmar preflight/hashes
imediatamente antes de aplicar (mesmo protocolo de Projetos).

Parando aqui, aguardando aprovação. Sem UI, sem navegação, sem commit/push/deploy.
