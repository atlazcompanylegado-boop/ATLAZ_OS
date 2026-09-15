# Fase 1 — Clientes / Ficha Mestre — Checkpoint 2

## 1. Estado inicial encontrado

Checkpoint 1 (Etapas A–D) aprovado e intacto: sessão/autorização (`getCurrentSession`,
`authorizeClientSession`), migrations `0002_clients`/`0003_client_event_security`
aplicadas ao Supabase configurado, schema Drizzle reconciliado, brecha de
auto-reativação de `is_active` corrigida, 81 testes (6 arquivos) passando. `/clientes`
ainda era `ModulePlaceholder`; não havia repository, service, formulário, Server
Actions nem produtores de timeline/auditoria. Nenhum dado de negócio no Supabase.

Este checkpoint assumiu esse estado sem reabrir nenhuma decisão do Checkpoint 1 —
nenhuma migration, policy, trigger ou helper de autorização foi alterado.

## 2. Arquitetura final usada

Mesmo padrão de `docs/arquitetura.md` §3, já usado por Equipe (`team-service.ts` /
`team-repository.ts`):

```
Server Component / Server Action (src/app/(app)/clientes/**)
  → client-service.ts        (sessão, autorização, validação, transação, eventos)
    → client-repository.ts / client-contact-repository.ts / client-timeline-repository.ts
      → Drizzle (BYPASSRLS) → Postgres
```

`ServiceError` (`src/server/services/service-error.ts`) é o único tipo de erro que
cruza a fronteira service → UI. Validação/normalização vivem em `src/lib/validation/`
(reutilizáveis, sem `"server-only"`, testadas isoladamente).

## 3. Arquivos criados

**Validação/normalização**
- [normalize.ts](src/lib/validation/normalize.ts) — trim, dígitos, e-mail, telefone, site, paginação, UUID.
- [document.ts](src/lib/validation/document.ts) — CPF/CNPJ (ver §7–8).
- [client.ts](src/lib/validation/client.ts) — schemas Zod + normalização de Cliente, Contato e filtros.
- [activity.ts](src/lib/clients/activity.ts) — vocabulário `kind` ↔ rótulo em português da timeline.

**Domínio / dados**
- [types.ts](src/server/db/types.ts) — `Database`/`Transaction`/`DbClient` compartilhados.
- [service-error.ts](src/server/services/service-error.ts) — `ServiceError` (7 códigos, ver §21).
- [client-repository.ts](src/server/repositories/client-repository.ts) — clientes, KPIs, responsáveis.
- [client-contact-repository.ts](src/server/repositories/client-contact-repository.ts) — contatos + principal.
- [client-timeline-repository.ts](src/server/repositories/client-timeline-repository.ts) — timeline paginada.
- [client-events.ts](src/server/services/client-events.ts) — grava `activity_events`/`audit.log` na transação.
- [client-service.ts](src/server/services/client-service.ts) — orquestra tudo acima.

**UI**
- [page-header.tsx](src/components/layout/page-header.tsx) — cabeçalho de módulo reutilizável (não existia).
- `src/components/clients/`: `status-badge.tsx`, `client-filters.tsx`, `pagination.tsx`,
  `client-form.tsx`, `contact-form.tsx`, `contact-manager.tsx`, `client-timeline.tsx`.
- `src/app/(app)/clientes/`: `actions.ts`, `loading.tsx`, `error.tsx`, `novo/page.tsx`,
  `[id]/page.tsx`, `[id]/not-found.tsx`, `[id]/editar/page.tsx`.

**Testes**
- [client-validation.test.ts](tests/unit/client-validation.test.ts) — 33 casos, puro (sem banco).
- [client-service.test.ts](tests/integration/client-service.test.ts) — 34 casos, Postgres em memória.

## 4. Arquivos modificados

- [clientes/page.tsx](src/app/(app)/clientes/page.tsx) — placeholder → listagem real.
- [textarea.tsx](src/components/ui/textarea.tsx) — adicionada prop `error` (mesmo padrão do `Input`;
  necessária para o Textarea de Observações refletir erro de validação). Nenhuma outra
  peça do design system, do login, do shell ou de outro módulo foi tocada.

Nenhuma migration (`0000`–`0003`), papel, permissão ou navegação foi alterada — `/clientes`
continua com `status: "planned"` em `config/navigation.ts`, como pedido (ativação final é
Checkpoint 3).

## 5. Rotas criadas

