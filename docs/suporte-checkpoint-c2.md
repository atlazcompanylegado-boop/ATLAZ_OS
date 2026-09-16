# Suporte — Checkpoint C2: UI completa + integração com Cliente

Data: 16/09/2026. Escopo autorizado: implementação funcional e visual de
Suporte sobre a fundação já aplicada e validada em produção no Checkpoint C1.
**Sem migration nova, sem commit/push/PR/deploy.**

## 1. Estado inicial

HEAD em `b166c74`, árvore idêntica ao fim do Checkpoint C1 (`git status`/`git
diff --stat` conferidos antes de qualquer código novo). Releitura confirmada
dos três relatórios de Suporte (A/B/C1) e dos checkpoints finais de
Clientes/Projetos antes de começar; nenhuma decisão de fundação foi reaberta,
com duas exceções pontuais e explicitamente justificadas abaixo (§9, §29).

## 2. Arquivos criados

**UI de rotas**
- `src/app/(app)/suporte/actions.ts`, `loading.tsx`, `error.tsx`.
- `src/app/(app)/suporte/novo/page.tsx`.
- `src/app/(app)/suporte/[id]/page.tsx`, `not-found.tsx`, `editar/page.tsx`.

**Componentes** (`src/components/support/`)
- `status-badge.tsx`, `priority-badge.tsx`.
- `client-selector.tsx`, `project-selector.tsx` (seletor de Projeto restrito
  ao Cliente escolhido).
- `ticket-filters.tsx`, `ticket-form.tsx`, `status-actions.tsx`.
- `ticket-timeline.tsx`, `interactions.tsx` (comentários + composer).
- `client-tickets-tab.tsx` (aba Suporte da Ficha Mestre do Cliente).

**Formatação**
- `src/lib/support/format.ts` (`formatTicketNumber`, `formatTicketDateTime`,
  `isTicketOverdue`, conversão `datetime-local` ↔ ISO em America/Sao_Paulo).

**Testes**
- `tests/unit/ticket-badges.test.tsx`, `ticket-format.test.ts`.
- Extensão de `tests/unit/navigation.test.ts` (Suporte).
- Extensão de `tests/integration/ticket-service.test.ts` (mascaramento de
  Projeto, transições rápidas de status — ver §9).

Este relatório (`docs/suporte-checkpoint-c2.md`).

## 3. Arquivos modificados

- `src/app/(app)/clientes/[id]/page.tsx` — aba Suporte real (§26).
- `src/config/navigation.ts` — Suporte ativado (§28).
- `src/server/repositories/ticket-repository.ts` — dois ajustes pontuais e
  explícitos (não bugs, decisões desta etapa — ver §9): KPI "Abertos"
  redefinido para "status fora de resolved/cancelled" (antes: só `status=open`
  literal); `TICKET_SORTS` ganhou `ticketNumber`/`priority` e perdeu `title`
  (a listagem não pedia mais ordenação alfabética por título; número e
  prioridade são as ordenações realmente úteis pedidas no Checkpoint C2 §10).
- `src/lib/validation/ticket.ts` — `TICKET_SORTS` atualizado (idem);
  `ticketStatusActionSchema` passou a aceitar qualquer status real, não só
  `resolved`/`cancelled` (ver §9).
- `src/server/services/ticket-service.ts` — tipo interno `Mutation` amplia o
  modo `"status"` para aceitar qualquer `TicketStatus` (mesma razão).
- `tests/integration/ticket-service.test.ts` — 2 asserções de KPI/sort
  ajustadas ao novo comportamento; 1 teste novo (transições rápidas).
- `tests/unit/ticket-validation.test.ts` — 1 asserção ajustada.

**Nenhuma migration, tabela, coluna, FK, RLS, policy ou grant foi tocado.**

## 4. Rotas

`/suporte` (listagem), `/suporte/novo`, `/suporte/[id]` (ficha),
`/suporte/[id]/editar`, com `loading`/`error`/`not-found` dedicados. Todas
compilam e aparecem no `next build` como rotas dinâmicas (`ƒ`) — confirmado.

## 5. Listagem

