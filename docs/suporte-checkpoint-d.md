# Suporte — Checkpoint D: QA final + regressão + acessibilidade + pré-publicação

Data: 16/09/2026. Escopo autorizado: revisão final, QA técnico/visual (quando
possível), responsividade, acessibilidade, segurança, regressão, performance,
testes, documentação. **Arquitetura e regras de negócio de Suporte
(schema/migration 0005, authorization, RLS, grants, `ticket_number`,
comentários imutáveis, project masking, status, prioridade, version, timeline,
FK tripla, integração com Cliente) não foram reabertas. Sem commit/push/PR/
deploy.**

## 1. Estado inicial

`git status`/`git diff --stat` no início desta etapa eram **idênticos** ao fim
do Checkpoint C2.1: mesmos 18 arquivos rastreados modificados e os mesmos
arquivos novos untracked de fundação/UI de Suporte, mais
`docs/suporte-checkpoint-c2-1.md`, `src/components/clients/client-timeline.tsx`
e `tests/unit/client-timeline.test.tsx`. Releitura confirmada dos Checkpoints
A, B, C1, C2, C2.1 de Suporte e dos checkpoints finais de Clientes
([Checkpoint 3](clientes-checkpoint-3.md)) e Projetos
([Checkpoint D](projetos-checkpoint-d.md)) antes de qualquer ação, para usar o
mesmo padrão de rigor/relatório já estabelecido. Estado técnico reexecutado
(não presumido) — ver §44–48.

## 2. Arquivos alterados no D

- [`src/components/support/client-tickets-tab.tsx`](../src/components/support/client-tickets-tab.tsx):
  1 linha — a coluna "Atualizado em" da aba Suporte da Ficha Mestre do Cliente
  usava um `Intl.DateTimeFormat` inline sem `dateStyle`/`timeStyle`
  (mostrava só a data, sem hora), diferente de `formatTicketDateTime` (usado
  em toda outra tela de Suporte, com data **e** hora). Corrigido para
  reutilizar `formatTicketDateTime` — bug isolado e de baixo risco, mesma
  categoria dos dois bugs de UI corrigidos no Checkpoint D de Projetos.
- [`tests/unit/ticket-interactions.test.tsx`](../tests/unit/ticket-interactions.test.tsx)
  (novo): 2 testes — conteúdo malicioso de comentário nunca vira HTML
  executável (pedido explícito §25) e o composer de comentário só aparece com
  `canComment` (§26).
- Este relatório.

Nenhuma migration, RLS, policy, grant, schema, authorization, service ou regra
de negócio foi alterada. Nenhum arquivo de Clientes ou Projetos fora do já
modificado desde C2.1 (`client-timeline.tsx`) foi tocado.

## 3. Navegação

Revalidado em [`src/config/navigation.ts`](../src/config/navigation.ts):
Clientes `available` (`client:read`); Projetos `available`
(`["project:read","client:read"]`); Suporte `available`
(`["ticket:read","client:read"]`) — as duas exigidas juntas via `every()` em
`isNavItemVisible`. `tests/unit/navigation.test.ts` (11 testes: 6 de Projetos
+ 5 de Suporte, reexecutados) confirma: Suporte some sem nenhuma permissão,
some com só `ticket:read`, some com só `client:read`, aparece com as duas;
Clientes/Projetos/Equipe sem regressão. Domínios/Infraestrutura não são itens
de navegação (são só abas placeholder dentro da Ficha do Cliente,
`FUTURE_MODULE_COPY` — nenhuma mudança nesta etapa).

## 4. Busca global

`src/components/ui/search.tsx` usa `getVisibleFlatNavigation(permissions)`, a
mesma fonte única da sidebar — Suporte aparece automaticamente como destino
quando autorizado, sem nenhuma mudança necessária. Confirmado por leitura que
continua sendo busca de módulos/destinos, nunca de chamados individuais.

## 5. Listagem `/suporte`