| Rota | Tipo | Conteúdo |
|---|---|---|
| `/clientes` | Server Component | Listagem, KPIs, filtros, paginação |
| `/clientes/novo` | Server Component | Cadastro |
| `/clientes/[id]` | Server Component | Ficha Mestre (abas) |
| `/clientes/[id]/editar` | Server Component | Edição |

Todas dinâmicas (`ƒ`) na build de produção — confirmado em `npm run build` (§34).

## 6–10. Validation, normalization, CPF, CNPJ, isolamento por org

**Normalização** (`normalize.ts`) é pura e separada da **validação** (`document.ts`,
`client.ts`): trim/`""→null`, dígitos, e-mail minúsculo, telefone só dígitos, site com
`https://` prefixado quando ausente (preserva `http://` explícito), paginação com
fallback seguro.

**CPF**: normalizado para 11 dígitos e validado com o algoritmo padrão de dígitos
verificadores (pesos 10..2 / 11..2, exceção de dígitos repetidos). CPF inválido nunca
chega ao banco.

**CNPJ**:
- **Numérico tradicional** (14 dígitos): dígitos verificadores recalculados e
  conferidos (pesos 5..2/9..2 e 6..2/9..2) — mesmo nível de rigor do CPF.
- **Alfanumérico** (novo formato da Receita Federal, 2026): **deliberadamente não
  reimplementei o cálculo de dígito verificador** — um checksum nesse formato exigiria
  uma especificação auditável que eu não tinha como confirmar com segurança, e um
  algoritmo inventado poderia aceitar/rejeitar documentos reais incorretamente. Em vez
  disso, a validação aplicada é **estrutural**: 14 posições, 12 primeiras
  alfanuméricas maiúsculas, 2 últimas numéricas — exatamente a mesma garantia que o
  CHECK `clients_document_check` do banco já impõe. Isso está documentado em
  comentário no topo de `document.ts` e replica a decisão já aprovada no Checkpoint 1
  de aceitar esse formato sem bloquear inscrições novas. `checkDigitsVerified: false`
  no retorno de `validateDocument()` sinaliza esse nível reduzido de verificação para
  quem quiser usá-lo no futuro (não usado na UI atual).

**Isolamento por org**: todo método de `client-repository.ts`/`client-contact-repository.ts`
recebe `orgId` explícito e filtra por ele em toda query (nunca um `getById(id)` sem
organização). `client-service.ts` nunca aceita `orgId`/`actorId`/`createdBy`/
permissões do formulário — só de `getCurrentSession()` + `authorizeClientSession()`.

## 11. Como o service aplica autorização

Toda função pública de `client-service.ts` chama `requireAccess("read"|"write")`, que
chama `getCurrentSession()` + `authorizeClientSession()` (ambos do Checkpoint 1, sem
alteração) e lança `ServiceError("forbidden", ...)` se scope/permissão faltarem. O
contexto retornado (`{ orgId, userId, membershipId, actorLabel }`) é a única fonte de
organização/ator usada pelo resto da função.

## 12. Transações