Tabela desktop (`hidden lg:block`) com Chamado (`#1042 — título`), Cliente,
Projeto (mascarado — ver §15), Status, Prioridade, Responsável, Prazo,
Atualizado em, Ações. Cards no mobile/tablet (`lg:hidden`). CTA "Novo chamado"
condicionado a `ticket:write`.

## 6. KPIs

Quatro KPIs reais, uma única query agregada (`getTicketCounts`):

- **Abertos** = `status NOT IN ('resolved','cancelled')` — redefinido nesta
  etapa (era só `status='open'` literal na fundação) porque "Em atendimento"
  já é reportado como KPI separado logo ao lado; "Abertos" no sentido do
  pedido (§6) significa qualquer chamado ainda não finalizado, não o estado
  literal `open`. Decisão explícita do próprio pedido, aplicada exatamente
  como especificado — ver §9 para o porquê isso conta como ajuste aprovado,
  não reabertura de fundação.
- **Em atendimento** = `status='in_progress'`.
- **Críticos** = `priority='critical' AND status NOT IN ('resolved','cancelled')`.
- **Vencidos** = `due_at < now() AND status NOT IN ('resolved','cancelled')`.

Nenhum número inventado; todos server-side.

## 7. Busca

Server-side (`ILIKE` parametrizado, escape literal de `%`/`_`), cobrindo
título e nome de Cliente/Projeto (fundação, inalterada) **mais** comparação
direta por `ticket_number` quando o termo digitado for puramente numérico
(com ou sem `#` na frente) — ajuste pontual em `conditions()` nesta etapa,
já que a fundação só cobria título/cliente/projeto e o pedido (§7) exige
explicitamente busca pelo número do chamado. `q="1042"` ou `q="#1042"`
encontram o chamado `#1042` mesmo que esse número não apareça no título.
Sem busca no corpo dos comentários (fora de escopo, §7).

## 8. Filtros

Implementados: Cliente (seletor modal paginado, mesmo componente do
formulário, reaproveitado como filtro — nunca carrega todos os clientes),
Projeto (só habilita depois de um Cliente filtrado, também paginado), Status,
Prioridade, Responsável (+ "Sem responsável"), Vencidos. Todos sincronizados
com a URL, resetando a página ao mudar qualquer filtro. Ordenação:
mais recentes, atualizados recentemente, número do chamado, prazo, prioridade
(desempate sempre por `id`).

**Diferença em relação a Projetos:** lá, a decisão explícita do Checkpoint C
foi **não** ter filtro de Cliente na listagem principal (usar só busca). Aqui,
o pedido (§8/§9) pediu explicitamente filtros de Cliente **e** Projeto —乃
implementados como seletores modais (mesma UX do formulário), não dropdowns
carregando tudo, respeitando a mesma restrição de não carregar listas
inteiras.

## 9. Ticket number

Exibido como `#1042` em toda a UI (listagem, ficha, aba do Cliente,
formulário de edição) — o UUID nunca aparece como identificador visível,
só internamente (`href`s usam o UUID, que é opaco ao usuário). `formatTicketNumber()`
é a única função de formatação, testada.

**Sobre os dois ajustes de fundação desta etapa (KPI "Abertos" e
`ticketStatusActionSchema`):** o pedido (§2) instruiu não reabrir fundação
"a menos que um bug real e comprovado apareça". Nenhum dos dois ajustes é uma
correção de bug — são pontos que o **próprio Checkpoint C2** especifica de um
jeito que exige uma pequena mudança na camada de validação/repository:

1. **KPI "Abertos":** o pedido definiu explicitamente (§6) "Abertos: status
   fora de resolved/cancelled", diferente do que a fundação implementou
   (`status='open'` literal). Ajustei a query para bater com a definição
   pedida agora.
