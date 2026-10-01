# Domínios — Checkpoint B: fundação

Data: 16/09/2026. Escopo autorizado: fundação completa — schema, migration `0006`
preparada, normalização/validação, authorization, repository, service, timeline
própria e consolidada no Cliente, audit, version/concorrência, RLS/grants
preparados e testes. **Sem UI, sem aplicar a 0006 ao Supabase real, sem
commit/push/deploy.** Nenhuma decisão aprovada no Checkpoint A foi reaberta.

## 1. Estado inicial

Branch `main`, HEAD `74515e4` ("docs: registra hotfix de Suporte em
producao"), sincronizada com `origin/main`. `git status`: só
`docs/dominios-checkpoint-a.md` (untracked, propositalmente fora do commit do
hotfix). `git diff --stat`: vazio. `git log --oneline -15` confirma Clientes,
Projetos, Suporte e o hotfix de Suporte publicados; nenhum commit de Domínios.
Releitura confirmada de `docs/dominios-checkpoint-a.md` (especificação
oficial desta etapa), `docs/suporte-hotfix-project-masking.md` (para não
repetir a falha), README/roadmap/banco/segurança e checkpoints finais de
Clientes/Projetos/Suporte.

## 2. HEAD

`74515e4dcbe797c9666ec63878d775de8efb2385`… — na prática:
`74515e4` ("docs: registra hotfix de Suporte em producao"), inalterado ao
longo de toda esta etapa (nenhum commit foi feito).

## 3. `git status` (ao final)

```
 M package.json
 M src/server/db/migrations/meta/_journal.json
 M src/server/db/schema/index.ts
 M src/server/repositories/client-timeline-repository.ts
 M src/server/services/client-service.ts
 M src/server/services/service-error.ts
 M tests/helpers/projects.ts
 M tests/integration/schema-reconciliation.test.ts
 M tests/unit/client-timeline.test.tsx
?? docs/dominios-checkpoint-a.md
?? src/lib/auth/domain-access.ts
?? src/lib/domains/
?? src/lib/validation/domain-normalize.ts
?? src/lib/validation/domain.ts
?? src/server/db/migrations/0006_domains.sql
?? src/server/db/migrations/meta/0006_snapshot.json
?? src/server/db/schema/domains.ts
?? src/server/repositories/domain-repository.ts
?? src/server/repositories/domain-timeline-repository.ts
?? src/server/services/domain-events.ts
?? src/server/services/domain-service.ts
?? tests/helpers/domains.ts
?? tests/integration/client-domain-timeline.test.ts
?? tests/integration/domain-foundation.test.ts
?? tests/integration/domain-migration.test.ts
?? tests/integration/domain-project-access.test.ts
?? tests/integration/domain-service.test.ts
?? tests/unit/domain-format.test.ts
?? tests/unit/domain-validation.test.ts
```

Nada staged, nenhum commit.

## 4. Preflight

**Desbloqueado nesta etapa** (o Checkpoint A registrou bloqueio; tentei de
novo, sem contornar nada, e a mesma consulta somente leitura — transação
`REPEATABLE READ READ ONLY`, script apagado ao final, nunca commitado —
funcionou). Confirmado contra o Supabase real:

- Ledger: **6 entradas** (`0000`–`0005`), colunas `id/hash/created_at`.
  Próxima migration real é **`0006`** — não presumido, conferido.
- `public.domains`/`tickets`/`support_tickets` com nome "domain": **nenhuma**
  existe (só `auth.sso_domains`, tabela do Supabase Auth, não gerenciada por
  este projeto e irrelevante aqui).
- Catálogo `public.permissions`: `domain:read`, `domain:write` já existem
  (confirmado, não presumido).
- `projects`: as duas UNIQUE já esperadas existem —
  `projects_org_id_id_key` e `projects_org_client_id_key` (criada pela 0005
  para Suporte) — confirma que **nenhuma constraint nova é necessária** em
  `projects` para a FK tripla de Domínios (Checkpoint A §13/D13, reafirmado).
- `activity_events`: **0** eventos `entity_type='domain'`; `audit.log`: **0**
  registros `entity_type='domain'`. Nenhuma migração de dados necessária.
- Única policy em `activity_events`: `activity_select` (sem drift).

## 5. Grants `domain:*` reais (organização `atlaz`)

| Papel | `client:read` | `domain:read` | `domain:write` |
|---|---|---|---|
| ceo | — | — | — |
| comercial | ✓ | — | — |
| designer | ✓ | — | — |
| dev | ✓ | ✓ | ✓ |
| financeiro | ✓ | — | — |
| social_media | — | — | — |
| socio | ✓ | ✓ | — |
| super_admin | (catálogo completo via resolver central) | | |

**Achado relevante:** hoje **nenhum papel tem `domain:read` sem também ter
`project:read`** — `dev` tem os dois; `socio` tem os dois (`project:read`
confirmado nos preflights de Projetos/Suporte já documentados). O caminho de
mascaramento não é exercitável pelos grants atuais, mas — exatamente como
ensinado pelo hotfix de Suporte — o módulo foi construído para o caso geral,
não para os grants de hoje. Nenhum grant foi criado/alterado/removido.

## 6. Eventos `domain` existentes

**0** em `activity_events` e **0** em `audit.log` — confirmado no mesmo
preflight (§4).

## 7. Schema final — `domains`

| Campo | Tipo, default e regra |
|---|---|
| `id` | UUID PK, gerado no banco |
| `org_id` | UUID NOT NULL, FK `orgs`, RESTRICT; só da sessão |
| `client_id` | UUID NOT NULL, FK composta `(org_id, client_id) → clients`; **imutável** |
| `project_id` | UUID opcional, FK tripla `(org_id, client_id, project_id) → projects`; **mutável** |
| `domain_name` | Texto NOT NULL, forma canônica (ASCII/punycode, minúsculas, sem ponto final); **imutável** |
| `registrar` | Texto opcional, trim, 1–160 |
| `registration_date` | DATE opcional |
| `expiration_date` | DATE **NOT NULL** |
| `auto_renew_status` | Texto NOT NULL default `unknown`; CHECK `configured/disabled/unknown` |
| `status` | Texto NOT NULL default `active`; CHECK `active/transferring/inactive` |
| `owner_user_id` | UUID opcional, FK composta `(org_id, user_id)` para membership |
| `notes` | Texto opcional, trim, 1–2000 |
| `created_by` | UUID NOT NULL, FK composta para membership; só da sessão; imutável |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL, default now; `updated_at` por trigger |
| `version` | Inteiro NOT NULL, default 1; UPDATE avança exatamente 1 |

16 colunas, 8 índices (incluindo o único parcial), 5 FKs, 7 CHECKs — todos
confirmados byte a byte pelo teste de reconciliação de schema (§45).

## 8. `domain_name` canônico

Persistido sempre em ASCII/punycode, minúsculas, sem ponto final — nunca a
forma digitada. `münchen.de` → `xn--mnchen-3ya.de`. O CHECK
`domains_name_check` (`= lower(...)`, sem ponto final, 1–253) é defesa em
profundidade — a aplicação já garante isso antes de qualquer INSERT/UPDATE.

## 9. Normalização

Pipeline puro em `src/lib/validation/domain-normalize.ts`
(`normalizeDomainName`), testado contra as 21 entradas do Checkpoint A
(§10/§15–17) mais os casos extras do pedido (IPv4, rótulo com hífen nas
pontas, rótulo vazio, esquema não-http): **aceita** `https://`/`http://`,
maiúsculas, ponto final único; **rejeita com mensagem específica** (nunca
corrige em silêncio) caminho, query, fragmento, porta, credenciais embutidas e
`www.` — sugerindo o domínio correto sem aplicá-lo automaticamente. Evidência
técnica documentada no Checkpoint A se confirmou na implementação: nem
`domainToASCII` isolado nem `new URL()` isolado bastam (o primeiro trunca
caminho/query em silêncio; o segundo descarta credenciais em silêncio) — o
pipeline combina checagens explícitas **antes** de delegar a conversão
IDN→ASCII à `URL()`.

## 10. IDN/punycode

Sem dependência nova: `new URL("http://" + domínio).hostname` já faz a
conversão UTS-46 nativa (Node/navegadores) e rejeita (lança) punycode
malformado — capturado e traduzido para a mensagem "domínio inválido".
`domainNameToUnicode()` faz o caminho inverso para apresentação futura
(`node:url.domainToUnicode`, com fallback seguro ao próprio ASCII se a
conversão não for possível). Round-trip testado sem perda
(`xn--mnchen-3ya.de` ↔ `münchen.de`).

## 11. Unicidade

Índice **único parcial** `domains_org_active_name_key` em
`(org_id, domain_name) WHERE status <> 'inactive'` — implementado como
`CREATE UNIQUE INDEX ... WHERE`, porque unicidade parcial no Postgres exige
índice, não `CONSTRAINT UNIQUE` (que não aceita `WHERE`). Testado
explicitamente: dois domínios ativos com o mesmo nome na mesma org rejeitam
(`23505`); um inativo + um novo ativo com o mesmo nome é aceito (histórico
preservado); **reativar o antigo enquanto o novo ativo existe rejeita**
(Checkpoint A §22, teste dedicado); outra org aceita livremente o mesmo nome.

## 12. Cliente

`client_id` obrigatório, mesma org, FK composta `(org_id, client_id) →
clients(org_id, id)` RESTRICT, **imutável** (trigger). Nome/documento do
Cliente nunca copiados.

## 13. Projeto

`project_id` opcional. FK tripla `(org_id, client_id, project_id) →
projects(org_id, client_id, id)` RESTRICT, reaproveitando o
`UNIQUE(org_id, client_id, id)` **já existente desde a 0005** — confirmado no
preflight (§4) e testado (projeto de outro cliente/outra org rejeitado com
`23503`; `NULL` passa livre — `MATCH SIMPLE`). **Nenhuma constraint nova em
`projects`.** Mutável (vincular/trocar/remover), sempre revalidado no serviço.

## 14. Project masking

Implementado **desde o primeiro commit** com a correção já aplicada em
Suporte (`docs/suporte-hotfix-project-masking.md`), não como um remendo
posterior:

- `maskProjectVisibility()` no serviço: `hasProject` sempre seguro;
  `projectId`/`projectName` só saem com `project:read`.
- `requireProjectAccess()` é checado **antes** de qualquer validação/consulta
  em `listDomainProjects`, `getDomainProject`, criação com `projectId`
  presente e edição com `projectId` presente — nunca "consultar e depois
  esconder".
- `scopeFilters()`: sem `project:read`, um `projectId` vindo de filtro é
  **ignorado** (não vira `forbidden`, não vira oráculo — resultado idêntico ao
  da listagem sem esse filtro, testado com projeto real e UUID inventado).
- Busca: `projects.name` só entra no predicado `ILIKE` com `project:read`
  (repository recebe `DomainQueryAccess` obrigatório desde a primeira versão).
- **Semântica de PATCH correta desde o início:** `projectId` ausente no
  payload de edição preserva o vínculo atual; presente (UUID ou `null`) exige
  `project:read` e é rejeitado (`forbidden`) sem essa permissão — nunca
  apagado em silêncio.
- 13 testes dedicados em `domain-project-access.test.ts` cobrindo os itens
  A–P do roteiro do hotfix, adaptados a Domínios, todos verdes já na primeira
  execução (nenhuma falha "de fábrica" como aconteceu em Suporte).

## 15. Responsável (`owner_user_id`)

Opcional. Validado (membership+usuário ativos, mesma org) só na
atribuição/troca (trigger com `FOR SHARE`, mesmo padrão de
`assigned_user_id`/`owner_user_id` de Suporte/Projetos). Responsável
desativado depois permanece como referência histórica, sem bloquear outras
edições — testado (`user`/`membership` inativos).

## 16. Registrador

Texto opcional, trim, 1–160, sem tabela de provedores.

## 17. Data de registro

DATE opcional, sem lógica própria além do CHECK
`registration_date <= expiration_date` (quando ambos existem, igual aceito).

## 18. Data de vencimento

DATE **obrigatório** (Checkpoint A §16/D8) — campo central do módulo. Nunca
derivado automaticamente; só editável explicitamente, sempre gerando
`domain.expiration_changed`.

## 19. Renovação automática

Três estados (`configured`/`disabled`/`unknown`), default `unknown` — nunca
`false` por omissão, porque o sistema nunca verifica externamente
(Checkpoint A §17/D9). Rótulos: "Renovação automática configurada" /
"desativada" / "Não informado" — nunca "será renovada"/"garantida".

## 20. Status

Persistido só `active`/`transferring`/`inactive`, default `active`. Nunca
`expiring`/`expired` (derivados, ver §21).

## 21. Situação de vencimento (derivada)

Nunca persistida — `domainExpirationState()` (puro, testado) calcula a partir
de `expiration_date`, `status` e "hoje" em America/Sao_Paulo. `inactive`
sempre devolve `not_applicable` (decisão D31 aprovada — não gera urgência).
`transferring` participa normalmente (Checkpoint B §32).

## 22. Buckets

**Exclusivos** (para tom visual futuro, não usados nesta etapa sem UI):
`expired` (<0) / `due_7` (0–7) / `due_15` (8–15) / `due_30` (16–30) /
`due_60` (31–60) / `ok` (>60) — testados nas 11 fronteiras exatas
(-1,0,7,8,15,16,30,31,60,61,365). **Cumulativos** para filtros/KPIs no
repository (`expiringWithin(N)`: `0 ≤ dias ≤ N`) — nunca esconde urgência
(um domínio que vence em 3 dias aparece tanto no filtro "até 7" quanto "até
30"/"até 60").

## 23. Timezone/tratamento de datas

`expiration_date`/`registration_date` são `date` puro no Postgres
(`mode: "string"` no Drizzle) — nunca passam por `Date`/timezone.
`domainDaysRemaining()` compara os dois valores como meia-noite UTC (o fuso
se cancela na subtração — mesma técnica seguramente já usada para
`formatProjectDate`). "Hoje" no repository usa
`(now() at time zone 'America/Sao_Paulo')::date` (SQL) — idêntico ao já usado
em `project-repository.ts` para `overdue`. Teste dedicado de fronteira
confirma que a aritmética de datas puras não reintroduz deslocamento.

## 24. Segurança de `notes`

Conteúdo **nunca** aparece em `activity_events.payload`/`summary` nem em
`audit.log.before/after` — só `notesPresent: boolean` no audit e o rótulo
genérico "observações" agrupado em `domain.updated`. Testado com uma string
sensível que não aparece em nenhum dos dois lugares (mesmo padrão já usado
para comentários de Suporte).

## 25. Segurança de credenciais

Nenhum campo de senha, EPP/Auth Code, API key, token, secret, chave privada
ou `credential_reference` foi criado — confirmado por grep no schema e nos
demais arquivos novos. A arquitetura do futuro Cofre (`docs/seguranca.md §5`)
permanece a única via prevista para isso.

## 26. Authorization

`src/lib/auth/domain-access.ts::authorizeDomainSession(session, access)`:
sessão válida, membership ativa, `scope='org'`, `domain:read`+`client:read`
(leitura), soma `domain:write` (escrita). `project:read` nunca entra nesta
função. `scope='assigned'` negado sem exceção, inclusive `super_admin`
"assigned" — testado (9 casos de matriz de autorização, mais os específicos
de `assigned`/`super_admin` no `domain-foundation.test.ts`).

## 27. Validation

`src/lib/validation/domain.ts`: schemas Zod para criação (com `domainName`
via `transform` que chama `normalizeDomainName` e produz mensagem de campo
específica por motivo de rejeição — nunca uma mensagem genérica), edição
(todos os campos opcionais, PATCH), filtros, paginação, seletor de Cliente e
de Projeto por Cliente. `clientId`/`domainName` nunca reenviáveis na edição
(`z.never()`). 45 testes unitários cobrindo cada regra + os 21 casos de
normalização.

## 28. Helpers de normalização

`src/lib/validation/domain-normalize.ts` (domínio) e
`src/lib/domains/format.ts` (datas/buckets) — módulos puros, sem I/O, testados
isoladamente (45 + 21 = 66 testes unitários).

## 29. Repository

`src/server/repositories/domain-repository.ts`: `listDomains`,
`countDomains`, `getDomainById`, `lockDomain`, `createDomain`,
`updateDomain`, `getDomainClient`, `getDomainProject`, `findAvailableOwner`,
`listAvailableOwners`, `listDomainClients`, `listDomainProjects`,
`getDomainCounts`. Toda função recebe `orgId` explícito e filtra por ele em
toda query/join/contagem — nenhuma consulta por UUID isolado (revisão linha a
linha). `DomainQueryAccess` (`{ canReadProjects }`) é parâmetro **obrigatório**
de `listDomains`/`countDomains` desde a primeira versão — não um retrofit.

**Bug encontrado e corrigido durante esta etapa** (não em produção — só em
código ainda não publicado): `date + $1` é ambíguo para o Postgres quando o
inteiro chega como parâmetro sem tipo (`operator is not unique: date +
unknown`). Corrigido interpolando o número de dias da janela cumulativa via
`sql.raw` — seguro porque `maxDays` é sempre um inteiro interno controlado
(7/15/30/60), nunca entrada bruta do usuário. Descoberto pelos próprios
testes de `getDomainCounts`/filtros antes de qualquer execução real.

`domain-timeline-repository.ts`: `listDomainTimeline`, mesma janela fixa de
20, mesma ordenação (`occurred_at DESC, id DESC`), mesmo contrato de não usar
`payload` como autoridade.

## 30. Service

`src/server/services/domain-service.ts` centraliza sessão, autorização,
validação, cliente, projeto (`ensureProject`), responsável (`ensureOwner`),
transições de status, mascaramento de Projeto, diff, version, transações,
eventos e auditoria — seguindo o padrão de `ticket-service.ts` **já com a
correção do hotfix embutida** (`requireProjectAccess`, `scopeFilters`,
allowlist explícita de PATCH em vez de spread).

## 31. Semântica de PATCH

Confirmada explicitamente para os quatro campos citados no pedido: `status`
ausente preserva o status atual (com transição validada só quando presente);
`projectId` ausente preserva o vínculo (presente exige `project:read`);
`ownerUserId` ausente preserva o responsável; `notes` ausente preserva as
observações. Payload `{}` (nenhum campo) nunca altera nada — testado
explicitamente (`version` nem avança).

## 32. Version

`version integer NOT NULL default 1`; trigger exige avanço exato de +1 nas
UPDATEs e valor inicial exatamente 1 nos INSERTs — mesmo contrato de
Clientes/Projetos/Suporte.

## 33. No-op

Edição sem mudança real não gera `UPDATE`, evento ou auditoria, e não avança
`version` — testado. Versão desatualizada **sempre** é conflito, mesmo
quando o conteúdo enviado seria um no-op — testado explicitamente.

## 34. Eventos

Kinds implementados: `domain.created`, `domain.updated` (registrador/data de
registro/observações agrupados — rótulo apenas, nunca conteúdo),
`domain.status_changed`, `domain.project_changed` (payload só com UUIDs,
nunca nome), `domain.expiration_changed`, `domain.auto_renew_changed`,
`domain.owner_changed`. Sem eventos temporais ("faltam 30 dias") — a situação
de vencimento é sempre derivada na leitura (§21).

## 35. Audit

`audit.log` existente, sem tabela nova: `domain.create`/`domain.update`,
`before`/`after` por allowlist (`serializeDomain`, nunca linha crua),
**nunca o texto de `notes`** — só `notesPresent`.

## 36. Transações

CREATE: domínio + evento + auditoria na mesma `db.transaction()`. UPDATE:
lock de linha (`FOR UPDATE`) + leitura consistente + `UPDATE` condicionado a
`org_id+id+version` + eventos + auditoria, tudo na mesma transação. Falha de
qualquer `INSERT` de evento/auditoria reverte tudo — testado com trigger de
falha injetada em `activity_events` e em `audit.log`, separadamente, para
CREATE e UPDATE.

## 37. RLS

`domains_select`: org da sessão + `domain:read` + `client:read` + membership
ativa/scope `org` + Cliente pai visível — **sem** exigir `project:read`
(mesmo desenho de `support_tickets_select`). Testado: usuário com
`domain:read`+`client:read` sem `project:read` continua vendo o domínio.
Matriz completa (13 casos: sem grants, só escrita, sem `client:read`, leitura,
escrita, `assigned`, `super_admin`, `super_admin assigned`, perfil inativo,
membership inativa, cross-org) — todos passando.

## 38. Grants

`REVOKE ALL` de PUBLIC/anon/authenticated/service_role; `SELECT` para
`authenticated`; `SELECT/INSERT/UPDATE` para `service_role` (**sem DELETE** —
nunca há exclusão, `inactive` preserva histórico). Testado: `authenticated` e
`anon` não escrevem em `domains`/`activity_events`/`audit.log` (`42501`);
`service_role` sem `DELETE` em `domains` (`42501`).

## 39. `activity_events` policy

Quarto ramo (`entity_type='domain'`) adicionado à **mesma** policy
`activity_select`, por substituição única (não `OR` adicional) — mesma
disciplina das três trocas anteriores. Testado com os quatro tipos
coexistindo: evento de domínio só visível com `domain:read`+`client:read`;
eventos de Cliente/Projeto/Suporte/outros tipos continuam exatamente como
antes (regressão coberta nos testes de fundação de Suporte, reexecutados sem
alteração); chamado forjado com `org_id` de outra org nunca aparece; evento
órfão nunca aparece; só uma policy `activity_select` existe no banco.

## 40. Timeline consolidada do Cliente — 4 fontes

`client-timeline-repository.ts::listClientTimeline` ganhou um **quarto
parâmetro** (`includeDomainEvents`) e uma **refatoração** (a auditoria de
Domínios, Checkpoint A §42, já havia identificado que a cadeia de ternários
anterior levaria a 8 combinações com uma quarta fonte): as fontes agora são
montadas numa lista dinâmica e unidas com `unionAll(...sources)` — escala
para uma futura quinta fonte sem crescer combinatoriamente. `client-service.ts`
ganhou `canReadDomains` (mesmo raciocínio de `canReadProjects`/`canReadTickets`,
via `can()`, sem consulta extra) e passa a chamá-lo em
`listClientTimeline`/`getClientWorkspace`. Nova coluna `domainName` na
entrada da timeline, preenchida só na fonte de Domínios. Os 23 testes já
existentes de timeline de Clientes/Suporte (`client-timeline.test.tsx`,
`client-support-timeline.test.ts`) foram reexecutados **sem alteração de
comportamento** — só um campo `domainName: null` a mais no helper de teste —
confirmando que a refatoração não regrediu nenhuma combinação anterior.
12 testes novos em `client-domain-timeline.test.ts`, incluindo o teste K com
**as quatro fontes juntas** (Cliente+Projeto+Suporte+Domínio no mesmo
stream, cada uma só com seu próprio identificador preenchido) e o teste M
(quatro combinações independentes de permissão).

**Fora desta etapa (adiado, conforme Checkpoint A §43/§37 do pedido):** aba
Domínios real na Ficha do Cliente (a UI continua sem existir); timeline do
Projeto incluindo Domínios; integração com a Ficha do Projeto.

## 41. KPIs (suporte no repository)

`getDomainCounts` numa única query agregada: `active`
(`status='active'`), `expiring30`/`expiring7` (janela cumulativa,
excluindo `inactive`), `expired` (`< hoje`, excluindo `inactive`) — decisão
D31 aplicada consistentemente. Sem UI para exibir ainda.

## 42. Filtros/busca (suporte no repository)

`clientId`, `projectId` (gated), `status`, `autoRenewStatus`, `ownerUserId`
(+"sem responsável"), `expirationWindow` (cumulativo), `expired`, busca
(`domain_name`/Cliente/registrador, +Projeto só com `project:read`), `sort`
(`expiration` default/`created`/`updated`/`domainName`), `page`. Mesmos
predicados em listagem e contagem (`conditions()` único). Sem UI para expor
ainda.

## 43. Índices

9 em `domains`: PK, `UNIQUE(org_id,id)`, único parcial de nome ativo,
`(org_id,client_id,created_at,id)`, `(org_id,project_id)` parcial,
`(org_id,status)`, `(org_id,expiration_date,id)`, `(org_id,owner_user_id)`
parcial, `(org_id,created_at,id)`, `(org_id,updated_at,id)` — todos ligados a
uma query real do repository (nenhum especulativo), confirmados byte a byte
pela reconciliação de schema.

## 44. Migration `0006`

`src/server/db/migrations/0006_domains.sql`: gerada por
`npm run db:generate` (diff local contra o schema Drizzle, sem tocar o banco)
e complementada manualmente com `atlaz.validate_domain_write()` (identidade
imutável + versão + validação do responsável, mesma estrutura de
`validate_ticket_write`), triggers, RLS/grants de `domains` e a substituição
controlada de `activity_select` com o quarto ramo — mesma ordem estrutural da
0004/0005. **Nenhuma migration antiga foi editada.** **Nenhuma alteração em
`projects`** (a FK tripla reaproveita a UNIQUE já existente desde a 0005).

## 45. Testes novos

| Arquivo | Testes |
|---|---|
| `tests/unit/domain-validation.test.ts` | 45 |
| `tests/unit/domain-format.test.ts` | 21 |
| `tests/integration/domain-foundation.test.ts` | 53 |
| `tests/integration/domain-service.test.ts` | 41 |
| `tests/integration/domain-migration.test.ts` | 1 |
| `tests/integration/domain-project-access.test.ts` | 13 |
| `tests/integration/client-domain-timeline.test.ts` | 12 |
| **Total novo** | **186** |

Mais ajustes em 3 arquivos existentes (sem net-new): `tests/helpers/projects.ts`
(catálogo ganhou `domain:read`/`domain:write`, sem mudar grants padrão de
`ownerA`/`ownerB`); `tests/unit/client-timeline.test.tsx` (campo `domainName`
no helper); `tests/integration/schema-reconciliation.test.ts` (encadeia 0006).

## 46. Total de testes

`npm run test`: **708 aprovados, 2 pulados** (era 522 aprovados + 2 pulados
antes desta etapa — incremento exato de 186, todos os testes novos listados
acima, zero regressão).

## 47. Foundation

`npm run test:foundation`: **512 aprovados** (era 359 — incremento de 153:
domain-validation 45 + domain-foundation 53 + domain-service 41 +
domain-migration 1 + domain-project-access 13; `domain-format.test.ts` e
`client-domain-timeline.test.ts` seguem fora da lista de fundação, mesmo
padrão já usado para os testes de UI/timeline consolidada de Suporte).

## 48. lint

`npm run lint`: **0 erros, 0 avisos** (1 aviso de variável não usada
encontrado e corrigido durante a etapa, antes deste relatório).

## 49. typecheck

`npm run typecheck`: limpo.

## 50. build

`npm run build` (após `rm -rf .next`): **concluído com sucesso**. 22 páginas
geradas — **nenhuma rota nova** (`/dominios` não existe ainda, conforme
pedido), nenhuma rota existente quebrada.

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

(Todo o restante — schema/migration/lib/repository/service/testes de
Domínios — é arquivo novo, listado no `git status` do §3, não neste diff de
arquivos já rastreados.)

## 52. `git status`

Ver §3. Sem staging, sem commit. `docs/dominios-checkpoint-a.md` permanece
`untracked`, como já estava desde o hotfix de Suporte — não foi alterado nem
apagado.

## 53. Confirmação: `0006` NÃO aplicada ao Supabase real

Confirmado — toda a validação (foundation, service, migration, reconciliação)
rodou exclusivamente contra PGlite efêmero (em memória). A única consulta ao
Supabase real nesta etapa foi o preflight somente leitura do §4, sem DDL/DML.
Nenhum script de aplicação (`db:migrate`) foi executado.

## 54. Riscos/pendências para C1

1. **Grants `domain:*` hoje não exercitam o caminho de mascaramento**
   (§5) — nenhum papel tem `domain:read` sem `project:read`. Isso é uma
   observação, não um risco de código: o módulo já nasce correto para quando
   isso mudar.
2. **UI/navegação/aba do Cliente continuam pendentes** (Checkpoint C de
   Domínios) — nenhuma rota `/dominios` existe; a Ficha do Cliente continua
   com o placeholder honesto da aba Domínios.
3. **Timeline do Projeto incluindo Domínios e aba de Domínios na Ficha do
   Projeto** continuam adiadas para a integração final (Checkpoint A §37/§43,
   reconfirmado).
4. **KPIs/buckets de vencimento sem UI** — o repository já suporta tudo,
   falta a camada visual.
5. Nenhuma vulnerabilidade nova encontrada — o único bug real desta etapa foi
   técnico (`date + integer` ambíguo no SQL gerado, §29), pego pelos próprios
   testes antes de qualquer aplicação real, corrigido, sem afetar nenhum
   outro módulo.

## 55. Recomendação para Checkpoint C1

Fundação completa, testada e verde (lint, typecheck, test, test:foundation e
build). Nenhuma decisão do Checkpoint A foi revista. O módulo nasce **já
imune** à classe de falha corrigida no hotfix de Suporte — os 13 testes de
`domain-project-access.test.ts` passaram de primeira, sem nenhum bug
equivalente a corrigir depois. `0006_domains.sql` está pronta, revisada e
**não aplicada** ao Supabase real — só em PGlite efêmero.

Antes de avançar ao Checkpoint C1 (aplicação real): revisão humana explícita
deste relatório e do SQL de `0006_domains.sql`; reconfirmar preflight/hashes
imediatamente antes de aplicar (mesmo protocolo de Projetos/Suporte).

Parando aqui, aguardando aprovação. Sem UI, sem migration aplicada, sem
commit/push/deploy.