Cadastro: `client` (+ `contato principal` opcional) + `activity_events` + `audit.log`
em uma única `db.transaction()`. Edição: mesma lógica, com o `UPDATE` condicionado a
`org_id + id + version`. Operações de contato: mutação do contato + avanço de
`clients.version` (`bumpClientVersion`) + evento + auditoria, também em uma
transação. Se qualquer `INSERT` de evento/auditoria falhar, a exceção sobe e o
`db.transaction()` reverte tudo — testado explicitamente em
`client-service.test.ts` ("conflito de versão não sobrescreve e não deixa
evento/auditoria órfãos") e já validado no nível de SQL puro pelo Checkpoint 1
(`client-foundation.test.ts`).

## 13. Produção de `activity_events`

`client-events.ts::recordClientEvent()` grava `entity_type='client'`,
`entity_id=<clientId>` (inclusive para eventos de contato, conforme contrato de RLS
do Checkpoint 1) e `actor_user_id` da sessão. Produtores reais implementados em
`client-service.ts`, com diffing para não duplicar eventos:

- `client.created` — sempre no cadastro.
- `client.updated` — só se algum campo fora de status/responsável mudou.
- `client.status_changed` — só se `status` mudou.
- `client.owner_changed` — só se `owner_user_id` mudou.
- `client.contact_added` / `contact_updated` / `contact_removed`.
- `client.primary_contact_changed` — troca explícita de principal (via
  "Definir como principal" ou via edição do contato).

Se nada mudou em uma edição, **nenhum evento é gravado** (idempotente — testado).

## 14. Auditoria (`audit.log`)

`client-events.ts::recordClientAudit()` grava `actor_user_id`/`actor_label` da
sessão, `action` (`client.create`, `client.update`, `client.contact.create`, etc.),
`before`/`after` como objetos de negócio serializados manualmente (nunca a linha
crua do banco, nunca token/sessão/segredo). Mesma transação da mutação.

## 15–18. Listagem, busca, filtros, paginação

`listClients()` monta um único `WHERE` (org + status + responsável + busca) aplicado
tanto à query paginada quanto à contagem — filtragem 100% no banco, sem carregar tudo
em memória. Busca (`ilike`) cobre `name`, `trade_name`, `legal_name`, `document`.
Filtros (`q`, `status`, `responsavel`, `sort`, `page`) ficam na URL
(`ClientFilters`, client component) e qualquer mudança reseta `page=1`. Paginação é
por página simples (`Pagination`), 25/página (`CLIENT_PAGE_SIZE`), sem infinite
scroll. KPIs (`getClientKpis`) usam uma única query agregada com `count(*) filter
(where ...)` — não quatro `SELECT COUNT` separados.

## 19. Cadastro

`/clientes/novo` usa `ClientForm` (`mode="create"`) com Server Action
`createClientAction` (`useActionState`). Seções: Dados principais, Contato principal
(opcional — só criado se o nome do contato for preenchido), Gestão, Outras
informações. Responsável e tipo de pessoa usam `<Select>` do design system, com
`input[hidden]` traduzindo o sentinel "sem seleção" para vazio antes de chegar no
schema (evita falso-positivo de validação). Sucesso → `redirect` para a Ficha Mestre;
erro de validação/duplicidade/responsável inválido aparece por campo e/ou em `Alert`.

## 20. Ficha Mestre

`/clientes/[id]`: cabeçalho (nome, status, responsável, botão Editar só com
`client:write`), cartão de resumo (contato principal, documento formatado,
responsável, site, última atualização) e `Tabs` com **Visão Geral**, **Contatos**,
**Timeline** funcionais e **Projetos/Suporte/Domínios/Infraestrutura** como
`EmptyState` honesto (texto fixo pedido no prompt, sem número inventado).

## 21. CRUD de Contatos

`ContactManager` (client component) lista contatos em cards, com Drawer
(`ContactForm`, reaproveitado para criar/editar) e Modal de confirmação para remover.
Toda mutação passa por Server Actions (`createContactAction`, `updateContactAction`,
`deleteContactAction`, `setPrimaryContactAction`) que chamam o service e devolvem
`{ok:true} | {ok:false,...}` — sem `useActionState`/FormData aqui porque o Drawer
mantém estado próprio; após sucesso, `router.refresh()` relê o Server Component pai.

## 22. Contato principal

Contrato do Checkpoint 1 preservado: no máximo um principal (índice único parcial),
cliente pode ficar sem principal, e **nada é promovido automaticamente** ao remover o
principal — troca é sempre uma ação explícita (editar o contato marcando "principal"
ou usar "Definir como principal" no menu). Um bug real de troca de principal (a
função `unsetPrimaryContact` estava desmarcando o contato errado — o alvo em vez dos
demais) foi pego pelos testes de integração e corrigido antes deste relatório (ver
`src/server/repositories/client-contact-repository.ts`).

## 23. Timeline

`ClientTimeline` (Server Component) traduz `kind` → título em português via
`translateClientEventKind()` — nunca mostra `client.status_changed`, JSON ou UUID.
Cada item mostra título, `summary` (detalhe, ex.: "Onboarding → Ativo"), nome do ator
(via join com `users`, fallback "Sistema") e data/hora (`Intl.DateTimeFormat`
pt-BR). Paginação cumulativa de 20 em 20 via link "Carregar mais"
(`?tab=timeline&timelinePage=N`) — sem histórico ilimitado nem infinite scroll.

## 24. Edição e versão/conflito

`/clientes/[id]/editar` reusa `ClientForm` (`mode="edit"`), com `clientId` e
`version` atuais como campos ocultos. `updateClient()` faz diff campo a campo antes
de gravar (evento certo, sem "updated" vazio) e o `UPDATE` é condicionado a
`org_id + id + version`; se zero linhas forem afetadas (outra edição venceu a
corrida), o service lança `ServiceError("conflict", ...)` com a mensagem pedida no
prompt. `ClientForm` mostra essa mensagem num `Alert` de aviso com botão "Recarregar
dados" (em vez do texto genérico de erro) — nunca sobrescreve silenciosamente.

## 25. 404 / forbidden

- ID inexistente, malformado ou de outra organização → `getClientDetail()` lança
  sempre o mesmo `ServiceError("not_found", "Cliente não encontrado.")` (nunca revela
  qual dos três casos ocorreu); a página chama `notFound()` do Next, que renderiza
  `clientes/[id]/not-found.tsx` (visual consistente com o design system).
- Falta de `client:read`/`client:write`/scope `org` → tratado **antes** de chamar o
  service, nas próprias páginas (`authorizeClientSession`), com um `Alert` "Sem
  acesso" — mesmo padrão já usado em Equipe/Dashboard.

## 26. Loading / error / empty

`clientes/loading.tsx` espelha a estrutura real (Skeletons) para evitar layout
shift. `clientes/error.tsx` é um error boundary que nunca expõe mensagem/stack do
servidor. `EmptyState` cobre: nenhum cliente cadastrado (com CTA condicionado a
`client:write`), nenhum resultado de filtro, nenhum contato, nenhuma atividade e cada
aba de módulo futuro.

## 27. Responsividade

Listagem: tabela (`hidden lg:block`) vs. cards (`lg:hidden`) — nunca tabela
espremida em 375px. Formulários usam grid `sm:grid-cols-2` que colapsa para 1 coluna
no mobile. Filtros e KPIs quebram em `sm`/`lg`. Drawer de contato ocupa a largura
total em telas estreitas (`max-w-md` do componente já existente). Não testei
visualmente em navegador real neste checkpoint (ver §33 — pendências); a estrutura
Tailwind segue o mesmo padrão responsivo já usado nas páginas existentes.

## 28. Acessibilidade

Labels associados a inputs (`htmlFor`/`id`) em todos os campos; erros de campo em
`<p>` visível logo abaixo do input; `aria-invalid`/`error` refletido em
Input/Textarea; botões só-ícone com `aria-label` (ex.: menu de ações do contato);
Select/Tabs/Modal/Drawer usam Radix (mesmo padrão acessível já adotado no resto do
projeto); confirmação de remoção via `Modal` com foco gerenciado pelo Radix Dialog.
Não houve teste manual com leitor de tela neste checkpoint.

## 29. Testes adicionados

- `tests/unit/client-validation.test.ts` — 33 casos: normalização, CPF válido/inválido,
  CNPJ numérico válido/inválido, CNPJ alfanumérico válido/malformado, formatação para
  exibição, `parseClientInput` (mínimo válido, nome vazio, status inválido, documento
  sem tipo de pessoa, CPF/CNPJ normalizados, site sem esquema, responsável não-UUID),
  `parseClientContactInput` (mínimo válido, nome vazio, e-mail/telefone/whatsapp
  inválidos, `isPrimary` truthy), `parseClientFilters`/`parseVersion`.
- `tests/integration/client-service.test.ts` — 34 casos sobre Postgres em memória
  (mesma fixture/migrations do Checkpoint 1): listagem por org, busca, filtro de
  status/responsável, ordenação, KPIs agregados, responsáveis disponíveis; cadastro
  (evento+auditoria, contato principal na criação, nome vazio, sem `client:write`,
  documento duplicado — mesma org e org diferente, responsável inválido, CNPJ
  alfanumérico); edição (evento único, status_changed, owner_changed, no-op
  idempotente, conflito de versão sem sobra de evento/auditoria, cross-org como
  not_found, duplicidade de documento excluindo o próprio); detalhe (not_found para
  ID inexistente e para outra org, nome do responsável); contatos (avança versão do
  pai, único principal, troca de principal com evento, "definir como principal" sem
  promoção automática ao remover, remoção gera evento, cross-org como not_found);
  timeline (só do cliente certo, mais recente primeiro, nome do ator).

## 30. Quantidade total de testes

**148 testes, 8 arquivos** (81 do Checkpoint 1 + 33 + 34 novos), todos aprovados.

## 31–33. Lint / typecheck / build

- `npm run lint`: **aprovado**, 0 erros/avisos.
- `npm run typecheck` (`tsc --noEmit`): **aprovado**.
- `npm run build` (Next 16 / Turbopack): **aprovado** — todas as rotas de Clientes
  compilaram como dinâmicas (`ƒ`); nenhuma quebra de App Router. Build completo não é
  obrigatório neste checkpoint, mas rodei para detectar erro de rota cedo (permitido
  pelo prompt); o build "oficial" de fechamento fica para o Checkpoint 3.

## 34. Pendências para o Checkpoint 3

- KPI de Clientes no Dashboard principal (ainda "—" com trend "Aguarda módulo").
- Ativação final de `/clientes` na navegação (`status: "planned"` mantido).
- Teste manual real no Supabase com usuário autenticado sem membership.
- QA visual em navegador real nos 5 breakpoints pedidos (1440/1280/1024/768/375) e
  teste de acessibilidade com teclado/leitor de tela — só validado por inspeção do
  código/Tailwind neste checkpoint.
- Commit, push, PR, deploy (nenhum feito, conforme instrução).
- Dígito verificador de CNPJ alfanumérico permanece só estrutural (ver §6–10) —
  decisão deliberada, não uma pendência técnica esquecida, mas registrada para
  eventual revisão futura se a Receita Federal publicar o algoritmo oficial.

## 35. `git diff --stat`

```
 README.md                                   |   7 +-
 docs/arquitetura.md                         |   2 +-
 docs/banco.md                               |  24 ++--
 docs/roadmap.md                             |  23 ++--
 docs/seguranca.md                           |  25 ++--
 drizzle.config.ts                           |   2 +-
 package-lock.json                           |   8 ++
 package.json                                |   6 +-
 src/app/(app)/clientes/page.tsx             | 178 ++++++++++++++++++++++++++--
 src/components/ui/textarea.tsx              |   9 +-
 src/lib/auth/session.ts                     |  33 ++++--
 src/server/db/migrations/meta/_journal.json |  16 ++-
 src/server/db/schema/activity-events.ts     |  17 +--
 src/server/db/schema/audit-log.ts           |  18 +--
 src/server/db/schema/auth-users.ts          |   5 +-
 src/server/db/schema/index.ts               |   4 +-
 src/server/db/schema/memberships.ts         |  27 +++--
 src/server/db/schema/orgs.ts                |   4 +-
 src/server/db/schema/permissions.ts         |   2 +-
 src/server/db/schema/role-permissions.ts    |  18 +--
 src/server/db/schema/roles.ts               |  13 +-
 src/server/db/schema/users.ts               |  13 +-
 22 files changed, 348 insertions(+), 106 deletions(-)
```

(`git diff --stat` só mostra arquivos já rastreados — a maior parte do trabalho deste
checkpoint é arquivo novo, listado em `git status` abaixo.)

## 36. `git status`

```
 M README.md
 M docs/arquitetura.md
 M docs/banco.md
 M docs/roadmap.md
 M docs/seguranca.md
 M drizzle.config.ts
 M package-lock.json
 M package.json
 M src/app/(app)/clientes/page.tsx
 M src/components/ui/textarea.tsx
 M src/lib/auth/session.ts
 M src/server/db/migrations/meta/_journal.json
 M src/server/db/schema/activity-events.ts
 M src/server/db/schema/audit-log.ts
 M src/server/db/schema/auth-users.ts
 M src/server/db/schema/index.ts
 M src/server/db/schema/memberships.ts
 M src/server/db/schema/orgs.ts
 M src/server/db/schema/permissions.ts
 M src/server/db/schema/role-permissions.ts
 M src/server/db/schema/roles.ts
 M src/server/db/schema/users.ts
?? docs/clientes-checkpoint-1.md
?? docs/clientes-checkpoint-2.md
?? docs/clientes-reconciliacao.md
?? src/app/(app)/clientes/[id]/
?? src/app/(app)/clientes/actions.ts
?? src/app/(app)/clientes/error.tsx
?? src/app/(app)/clientes/loading.tsx
?? src/app/(app)/clientes/novo/
?? src/components/clients/
?? src/components/layout/page-header.tsx
?? src/lib/auth/client-access.ts
?? src/lib/clients/
?? src/lib/validation/
?? src/server/db/migrations/0002_clients.sql
?? src/server/db/migrations/0003_client_event_security.sql
?? src/server/db/migrations/meta/0002_snapshot.json
?? src/server/db/migrations/meta/0003_snapshot.json
?? src/server/db/schema/client-contacts.ts
?? src/server/db/schema/clients.ts
?? src/server/db/types.ts
?? src/server/repositories/client-contact-repository.ts
?? src/server/repositories/client-repository.ts
?? src/server/repositories/client-timeline-repository.ts
?? src/server/services/client-events.ts
?? src/server/services/client-service.ts
?? src/server/services/service-error.ts
?? tests/fixtures/
?? tests/helpers/
?? tests/integration/
?? tests/unit/client-validation.test.ts
?? tests/unit/session.test.ts
```

Sem commit, push, PR ou deploy — conforme instrução.

## 37. Parar no Checkpoint 2

Etapas E–I concluídas e testadas. Aguardando aprovação antes de avançar para J–M.