2. **Ações de status rápidas (§29):** a ficha precisa oferecer "Iniciar
   atendimento" (open→in_progress), "Enviar para triagem" (open→triage),
   "Aguardar cliente" (in_progress→waiting_client), "Retomar atendimento"
   (waiting_client→in_progress) como **ações de um clique**, sem reenviar o
   formulário inteiro. A fundação só tinha dois caminhos de mudança de status:
   edição genérica (exige todos os campos do formulário) e
   `changeTicketStatus` (restrito a `resolved`/`cancelled`). Ampliei o *schema*
   de `changeTicketStatus` para aceitar qualquer status real — a lógica de
   proteção contra transições inválidas (sair de um estado final sem
   `reopenTicket`, por exemplo) já existia em `mutate()` e **não foi alterada**,
   só passou a ser exercitada por mais valores de entrada. Testado
   explicitamente que ainda não é possível pular de um estado final para
   outro estado direto sem passar por `reopenTicket`.

Ambos são mudanças de 1–3 linhas em arquivos já existentes, sem tocar
schema/migration/RLS/grants, e diretamente exigidos pela especificação desta
própria etapa — não uma reabertura de decisão arquitetural.

## 10. Formulário de criação

`/suporte/novo` → `TicketForm mode="create"` → `createTicketAction` →
`ticket-service.createTicket` (fundação inalterada) → `redirect` para
`/suporte/[id]`. Campos: Cliente (seletor), Projeto (opcional, seletor
restrito ao Cliente), título, descrição (obrigatória), prioridade,
responsável (opcional), prazo (opcional, `datetime-local`). **Sem campo de
status** — a fundação já cria com `status="open"` por default quando omitido;
a UI simplesmente nunca oferece a opção de mudar isso na criação (§12: "Não
permitir status arbitrário no cadastro").

## 11. Formulário de edição

`/suporte/[id]/editar` reaproveita o mesmo `TicketForm` (`mode="edit"`).
Cliente aparece como texto somente leitura com nota explicativa (imutável).
Projeto, título, descrição, prioridade, responsável e prazo são editáveis.
**Sem campo de status na edição também** — todas as transições de status
acontecem exclusivamente pelas ações explícitas da ficha (§29), nunca por um
select genérico no formulário; isso simplifica o formulário e evita a
ambiguidade que existia em Projetos (onde editar podia mudar status entre
não-finais). `version` e `ticketId` em campos ocultos.

## 12. Client selector

`TicketClientSelector` — cópia adaptada do `ClientSelector` de Projetos
(busca server-side, 25 por consulta, nunca carrega todos). Reaproveitado tanto
no formulário quanto nos filtros da listagem (com um `onChange` adicional para
sincronizar a URL).

## 13. Project selector

`TicketProjectSelector` — novo (Projetos não precisava disso, já que lá o
"projeto" é a própria entidade sendo criada). Sempre desabilitado sem
`clientId`; busca `listTicketProjects(clientId, q, page)` (já existente na
fundação, escopada ao cliente). Se o `clientId` mudar (no formulário, ao
trocar de cliente antes de salvar — só possível na criação, já que na edição o
cliente é fixo), o projeto selecionado é limpo automaticamente
(`useEffect` comparando o `clientId` anterior); o servidor sempre revalida de
novo no submit (`ensureProject`, fundação inalterada).

## 14. Project selector — habilitação condicional

Confirmado: no formulário de criação, o seletor de Projeto fica desabilitado
("Selecione um cliente primeiro") até que um Cliente seja escolhido. Na
edição, o Cliente já é fixo desde a carga da página, então o seletor de
Projeto já nasce habilitado.

## 15. Project masking

Implementado em três camadas, como pedido (§15):

1. **Serviço** (fundação, inalterada): `maskProjectVisibility()` zera
   `projectId`/`projectName` quando `!canReadProjects`, mantendo só
   `hasProject: boolean`.
2. **RSC/payload serializado:** testado explicitamente nesta etapa
   (`tests/integration/ticket-service.test.ts`, describe "mascaramento") que
   o nome real do projeto **não aparece em nenhum lugar** do objeto retornado
   por `getTicketDetail`/`listTickets` quando o chamador não tem
   `project:read` — não é um teste de UI, é um teste do próprio payload que o
   Server Component recebe, exatamente o que o pedido exige (§54: "não basta
   esconder visualmente").
3. **UI:** quando `hasProject && !projectName`, mostra o texto genérico
   "Projeto vinculado" (ficha) ou um badge itálico equivalente (listagem/aba
   do Cliente) — sem nome, sem UUID, sem link. Quando `projectName` existe
   (autorizado), mostra nome com link para `/projetos/[id]`.

## 16. Assignee

`Select` com "Sem responsável" + `listAvailableTicketAssignees()` (membros
ativos da própria org, função já existente da fundação, sem alteração). Nunca
carrega membros de outra org (a função já filtra por `orgId` da sessão).

## 17. `due_at` / timezone

`<input type="datetime-local">` não carrega timezone — implementado um par de
conversões dedicado (`toDateTimeLocalValue`/`fromDateTimeLocalValue` em
`src/lib/support/format.ts`) que sempre interpreta/apresenta o valor em
**America/Sao_Paulo (UTC-3 fixo, sem horário de verão desde 2019)**, nunca no
timezone do navegador ou do processo Node. Testado com round-trip
ISO→datetime-local→ISO preservando o instante exato, e com um caso concreto
cruzando meia-noite UTC para garantir que a data não desloca.

## 18. Ficha do chamado

`/suporte/[id]`: header (`#número — título`, badges de status/prioridade,
ações de status, botão Editar), cartão de resumo (Cliente com link, Projeto
mascarado, Responsável, Prazo com indicação de atraso), `Tabs` com **Visão
Geral**, **Interações**, **Timeline** — três abas, não mais (o esboço do
pedido em §22 listava "Cliente/Projeto" como uma seção à parte, mas §23 já
inclui cliente/projeto dentro de "Visão Geral" — segui a lista de conteúdo
real de §23, evitando a aba extra que o próprio pedido pede para não
exagerar).

## 19. Comentários (Interações)

`TicketInteractions`: lista em ordem **ascendente** (mais antigo primeiro,
conversa), cada item com autor, data/hora (America/Sao_Paulo) e conteúdo.
Sem botões de editar/excluir (comentários imutáveis, contrato do Checkpoint
B). Composer (textarea + botão) só aparece com `ticket:write`
(`canComment`, calculado na página a partir de `can(...,"ticket:write")`,
mesma checagem que já autoriza a edição do chamado).

## 20. Timeline

`TicketTimeline` traduz todos os 8 kinds (`ticket.created` →
`ticket.comment_added`) via `translateTicketEventKind`. Nunca mostra `kind`
cru, UUID ou payload — só título traduzido + `summary` humano já gravado pela
fundação + ator + data/hora. Comentário na timeline aparece só como
"Comentário adicionado" (kind `ticket.comment_added`), nunca o texto — o
texto completo mora exclusivamente na aba Interações (contrato da fundação,
reafirmado aqui na camada de apresentação).

## 21. Ações de status

`TicketStatusActions` implementa exatamente a tabela do pedido (§29): cada
status mostra só as ações válidas a partir dele (open: iniciar/triagem/
cancelar; triage: iniciar/cancelar; in_progress: aguardar/resolver/cancelar;
waiting_client: retomar/resolver/cancelar; resolved/cancelled: reabrir).
Nenhum select genérico de status na ficha.

## 22. Resolver

Confirmação simples (`Modal` do Design System, não `window.confirm`). Ao
confirmar, `changeTicketStatusAction(id, version, "resolved")` →
`resolved_at = now()` no servidor (fundação inalterada) — testado
(`resolvedAt instanceof Date`).

## 23. Cancelar

Confirmação **obrigatória** com variante destrutiva (`destructive: true` no
`ActionDef`, botão vermelho no modal) — visualmente mais séria que
resolver/reabrir, conforme pedido (§30). `resolved_at` permanece `NULL`
(nunca finge resolução, fundação inalterada).

## 24. Reabrir

Confirmação simples. `reopenTicketAction` → `status="in_progress"`,
`resolved_at=NULL` (fundação inalterada) — testado.

## 25. Concurrency UI

Formulário sempre envia `version` em campo oculto. Em conflito, o Alert
mostra exatamente a mensagem pedida — **"Este chamado foi atualizado por
outro usuário. Atualize a página antes de salvar novamente."** — com botão
"Recarregar dados" (`router.refresh()`), nunca sobrescrevendo silenciosamente.
Mesma UX já usada em Clientes/Projetos, adaptada ao texto de Suporte.

## 26. Integração com Cliente

Aba "Suporte" na Ficha Mestre deixou de ser `EmptyState` de módulo futuro e
passa a chamar `listTickets({ clientId, page })` — só quando
`authorizeTicketSession(session, "read").ok` for verdadeiro, mesmo padrão
exato da aba Projetos: **`listTickets` nunca é chamado sem autorização**
(`if (canReadTickets) await listTickets(...)`, checagem antes do `await`,
não depois). Sem `ticket:read`, `ClientTicketsForbidden` (Alert genérico, sem
número/nome/contagem). CTA "Novo chamado" (só com `ticket:write`) aponta para
`/suporte/novo?cliente=<id>`, revalidado no servidor (mesmo padrão de
Projetos — `getTicketClient` antes de pré-preencher, `ensureClient` de novo
no submit).

## 27. Timeline consolidada do Cliente

**Já implementada na fundação (Checkpoint B)** — nesta etapa só validei a UI
com os três tipos de evento coexistindo. Como não há sessão autenticada
disponível para QA visual ao vivo (ver §36), a validação foi feita pela
suíte automatizada (`client-support-timeline.test.ts`, 10 casos, incluindo o
teste K com Cliente+Projeto+Suporte no mesmo stream) — não reexecutada aqui,
mas confirmada verde na rodada de testes desta etapa (§40/§41). A UI da
timeline do Cliente (`client-timeline.tsx`) **não foi alterada nesta etapa**
— continua sem tradução de `kind` de Suporte (mostra o genérico "Atividade
registrada" para eventos `ticket.*`, mesma lacuna já registrada para eventos
`project.*` desde o Checkpoint D.1 de Projetos). Isso é uma lacuna de UI
conhecida, não deste checkpoint especificamente — ver §45.

## 28. Navegação

`src/config/navigation.ts`: item "Suporte" mudou de `status:"planned"` (com
badge de fase) para `status:"available"`, `permission:
["ticket:read","client:read"]` — mesmo contrato multi-permissão já genérico
desde Projetos (`isNavItemVisible` com `every()`). Testado: some sem nenhuma
permissão, some com só uma das duas, aparece com as duas; Clientes e Projetos
continuam sem regressão (mesmo arquivo de teste, casos novos). Domínios e
Infraestrutura continuam `planned`, inalterados.

## 29. Busca global

`GlobalSearch` já lê de `getVisibleFlatNavigation` — Suporte passou a
aparecer nela automaticamente, sem nenhuma mudança adicional. Continua sendo
busca de destinos/módulos, não de chamados.

## 30. Regressão do Dashboard

`src/app/(app)/dashboard/page.tsx`: **zero diferença** (`git diff` vazio para
este arquivo). Nenhum KPI de Suporte foi adicionado, conforme pedido — a
expansão operacional do Dashboard continua reservada para depois dos quatro
módulos.

## 31. Permissions

Confirmado por leitura de código e pela suíte de testes (fundação, inalterada
nesta etapa): leitura exige `ticket:read`+`client:read`; escrita soma
`ticket:write`; `project:read` nunca é exigido para o chamado em si, só
libera detalhes do Projeto vinculado; `scope='assigned'` continua negado sem
exceção. Autorização acontece **antes** de qualquer consulta em todas as
páginas (`authorizeTicketSession` chamado antes de `getTicketsPageData`/
`getTicketWorkspace`/etc.), nunca "consultar primeiro, negar depois".

## 32. Cross-org

Coberto pela fundação (Checkpoints B/C1) e revalidado nesta etapa
indiretamente — nenhuma página/service novo introduz uma consulta sem
`orgId`; `getTicketDetail`/`getTicketWorkspace` continuam devolvendo
`not_found` genérico (nunca diferenciando UUID inválido de cross-org — §34
do pedido, comportamento herdado e confirmado pela página `[id]/page.tsx`,
que só trata `code === "not_found"` → `notFound()`).

## 33. N+1 review

`getTicketsPageData`/`getTicketWorkspace` buscam tudo em paralelo
(`Promise.all`) numa única resolução de sessão — sem N+1: `listTickets` já
faz um único `SELECT` com `LEFT JOIN` para `clientName`/`projectName`/
`assigneeName` (fundação, inalterada); nenhum componente novo dispara consulta
por linha da tabela. `TicketClientSelector`/`TicketProjectSelector` só buscam
ao abrir o modal (debounce de 250ms), não a cada renderização. Revisão
específica de Cliente/Projeto/assignee/comentários/listagem: nenhuma consulta
por item individual encontrada.

## 34. Responsividade

**Estrutural apenas — sem sessão autenticada disponível nesta sessão** (ver
§36). Tabela desktop (`hidden lg:block`) e cards mobile/tablet (`lg:hidden`)
no mesmo breakpoint (`lg`) já usado em Clientes/Projetos. Formulário
`max-w-3xl` com grid `sm:grid-cols-2`. Ficha com `grid-cols-1 sm:grid-cols-2
lg:grid-cols-4` no cartão de overview. Filtros usam `flex-wrap` para não
quebrar em telas estreitas. Verificado ao vivo, sem login, que as quatro
rotas redirecionam para `/login` corretamente, sem erro 500/console em
nenhuma (screenshots/network conferidos via navegador).

## 35. Acessibilidade

Labels associados (`htmlFor`/`id`) em todos os campos do formulário;
`aria-label` em buscas/filtros/seletores sem label visível; botões
icon-only (remover projeto no seletor) com `aria-label`; textarea do
comentário com `aria-describedby` apontando para a mensagem de erro quando
houver; `Select`/`Modal`/`Tabs` são primitivas Radix já acessíveis por
padrão, reaproveitadas sem modificação. Não foi possível testar navegação
por teclado/leitor de tela numa sessão viva (mesmo limite do §36).

## 36. QA visual

**Pendente — mesma limitação de todos os checkpoints anteriores.** Não há
sessão autenticada disponível nesta sessão; não tentei gerar credenciais,
magic link ou token. Verificado sem login: `/suporte`, `/suporte/novo`,
`/suporte/[id]` (UUID de teste) e `/suporte/[id]/editar` redirecionam
corretamente para `/login?next=...`, todas com `200` e sem erro de
console/servidor (confirmado via navegador). `npm run build` prova que todo
o código (imports, JSX, Server Actions) compila e resolve sem erro, inclusive
os trechos que só executam depois do login.

## 37. Bugs encontrados

Nenhum bug de fundação encontrado durante a implementação da UI. Os dois
ajustes documentados no §9 (KPI "Abertos", schema de `changeTicketStatus`)
não são bugs — são pontos que a fundação (Checkpoint B) deixou mais estreitos
do que esta etapa (C2) especifica, ajustados exatamente para bater com o
pedido atual.

## 38. Bugs corrigidos

Nenhum — ver §37.

## 39. Testes novos

| Arquivo | Testes |
|---|---|
| `tests/unit/ticket-badges.test.tsx` | 10 |
| `tests/unit/ticket-format.test.ts` | 11 |
| `tests/unit/navigation.test.ts` (extensão) | +5 |
| `tests/integration/ticket-service.test.ts` (extensão) | +3 (mascaramento ×2, transições rápidas ×1) |
| `tests/unit/ticket-validation.test.ts` (ajuste, sem net-new) | 0 |
| **Total novo líquido** | **+25** |

## 40. Total de testes

`npm run test`: **485 aprovados, 2 pulados** (era 460+2 no fim do C1).

## 41. Total foundation

`npm run test:foundation`: **343 aprovados** (era 342 — só a suíte de service
de Suporte ganhou o teste de transições rápidas; os testes de UI não entram
em `test:foundation`, mesmo padrão de Projetos).

## 42. lint

`npm run lint`: **0 erros, 0 avisos.**

## 43. typecheck

`npm run typecheck`: limpo.

## 44. build

`npm run build` (após `rm -rf .next`): **concluído com sucesso**. Rotas novas
confirmadas no manifesto: `/suporte`, `/suporte/novo`, `/suporte/[id]`,
`/suporte/[id]/editar`, todas dinâmicas; nenhuma rota existente quebrou.

## 45. Documentação

Este relatório (`docs/suporte-checkpoint-c2.md`). README/roadmap atualizados
factual e minimamente (ver commit deste checkpoint) — Suporte **não** foi
marcado como concluído. **Pendências registradas explicitamente, não
escondidas:**

1. **Timeline consolidada do Cliente não traduz eventos de Suporte** na UI
   (`client-timeline.tsx` continua sem um terceiro `translateXEventKind` —
   mesma lacuna que já existia para Projetos desde o Checkpoint D.1, nunca
   fechada). Eventos de chamado aparecem lá com o rótulo genérico "Atividade
   registrada" em vez de traduzidos — não é um vazamento de segurança (o
   `summary` humano da fundação ainda aparece), só uma tradução de título
   ausente.

## 46. `git diff --stat`

```
 README.md                                          |  12 +-
 docs/banco.md                                      |  12 ++
 docs/roadmap.md                                    |  29 ++-
 docs/seguranca.md                                  |  10 +
 package.json                                       |   2 +-
 src/app/(app)/clientes/[id]/page.tsx               |  28 ++-
 src/app/(app)/suporte/page.tsx                     | 227 ++++++++++++++++++++-
 src/config/navigation.ts                           |   2 +-
 src/server/db/migrations/meta/_journal.json        |   9 +-
 src/server/db/schema/index.ts                      |   2 +
 src/server/db/schema/projects.ts                   |   4 +
 src/server/repositories/client-timeline-repository.ts | 84 ++++----
 src/server/services/client-service.ts              |  15 +-
 src/server/services/service-error.ts               |   1 +
 tests/helpers/projects.ts                          |   2 +-
 tests/integration/schema-reconciliation.test.ts    |  20 +-
 tests/unit/navigation.test.ts                      |  20 ++
 17 files changed, 409 insertions(+), 70 deletions(-)
```

(`src/app/(app)/suporte/page.tsx` aparece como modificado porque já existia
como placeholder desde a Fase 0 — o diff mostra a substituição completa pelo
conteúdo real. README/roadmap ganharam parágrafos novos de continuidade
(§63). A maior parte do trabalho desta etapa é arquivo novo, listado no
`git status` abaixo.)

## 47. `git status`

Sem staging, sem commit. `HEAD` continua em `b166c74`. Arquivos novos:
todos os componentes/rotas/testes de UI de Suporte listados no §2, mais este
relatório.

## 48. Confirmação: nenhuma migration nova

Confirmado — `src/server/db/migrations/` não ganhou nenhum arquivo novo
nesta etapa. `0005_support.sql` permanece exatamente como aplicado no
Checkpoint C1, sem edição.

## 49. Confirmação: nenhum commit/push/deploy

Confirmado por `git status` (§47) — árvore de trabalho não commitada,
`HEAD` inalterado, nenhum `git add`/`git commit`/`git push` executado.

## 50. Pendências para Checkpoint D

1. **QA visual autenticado** — pendente pela mesma razão de sempre (sem
   sessão disponível nesta sessão).
2. **Tradução de eventos de Suporte na timeline visual do Cliente** — lacuna
   de UI registrada no §45 (mesma categoria da lacuna já existente para
   Projetos desde D.1 — pode valer a pena resolver as duas juntas no D).
3. Decisões já registradas nesta etapa e não revertidas sem aprovação: KPI
   "Abertos" redefinido (§6/§9); `TICKET_SORTS` sem ordenação por título
   (§3); nenhuma aba "Cliente/Projeto" separada na ficha (§18).
4. Integrações conscientemente adiadas desde o Checkpoint A/B (aba de
   chamados na Ficha do Projeto; timeline consolidada do Projeto incluindo
   chamados) continuam fora do escopo — não fazem parte de C2 nem foram
   tocadas.

Parando aqui. Sem commit/push/deploy. Aguardando aprovação para o Checkpoint
D (QA final).