Revisão completa por leitura de
[`src/app/(app)/suporte/page.tsx`](../src/app/(app)/suporte/page.tsx):
autorização antes de qualquer query; `PageHeader` com CTA "Novo chamado"
condicionado a `ticket:write`; 4 `KpiCard`s; `TicketFilters`; tabela desktop
(`hidden lg:block`) com 9 colunas (Chamado/Cliente/Projeto/Status/Prioridade/
Responsável/Prazo/Atualizado em/Ações) e cards mobile (`lg:hidden`) no mesmo
breakpoint `lg` já usado em Clientes/Projetos; `Pagination` reaproveitado;
`EmptyState` com dois textos distintos ("Nenhum chamado cadastrado" × "Nenhum
chamado encontrado", conforme há ou não filtro ativo); `loading.tsx`/
`error.tsx` dedicados (skeleton com a mesma estrutura da página real, error
boundary genérico sem stack/SQL). Confirmado ao vivo, sem sessão, que a rota
redireciona para `/login?next=%2Fsuporte` com `200 OK` e zero erro de
console/servidor (ver §37).

## 6. KPIs

Confirmado em
[`ticket-repository.ts:getTicketCounts`](../src/server/repositories/ticket-repository.ts):
`open` (rótulo "Abertos") = `status not in ('resolved','cancelled')` — **não**
`status='open'` literal; `inProgress` = `status='in_progress'`; `critical` =
`priority='critical' and status not in (...)`; `overdue` reaproveita a mesma
constante SQL `overdue` usada no filtro `?vencidos=true` e na busca —
`due_at < now() and status not in ('resolved','cancelled')`. Todos calculados
numa única query agregada (`count(*) filter (where ...)`), sem N+1. Mesma
regra usada consistentemente em `isTicketOverdue` (client-side,
`src/lib/support/format.ts`) — nenhuma divergência entre servidor e exibição.

## 7. Busca por `ticket_number`

Confirmado em `ticket-repository.ts:conditions()`: termo puramente numérico
(`/^\d+$/`, aplicado **depois** de remover um `#` inicial) soma
`eq(ticketNumber, Number(term))` às condições `OR` já existentes (título/
cliente/projeto). `1042` e `#1042` são ambos aceitos — testado nesta etapa
por leitura direta da regex e confirmado pelos testes de serviço já
existentes (`ticket-service.test.ts`). UUID nunca é aceito como busca por
número (a regex só casa dígitos puros, nunca hífen/letra hexadecimal).

## 8. Filtros

Cliente, Projeto, Status, Prioridade, Responsável (+"Sem responsável"),
Vencidos, busca e ordenação — todos implementados e sincronizados com a URL
(`TicketFilters`, `updateParams()`). Confirmado por leitura:
`params.delete("page")` roda em **toda** chamada de `updateParams`, então
qualquer mudança de filtro reseta a página automaticamente. Back/forward
funcionam por ser navegação real (`router.push`), não estado local — mesmo
contrato de Clientes/Projetos. Filtros isolados e combinados usam o mesmo
`conditions()` único, reaproveitado por `listTickets`/`countTickets`/
`getTicketCounts` (nunca predicados divergentes entre listagem e contagem).

## 9. Project filter

Confirmado em `TicketProjectSelector`: com `clientId` presente, busca
`listTicketProjects(orgId, clientId, q, page)` — sempre restrita àquele
cliente, nunca a base inteira de Projetos. Sem `clientId`, o seletor fica
`disabled` e a busca nunca dispara (`if (!clientId) return;` em `runSearch`).
Debounce de 250 ms, paginação server-side de 25 em 25 — nenhuma carga
indiscriminada em nenhum dos dois casos.

## 10. Paginação

`ticketPaginationSchema.shape.page` = `z.preprocess(normalizeTicketNumber,
z.number().int().min(1)).catch(1)`. Confirmado por leitura da cadeia de
normalização: `page=0` → `Number("0")=0` → falha `min(1)` → `.catch(1)`;
`page=-1` → não casa `/^\d+$/` (tem `-`) → permanece string → falha
`z.number()` → `.catch(1)`; `page=abc` → mesma coisa → `.catch(1)`; página
muito acima do total é sempre clampada por `ticketPage(page, total, size) =
Math.min(page, Math.max(1, Math.ceil(total/size)))` antes da query — nunca
uma página vazia incoerente. 25 chamados por página confirmado
(`TICKET_PAGE_SIZE = 25`).

## 11. Ordenação

`TICKET_SORTS = ["created","updated","ticketNumber","due","priority"]`, cada
um com `ORDER BY` explícito em `listTickets` (`desc(createdAt)` default,
`asc(ticketNumber)`, `desc(updatedAt)`, `due_at asc nulls last`, `case
priority ...`) — todos com desempate determinístico `asc(supportTickets.id)`
no final, então nunca há ordem instável entre execuções.

## 12. Criação de chamado

Fluxo confirmado em `TicketForm`/`createTicketAction`/`ticket-service.
createTicket`: Cliente (seletor, obrigatório) → Projeto (seletor, opcional,
só habilita com Cliente escolhido) → título → descrição → prioridade →
responsável (opcional) → prazo (opcional). **Sem campo de status no
formulário** — `ticketCreateSchema.status.default("open")` garante `open`
quando omitido; a UI nunca oferece escolha livre de status na criação.

## 13. Client selector

`TicketClientSelector`: busca server-side (`searchTicketClientsAction` →
`listTicketClients`), 25 por consulta, debounce 250 ms, nunca carrega todos
os clientes. `orgId` explícito em `listTicketClients` (repository). Exige
`ticket:read` (via `requireAccess` do service, chamado antes de qualquer
query). Cliente pré-selecionado por `?cliente=<id>` na URL é resolvido via
`getTicketClient` (autorizado, org explícita) **antes** de aparecer no
formulário — nunca tratado como autoridade (ver §31).

## 14. Project selector

`TicketProjectSelector`: só habilita com `clientId` (§9); paginado (25),
server-side, debounce 250 ms. `projectId` sempre revalidado no servidor por
`ensureProject()` (fundação, inalterada) tanto na criação quanto na edição —
a FK tripla no banco é a última linha de defesa, mas a aplicação já rejeita
antes de tentar o `INSERT`/`UPDATE`.

## 15. Se Cliente mudar durante criação

Confirmado em `TicketProjectSelector`: `useEffect` compara `clientId` contra
`lastClientId.current`; se mudou, limpa `selected` e chama `onChange(null)`
— o Projeto incompatível nunca fica "preso" visualmente após trocar de
Cliente no formulário de criação (na edição o Cliente é fixo, então esse
efeito nunca dispara ali).

## 16. Edição

Confirmado em `TicketForm mode="edit"`: Cliente exibido como texto somente
leitura com nota explicativa (imutável, campo nem existe no `<form>`).
Projeto, título, descrição, prioridade, responsável e prazo editáveis.
Vincular/trocar/remover Projeto funcionam pelo mesmo `TicketProjectSelector`,
sempre restrito ao Cliente do chamado (imutável) — nunca outro cliente.

## 17. Project masking

Revalidado nas três camadas (serviço, RSC/payload, UI):

1. **Serviço:** `maskProjectVisibility()` (`ticket-service.ts`, inalterado)
   zera `projectId`/`projectName` sem `project:read`, mantendo só
   `hasProject: boolean`.
2. **RSC/payload:** coberto pelos testes de integração já existentes
   (`ticket-service.test.ts`, describe "mascaramento") **e** por um teste
   novo desta linha de trabalho, adicionado no Checkpoint C2.1
   (`client-support-timeline.test.ts`, item L) que confirma, na timeline
   consolidada do Cliente, que nem `projectName` nem o UUID do projeto
   aparecem no payload/JSON serializado para quem não tem `project:read` —
   mesmo com um projeto real vinculado ao chamado. Reexecutado nesta etapa,
   verde.
3. **UI:** `/suporte` (listagem), `/suporte/[id]` (ficha, cartão de resumo e
   aba Visão Geral) e a aba Suporte da Ficha do Cliente mostram "Projeto
   vinculado" (itálico, sem nome/ID/link) quando `hasProject && !projectName`
   — confirmado por leitura direta das três telas. Nenhuma descrição ou
   metadata do Projeto aparece em nenhum lugar do HTML de Suporte.

## 18. Ficha do chamado

Revisado [`/suporte/[id]/page.tsx`](../src/app/(app)/suporte/[id]/page.tsx):
header com número+título, badges de status/prioridade, `TicketStatusActions`
e botão Editar (ambos só com `ticket:write`); cartão de resumo (Cliente com
link, Projeto mascarado, Responsável, Prazo com indicador de atraso); três
abas (Visão Geral, Interações, Timeline). Visual consistente com o design
system (Card/Tabs/Badge do ATLΛZ OS, sem componente fora do padrão).

## 19. Status actions

Matriz revalidada linha a linha em `ACTIONS_BY_STATUS`
(`status-actions.tsx`) contra a especificação exata do pedido: `open` →
triage/in_progress/cancelled; `triage` → in_progress/cancelled;
`in_progress` → waiting_client/resolved/cancelled; `waiting_client` →
in_progress/resolved/cancelled; `resolved`/`cancelled` → reopen (único). Bate
**exatamente**. A proteção contra transição inválida vive em `mutate()`
(`ticket-service.ts`, inalterado) — mesmo se a UI algum dia oferecesse uma
ação a mais por engano, o service rejeitaria (`invalid_transition`), testado
em `ticket-service.test.ts`.

## 20. Estados terminais

`resolved`/`cancelled`: `mutate()` rejeita qualquer mudança de status por
edição genérica saindo de um estado final (`if (nextStatus !== before.status
&& final(before.status)) throw invalid_transition`) — só `reopenTicket` pode
sair de um terminal. Confirmado pelos testes de fundação/serviço já
existentes, reexecutados sem alteração.

## 21. `resolved_at`

Confirmado por leitura: resolver → `resolvedAt = new Date()` no servidor;
cancelar → `resolvedAt = null` sempre (nunca finge resolução); reabrir →
`resolvedAt = null`. Coberto pelos testes de serviço já existentes
(`"resolvedAt instanceof Date"`, "cancelar mantém resolved_at nulo",
reabertura limpa `resolvedAt`) — reexecutados, verdes, sem regressão.

## 22. Version conflict

Cenário revalidado via os testes de integração existentes
(`ticket-service.test.ts`): duas leituras da mesma `version`, uma escrita
vence (`version+1`), a segunda recebe `code: "conflict"` sem sobrescrever
nada (`updateTicket` com `WHERE version = ?` afeta 0 linhas → `null` →
`conflict()`). Nenhum evento/auditoria é gravado na tentativa recusada
(a `db.transaction` inteira falha antes de qualquer `INSERT` de evento). Na
UI, `TicketForm` mostra o `Alert` com a mensagem **exata** pedida — "Este
chamado foi atualizado por outro usuário. Atualize a página antes de salvar
novamente." — com o botão "Recarregar dados" (`router.refresh()`).

## 23. No-op

Confirmado no teste existente "no-op normalizado não escreve; versão antiga
nunca passa": editar sem mudança real de nenhum campo não gera `UPDATE`,
`event` ou `audit`, e não avança `version`; uma versão desatualizada **ainda**
é rejeitada como conflito mesmo quando o conteúdo enviado seria um no-op —
mesmo contrato de Clientes/Projetos.

## 24. Comentários

Revisado `TicketInteractions`/`interactions.tsx`: listagem em ordem
**ascendente** (mais antigo primeiro — conversa, ao contrário da Timeline);
autor (`comment.authorName ?? "Sistema"`); data/hora em America/Sao_Paulo;
conteúdo com `whitespace-pre-wrap` (preserva quebras de linha, nunca
interpreta HTML — ver §25); composer com `loading`/erro tratados
(`useActionState`, mensagem de erro abaixo do campo via
`aria-describedby`); `EmptyState` quando não há comentários ainda. Sem
editar/excluir em nenhum lugar da UI (a função nem existe no service — ver
Checkpoint B/C2).

## 25. Segurança dos comentários

Confirmado em duas camadas:

1. **Conteúdo nunca sai da tabela `ticket_comments`:** `recordCommentEvent`
   grava só `{clientId, commentId}` no payload do evento (nunca `content`);
   `recordCommentAudit` grava só `{commentId, ticketId, authorUserId,
   createdAt}` em `audit.log` (nunca o texto) — confirmado pelo teste
   existente que usa uma string sensível ("Cliente ligou pedindo
   atualização.") e verifica que ela não aparece em `event.summary`,
   `event.payload` nem `audit.before`/`after`, reexecutado sem alteração.
2. **HTML nunca é interpretado:** `grep` em todo `src/` por
   `dangerouslySetInnerHTML` encontrou **uma única ocorrência**, dentro de um
   comentário de código em `interactions.tsx` explicando que ele **não** é
   usado — nenhum uso real em nenhum componente do projeto. Teste novo
   (`tests/unit/ticket-interactions.test.tsx`) renderiza um comentário com
   `content: "<script>alert(1)</script>"` e confirma que o texto literal
   aparece na tela (`screen.getByText`) **e** que nenhuma tag `<script>` real
   foi criada no DOM (`container.querySelectorAll("script")` vazio) — o
   comportamento padrão do React (`{comment.content}` em JSX escapa
   automaticamente) já garante isso; o teste só formaliza a garantia. Não
   foi criado nenhum dado persistente em produção para este teste — é
   inteiramente um teste de componente em memória (jsdom), sem banco.

## 26. Comment permission

Confirmado em `[id]/page.tsx`: `canComment={canWrite}` (`canWrite = can(...,
"ticket:write")`), passado para `TicketInteractions`. Teste novo confirma:
com `canComment={false}` o composer ("Adicionar comentário") não é
renderizado; com `canComment={true}`, aparece. Leitura de comentários nunca
depende de `ticket:write` (só de `ticket:read`, já garantido pela própria
autorização da página).

## 27. Timeline do chamado

`TicketTimeline` traduz os 8 kinds via `translateTicketEventKind`
(`src/lib/support/activity.ts`, inalterado) — nenhum `kind` cru, UUID ou
JSON aparece; `summary` humano da fundação exibido abaixo do título
traduzido. Sem alteração nesta etapa.

## 28. Timeline consolidada do Cliente

Revalidado (fundação da consolidação: Checkpoint B; tradução visual:
Checkpoint C2.1) com as quatro combinações de permissão, via os 10+1 testes
de `client-support-timeline.test.ts` (reexecutados, verdes):

| Permissões | Resultado |
|---|---|
| `client:read` + `project:read` + `ticket:read` | Cliente + Projeto + Suporte no mesmo stream (teste K) |
| `client:read` + `ticket:read` (sem `project:read`) | Cliente + Suporte |
| `client:read` + `project:read` (sem `ticket:read`) | Cliente + Projeto |
| Somente `client:read` | Só Cliente (teste A) |

## 29. Timeline — Suporte (tradução visual)

Confirmado em [`client-timeline.tsx`](../src/components/clients/client-timeline.tsx)
(Checkpoint C2.1, revalidado sem alteração nesta etapa): título
`"Chamado #N — <kind traduzido>"`, reutilizando `translateTicketEventKind`+
`formatTicketNumber`; status/prioridade já chegam traduzidos no `summary`
gravado pela fundação; `ticket.comment_added` mostra só "Comentário
adicionado"; masking preservado (`projectName` sempre `null` para eventos de
chamado, por desenho do repository — ver §17); nenhum UUID exposto — os 13
testes de `tests/unit/client-timeline.test.tsx` cobrem exatamente esses
pontos, reexecutados, verdes.

## 30. Aba Suporte da Ficha Mestre do Cliente

`ClientTicketsTab` revisada: lista `listTickets({clientId, page})` (só
chamada quando `canReadTickets` — checagem **antes** do `await`, nunca
"consultar e depois esconder"); paginação (`?suportePage=`); colunas Chamado/
Status/Prioridade/Responsável/Prazo/Atualizado em (data+hora — corrigido
nesta etapa, ver §2); link "Ver" para a ficha; CTA "Novo chamado" (condicionado
a `ticket:write`) para `/suporte/novo?cliente=<id>`. Sem `ticket:read`:
`ClientTicketsForbidden` (`Alert` genérico) — `listTickets` nunca é chamado
nesse caminho.

## 31. CTA Novo chamado (a partir da Ficha do Cliente)

Confirmado em `novo/page.tsx`: `?cliente=<id>` é resolvido via
`getTicketClient` (autorizado, org explícita) **antes** de pré-preencher o
formulário; se inválido/inacessível, a pré-seleção é silenciosamente
ignorada (página não quebra). No submit, `createTicket` (service) chama
`ensureClient` de novo — o `clientId` real do formulário é revalidado
independente do que a URL sugeriu.

## 32. Cliente com zero tickets

`ClientTicketsTab` (`rows.length === 0`) e `/suporte` (`rows.length === 0`)
mostram `EmptyState` dedicado ("Nenhum chamado cadastrado" com CTA
condicionado a `ticket:write`) — nunca uma tabela vazia quebrada.

## 33. 404 seguro

`getTicketDetail`/`getTicketWorkspace` lançam `ServiceError("not_found")`
para UUID inválido, chamado inexistente ou de outra org — sempre o mesmo
código, capturado por `notFound()` em `[id]/page.tsx` e `[id]/editar/page.tsx`,
renderizando `not-found.tsx` com texto idêntico independente da causa real
(nunca revela cross-org vs. inexistente). Confirmado ao vivo, sem sessão, que
`/suporte/00000000-0000-0000-0000-000000000000` redireciona para
`/login?next=...` antes de qualquer lógica de 404 (mesmo comportamento já
documentado nos Checkpoints D de Clientes/Projetos).

## 34. Forbidden

Todas as entradas do service (`listTickets`, `getTicketDetail`,
`getTicketWorkspace`, `createTicket`, `updateTicket`, `changeTicketStatus`,
`reopenTicket`, `createTicketComment`, etc.) chamam `requireAccess()`
**antes** de qualquer query ao repository — `ServiceError("forbidden")` é
lançado sem nunca ter consultado o chamado. Nas páginas,
`authorizeTicketSession` é chamado antes de `getTicketsPageData`/
`getTicketWorkspace`/`listTickets`. Nenhum caminho consulta primeiro para
negar depois.

## 35. Cross-org

Coberto pela suíte de fundação já existente
(`tests/integration/ticket-foundation.test.ts`: "nega cliente/criador
cross-org"; `tests/integration/client-support-timeline.test.ts`: item E,
"evento de chamado de outra org nunca aparece, mesmo forjando
activity_events.org_id"), reexecutada sem alteração nesta etapa. Toda
função de repository recebe `orgId` explícito e o aplica em `where`/joins —
`getTicketById`/`getTicketClient`/`getTicketProject`/`listTickets` nunca
consultam por UUID isolado.

## 36. BYPASSRLS

Reli linha a linha `ticket-repository.ts`, `ticket-comment-repository.ts` e
`ticket-timeline-repository.ts`: **todas** as funções recebem `orgId` como
parâmetro obrigatório e o usam em pelo menos uma condição de `where`/`join`
(listagem, contagem, detalhe, lock, cliente, projeto, responsável, seletor
de cliente/projeto, KPIs, timeline, comentários). Não encontrada nenhuma
chamada como `getTicket(id)`/`getComment(id)`/`getProject(id)` sem contexto
de organização. A conexão Drizzle usa a role privilegiada (`BYPASSRLS`),
então essa disciplina na aplicação é a única proteção real — RLS no banco é
defesa em profundidade, já validada contra produção no Checkpoint C1.

## 37. N+1

`getTicketsPageData`/`getTicketWorkspace` usam `Promise.all` — nenhuma busca
por linha. `listTickets` já resolve `clientName`/`projectName`/`assigneeName`
com `LEFT JOIN` numa única query. `listTicketComments`/`listTicketTimeline`
são consultas únicas por chamado (não por comentário/evento).
`TicketClientSelector`/`TicketProjectSelector` só consultam ao abrir o modal
(debounce 250 ms), não a cada render. Nenhum N+1 encontrado em `/suporte`,
`/suporte/[id]`, aba Suporte do Cliente, comentários ou timeline.

## 38. `due_at` / timezone

`toDateTimeLocalValue`/`fromDateTimeLocalValue`
(`src/lib/support/format.ts`) revalidados: interpretam/apresentam sempre em
America/Sao_Paulo (UTC-3 fixo, sem horário de verão desde 2019) — nunca o
timezone do navegador/processo. Cobertos por `tests/unit/ticket-format.test.ts`
(11 testes, incluindo round-trip ISO→datetime-local→ISO e um caso cruzando
meia-noite UTC), reexecutados sem alteração — nenhum deslocamento de 3h
encontrado.

## 39. Overdue

`isTicketOverdue` (client) e a constante SQL `overdue` (servidor, usada tanto
no filtro `?vencidos=true` quanto no KPI "Vencidos") usam exatamente a mesma
regra: `due_at < agora` **e** `status not in ('resolved','cancelled')` — ou
seja, qualquer status não-terminal, incluindo `waiting_client`, continua
contando como vencido se o prazo passou (nenhuma exclusão especial). As duas
implementações (SQL e TypeScript) foram comparadas lado a lado nesta etapa —
idênticas em espírito, nenhuma divergência.

## 40. `ticket_number`

Confirmado que o UUID nunca aparece como identificador visual principal em
nenhuma tela revisada (`/suporte`, ficha, aba do Cliente, formulário,
breadcrumb, timeline) — sempre `formatTicketNumber()` (`#N`). UUID só existe
internamente em `href`s (opaco ao usuário).

## 41. Empty states

Revisados: nenhum chamado cadastrado (`/suporte` e aba do Cliente, com CTA
condicionado); nenhum resultado após filtro (mensagem distinta, sem CTA de
criar); sem projeto vinculado ("Nenhum"); sem responsável ("Sem responsável"/
"—"); sem prazo ("—"); sem comentários (`EmptyState` dedicado); timeline
vazia (`EmptyState` dedicado, tanto no chamado quanto no Cliente).

## 42. Loading

`suporte/loading.tsx`: skeleton com a mesma estrutura da página real
(header, 4 KPIs, filtros, tabela) — sem layout shift perceptível ao
carregar de verdade, mesmo padrão de Clientes/Projetos. Aplica-se também a
`/suporte/novo`, `/suporte/[id]`, `/suporte/[id]/editar` por herança de
segmento do App Router (não há `loading.tsx` mais específico nessas
subrotas — mesma convenção já usada em Clientes/Projetos, não uma lacuna
nova).

## 43. Error states

`suporte/error.tsx`: mensagem genérica ("Não foi possível carregar Suporte...
Tente novamente em instantes.") com botão "Tentar novamente" — nunca SQL,
stack, constraint ou código de erro do Postgres. Confirmado em
`ticket-service.ts:safe()`: só traduz códigos específicos conhecidos
(`23514`/`invalid ticket assignee` → `invalid_owner`; `23503`/
`support_tickets_client_fkey` → `invalid_client`; idem `_project_fkey`;
`40001`/`40P01` → `conflict`) para mensagens humanas; qualquer outro erro cai
no genérico `"Não foi possível concluir a operação. Tente novamente."` — nunca
repassa `error.message`/`cause` do driver Postgres para o cliente.

## 44. Responsividade

**Estrutural, por leitura de código — sem sessão autenticada disponível
nesta sessão** (ver §37/§45): tabela desktop (`hidden lg:block`) e cards
mobile/tablet (`space-y-3 lg:hidden`) no mesmo breakpoint `lg` usado em
Clientes/Projetos, em `/suporte` e na aba Suporte do Cliente; formulário
`max-w-3xl` com `grid sm:grid-cols-2` colapsando para uma coluna abaixo de
`sm`; ficha com `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`; filtros usam
`flex-wrap`/`flex-col sm:flex-row`. Confirmado ao vivo, sem login, que
`/suporte`, `/suporte/novo`, `/suporte/[id]` e `/suporte/[id]/editar`
redirecionam para `/login?next=...` com `200 OK`, sem erro de console/
servidor em nenhuma (ver §37).

## 45. 1280×720

Mesma limitação estrutural do §44 — não verificado visualmente com sessão
ativa. Os mesmos breakpoints (`sm`/`lg`) já validados nessa resolução para
Clientes ([Checkpoint 3](clientes-checkpoint-3.md) §25) foram reaproveitados
sem alteração específica para Suporte; nenhum componente de Suporte usa
altura fixa que pudesse cortar conteúdo fora da viewport (formulário/ficha/
modal/composer/timeline todos dentro do `<main>` com `overflow-y: auto` do
Shell, mesmo padrão herdado).

## 46. Mobile

Mesma limitação. Estruturalmente: listagem vira cards; `TicketClientSelector`/
`TicketProjectSelector` abrem `Modal` full-width; `Select`s ocupam largura
total abaixo de `sm`; composer de comentário e ações de status usam os
mesmos componentes responsivos do design system, sem largura fixa.

## 47. Acessibilidade

- Labels associados via `htmlFor`/`id` em todos os campos de `TicketForm`
  (título, descrição, prioridade, responsável, prazo) e do composer de
  comentário.
- `aria-label` em buscas/filtros/seletores sem label visível: "Buscar
  chamados", "Filtrar por status/prioridade/responsável", "Ordenar",
  "Buscar cliente"/"Buscar projeto" (dentro dos modais), "Limpar filtro de
  cliente", "Remover projeto vinculado".
- `aria-invalid` refletido em `Input`/`Textarea` via prop `error` (mesmo
  componente compartilhado já auditado em Clientes/Projetos); erro do
  composer de comentário ligado por `aria-describedby="new-comment-error"`.
- Botões icon-only (limpar filtro de cliente, remover projeto, ações de
  status) todos com `aria-label` ou texto visível ao lado do ícone.
- `Select`, `Modal`, `Tabs`, `Checkbox` são primitivas Radix (acessíveis por
  padrão), reaproveitadas sem modificação — mesmas já auditadas em Clientes/
  Projetos (inclusive o `aria-label` do toggle da sidebar, corrigido no
  Checkpoint D de Projetos e confirmado ainda presente).
- **Não verificado nesta etapa:** navegação por teclado/leitor de tela numa
  sessão viva — mesma limitação de ambiente já registrada em todos os
  checkpoints anteriores (ver §45 do pedido/§48 abaixo).

## 48. Contraste

`TicketStatusBadge`/`TicketPriorityBadge` usam variantes do `Badge`
compartilhado (`neutral`/`warning`/`accent`/`success`/`danger`/`tag`) — o
mesmo componente e os mesmos tokens de cor já usados (e já contrastados) nos
badges de status de Clientes/Projetos; nenhuma cor nova foi criada para
Suporte. `critical`/`high` usam `danger`/`warning` (texto e fundo com opacity
fixa do design system); `resolved` usa `success`; `cancelled` usa `danger`;
`waiting_client` usa `warning` — uma cor por estado, nunca "tudo vermelho"
(confirmado por leitura de `status-badge.tsx`/`priority-badge.tsx`).

## 49. QA visual autenticado

**Permanece pendente.** Não há sessão autenticada disponível nesta sessão
(`tabs_context` não retornou nenhuma aba logada). Respeitando as instruções
explícitas desta etapa e do sistema, não foi solicitada nem gerada nenhuma
credencial, magic link, cookie ou token, e nenhum bloqueio de segurança foi
contornado. Verificado sem login: `/suporte`, `/suporte/novo`,
`/suporte/00000000-0000-0000-0000-000000000000`,
`/suporte/00000000-0000-0000-0000-000000000000/editar` e
`/clientes/00000000-0000-0000-0000-000000000000` redirecionam corretamente
para `/login?next=...`, todos com `200 OK` e **zero** erro de console/
servidor (confirmado via Browser pane — screenshots e `read_network_requests`/
`read_console_messages` reais, não presumidos). `npm run build` prova que
todo o código (imports, JSX, Server Actions, das 4 rotas de Suporte e de
todos os componentes) compila e resolve sem erro, inclusive os trechos que só
executam depois do login.

## 50. Fluxo ponta a ponta

Não executado — depende diretamente do QA visual autenticado (§49), que está
pendente pelo mesmo motivo de ambiente. Nenhum dado de teste foi criado em
produção.

## 51. Regressão de Clientes

- `src/app/(app)/clientes/[id]/page.tsx`: inalterado nesta etapa (última
  mudança foi C2, aba Suporte real — já revalidada nos Checkpoints C2/C2.1).
- `src/components/clients/client-timeline.tsx`: inalterado nesta etapa
  (última mudança foi C2.1) — os 13 testes de `client-timeline.test.tsx`
  (tradução de Cliente/Projeto/Suporte) reexecutados, verdes.
- Nenhum outro arquivo de Clientes (`client-service.ts`,
  `client-repository.ts`, `client-access.ts`,
  `client-timeline-repository.ts`, `components/clients/*`) foi tocado nesta
  etapa nem desde C2.1 — confirmado por `git status`/leitura.
- Suíte completa de Clientes (fundação + serviço) reexecutada dentro de
  `npm run test`/`test:foundation` — sem falha nova.

## 52. Regressão de Projetos

- Nenhum arquivo de Projetos (`project-service.ts`, `project-repository.ts`,
  `project-access.ts`, `components/projects/*`) foi tocado nesta etapa nem em
  nenhum checkpoint de Suporte até aqui — confirmado por `git status`.
- `project masking`, timeline própria do Projeto, filtros de prioridade/
  vencidos (corrigidos no Checkpoint D de Projetos) — tudo reexecutado dentro
  da suíte completa, sem regressão.

## 53. Dashboard

`git diff -- "src/app/(app)/dashboard/page.tsx"` retornou **vazio** — nenhuma
mudança, nenhum KPI de Suporte adicionado, conforme decisão já registrada em
C2 §30 e reconfirmada aqui (a expansão do Dashboard operacional fica para
depois de Domínios/Infraestrutura).

## 54. Bugs encontrados

1. Formatação de data/hora inconsistente na coluna "Atualizado em" da aba
   Suporte da Ficha do Cliente (§2/§30) — **corrigido**.

Nenhum outro bug — schema, RLS, grants, `ticket_number`, comentários
imutáveis, project masking, status, prioridade, version, timeline, FK tripla
e integração com Cliente permanecem exatamente como aprovados, sem qualquer
divergência encontrada nesta revisão linha a linha.

## 55. Bugs corrigidos

Ver §54, item 1. Nenhuma migration, schema, RLS, service ou repository foi
alterado — apenas um componente de apresentação.

## 56. Testes novos

| Arquivo | Testes | Cobre |
|---|---|---|
| `tests/unit/ticket-interactions.test.tsx` (novo) | 2 | §25 (XSS renderizado como texto) e §26 (composer condicionado a permissão) |

Nenhum teste dedicado foi adicionado para o bug de formatação (§54) — é uma
troca de função de formatação já coberta pelos 11 testes existentes de
`formatTicketDateTime` em `tests/unit/ticket-format.test.ts`; um teste
redundante ali só infla a suíte sem cobrir nada novo (§55 do pedido: "não
inflar a suíte por quantidade").

## 57. `npm run test`

**500 aprovados, 2 pulados** (27 arquivos: 25 aprovados, 2 com teste pulado)
— era 498+2 no fim do C2.1, incremento de 2, exatamente os testes novos do
§56.

## 58. `npm run test:foundation`

**343 aprovados**, 0 falhas (11 arquivos) — idêntico ao Checkpoint C2.1
(nenhum teste novo desta etapa entra em `test:foundation`, mesmo padrão já
estabelecido para testes de UI/segurança de componente).

## 59. `npm run lint`

**0 erros, 0 avisos.**

## 60. `npm run typecheck`

Limpo (`tsc --noEmit`).

## 61. `npm run build`

`rm -rf .next && npm run build`: **concluído com sucesso**, duas vezes nesta
etapa (antes e depois da correção do §2). Todas as 27 rotas compilam,
incluindo as 4 de Suporte, todas dinâmicas (`ƒ`); nenhuma rota quebrada.

## 62. Documentação

Criado este relatório (`docs/suporte-checkpoint-d.md`). Atualizações mínimas
e factuais:

- [`README.md`](../README.md): parágrafo de Suporte atualizado (Checkpoints
  C2.1/D concluídos, testes 500+2, "implementação concluída localmente,
  aguardando publicação" — sem marcar como publicado).
- [`docs/roadmap.md`](roadmap.md): seção "Continuidade — Suporte" atualizada
  com C2.1/D e a mesma conclusão acima; Fase 1 continua explicitamente em
  aberto (Domínios/Infraestrutura pendentes).
- [`docs/banco.md`](banco.md): a nota de Suporte dizia "ainda sem UI/
  navegação — Suporte não está concluído", já desatualizada desde o
  Checkpoint C2 (nunca corrigida antes) — atualizada para refletir C2/D
  concluídos, sem migration nova.
- [`docs/seguranca.md`](seguranca.md): uma linha adicional confirmando a
  revalidação desta etapa (autorização antes de query, `orgId` explícito,
  cross-org, project masking) sem qualquer alteração de RLS/grant/policy.

Nenhum dos quatro arquivos foi reescrito — só os parágrafos diretamente
relacionados ao estado de Suporte.

## 63. `git diff --stat`

```
 README.md                                          |  21 +-
 docs/banco.md                                      |  17 +-
 docs/roadmap.md                                    |  38 +++--
 docs/seguranca.md                                  |  16 +-
 package.json                                       |   2 +-
 src/app/(app)/clientes/[id]/page.tsx               |  28 ++-
 src/app/(app)/suporte/page.tsx                     | 227 ++++++++++++++++++++-
 src/components/clients/client-timeline.tsx         |  13 +-
 src/config/navigation.ts                           |   2 +-
 src/server/db/migrations/meta/_journal.json        |   9 +-
 src/server/db/schema/index.ts                      |   2 +
 src/server/db/schema/projects.ts                   |   4 +
 .../repositories/client-timeline-repository.ts     |  84 ++++----
 src/server/services/client-service.ts              |  15 +-
 src/server/services/service-error.ts               |   1 +
 tests/helpers/projects.ts                          |   2 +-
 tests/integration/schema-reconciliation.test.ts    |  20 +-
 tests/unit/navigation.test.ts                      |  20 ++
 18 files changed, 434 insertions(+), 73 deletions(-)
```

(`src/components/support/client-tickets-tab.tsx`, corrigido nesta etapa, e
`tests/unit/ticket-interactions.test.tsx`, novo, estão dentro de diretórios
ainda não rastreados — aparecem em `git status` como `??`, não neste
`diff --stat`, que só cobre arquivos já rastreados pelo Git.)

## 64. `git status`

Sem staging, sem commit. Mesmos arquivos rastreados modificados desde
C2.1, mais `docs/suporte-checkpoint-d.md` (novo) e
`tests/unit/ticket-interactions.test.tsx` (novo). Nenhum arquivo temporário,
secret, `.env`, dump, screenshot ou usuário de teste hardcoded — confirmado
por `grep` de `console.log`/`TODO`/`FIXME` em `src/app/(app)/suporte`,
`src/components/support` e `src/lib/support` (zero ocorrências).

## 65. Confirmação: nenhuma migration nova

`src/server/db/migrations/` não ganhou nenhum arquivo novo. `0005_support.sql`
permanece exatamente como aplicado no Checkpoint C1.

## 66. Confirmação: nenhum commit/push/deploy

Confirmado por `git status` (§64) — árvore de trabalho não commitada, `HEAD`
inalterado, nenhum `git add`/`git commit`/`git push` executado.

## 67. Recomendação final para publicação

**Suporte é recomendado para publicação, com uma única ressalva de
ambiente:**

Verde: lint, typecheck, testes (500+2), foundation (343), build; permissions
corretas (`ticket:read`+`client:read` leitura, soma `ticket:write` escrita,
`project:read` nunca gate.ia o chamado, `scope=assigned` sempre negado);
cross-org correto (repository sempre com `orgId` explícito, RLS já validada
contra produção no C1); project masking correto (três camadas, com teste de
payload serializado); timeline correta (própria do chamado e consolidada do
Cliente, com tradução visual desde C2.1); comentários seguros (imutáveis,
conteúdo nunca em `audit.log`/`activity_events`, nunca interpretado como
HTML); Clientes e Projetos sem regressão.

**Único ponto pendente: QA visual autenticado (§49)** — bloqueado por
ambiente (sem sessão disponível nesta sessão), não por código. Mesma
ressalva já aceita para Clientes e Projetos antes de suas respectivas
publicações.

**Critério de pronto (pedido §62): atingido.** Marcado como *"tecnicamente
pronto; QA visual autenticado pendente"* — nenhuma validação visual foi
inventada.

Parando aqui, conforme pedido (§63 — regra de parada). Sem commit, push ou
deploy. Aguardando aprovação final do usuário antes de qualquer publicação.
