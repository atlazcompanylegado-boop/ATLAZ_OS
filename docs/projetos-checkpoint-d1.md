# Projetos — Checkpoint D.1: timeline consolidada do Cliente

Data: 15/09/2026. Escopo autorizado: corrigir **somente** a lacuna registrada no
Checkpoint D §7 — a Timeline da Ficha Mestre do Cliente não incluía eventos de
Projetos. **Sem migration, sem schema, sem nova feature, sem redesenho de
Clientes, sem commit/push/deploy.**

## 1. Causa exata do gap

`src/server/repositories/client-timeline-repository.ts` filtrava
exclusivamente `activity_events.entity_type = 'client'`. Não existia nenhum
join/união com `projects`/eventos `entity_type='project'`. A função nunca
recebia informação de autorização de Projetos — não havia como ela decidir
incluir ou não esses eventos, então simplesmente nunca os buscava. Isso
divergia do Checkpoint A §21 ("Timeline do Cliente combina eventos próprios
com eventos de Projetos") sem ter sido registrado como decisão consciente em
nenhum checkpoint anterior.

## 2. Arquivos alterados

- [src/server/repositories/client-timeline-repository.ts](../src/server/repositories/client-timeline-repository.ts) —
  consolidação via `UNION ALL` (ver §7).
- [src/server/services/client-service.ts](../src/server/services/client-service.ts) —
  `requireAccess` passou a calcular `canReadProjects`; `listClientTimeline` e
  `getClientWorkspace` repassam essa flag ao repository.
- [src/components/clients/client-timeline.tsx](../src/components/clients/client-timeline.tsx) —
  traduz eventos de Projetos com o nome do projeto no título.
- [tests/integration/client-project-timeline.test.ts](../tests/integration/client-project-timeline.test.ts) —
  10 testes novos (ver §12).

Nenhum outro arquivo foi tocado. Em particular: nenhuma migration, nenhum
schema, nenhum producer de Projetos
([project-events.ts](../src/server/services/project-events.ts) inalterado),
nenhum arquivo de CRUD de Cliente/Contato, `audit.log`, navegação, Dashboard,
Auth ou Login.

## 3. Solução arquitetural adotada

Exatamente a sugestão do pedido (§7), sem inventar uma camada nova:

1. `client-service.ts` autoriza `client:read`/`client:write` como sempre
   (`authorizeClientSession`, inalterado).
2. Na mesma chamada, sem nova consulta ao banco, `requireAccess` calcula
   `canReadProjects = can(session.membership.permissions, "project:read")` —
   reaproveita a sessão já carregada por `getCurrentSession()` dentro da
   própria função, em vez de buscá-la de novo.
3. O service passa `canReadProjects` como um parâmetro booleano
   (`includeProjectEvents`) para `timelineRepo.listClientTimeline`.
4. O repository, e só ele, decide o SQL: sem a flag, comportamento
   **idêntico** ao anterior (nem monta a segunda subquery); com a flag, monta
   um `UNION ALL` entre eventos de Cliente e eventos de Projeto e ordena o
   resultado unido.

`client-timeline-repository.ts` importa apenas a tabela `projects` de
`@/server/db/schema` (dado estrutural puro) — **não** importa
`project-service.ts` nem `project-access.ts`. `client-service.ts` também não
importa nada de Projetos além do `can()` genérico já usado em várias páginas.
Nenhuma dependência circular `ClientService ↔ ProjectService` foi criada.

## 4. Como `client:read` funciona

Inalterado: `authorizeClientSession` (sessão válida, membership ativa,
`scope="org"`, `client:read`, mais `client:write` se `access="write"`)
continua sendo o único portão de entrada de `listClientTimeline`/
`getClientWorkspace`. Quem só tem `client:read` recebe `canReadProjects=false`
e a query nunca referencia `projects`/eventos de Projeto.

## 5. Como `project:read` funciona

Verificado com o `can()` genérico (o mesmo helper usado em
`authorizeProjectSession`), sobre as permissões já resolvidas na sessão desta
chamada — **não** chama `authorizeProjectSession` nem qualquer função de
Projetos, porque `client:read` (exigido por `authorizeClientSession`, que já
rodou com sucesso antes) e `scope="org"` já são garantidos pela própria
`authorizeClientSession`; a única checagem que falta para equivaler à política
de leitura de Projetos é `project:read`, que é exatamente o que `can()` testa.

## 6. Como org isolation é garantido

Nunca por RLS (a conexão do Drizzle é `BYPASSRLS`) e nunca por
`payload.clientId` (não é autoridade). A subquery de eventos de Projeto exige,
simultaneamente: `activity_events.org_id = orgId` (org da sessão atual),
`projects.org_id = orgId` (o projeto join precisa pertencer à mesma org —
é isso que barra um evento com `org_id` forjado para a org atual mas apontando
para um projeto real de outra org, ver teste E) e `projects.client_id =
clientId` (o cliente cuja ficha está sendo vista). O `INNER JOIN` em `projects`
com essas três condições é a autorização — nenhuma etapa depende da policy de
RLS para impedir vazamento.

## 7. Como a união de eventos foi implementada

`drizzle-orm/pg-core` exporta `unionAll`, que combina duas `select` queries
inteiras (cada uma já com seus próprios `where`/`join`) num único fluxo, ainda
ordenável/paginável (`orderBy`/`limit` continuam disponíveis depois do union —
só `where`/`join`/`having`/`groupBy` ficam bloqueados no resultado do union,
o que não é um problema aqui porque cada subquery já tem os seus). O resultado
é envolvido como subquery nomeada (`.as("client_timeline_combined")`) para que
uma consulta externa possa aplicar `ORDER BY`/`LIMIT`/`COUNT` sobre o fluxo já
unificado — meia dúzia de linhas de SQL gerado, uma única viagem ao banco por
página. Sem a flag `includeProjectEvents`, nenhuma dessas subqueries extras é
sequer construída — o caminho sem Projetos permanece byte-a-byte o código
anterior.

## 8. Como paginação funciona

Mantida a estratégia cumulativa já existente da timeline de Clientes
(`LIMIT = page * pageSize`, "Carregar mais" pede a janela inteira de novo, sem
OFFSET) — não é a janela fixa que a timeline do próprio Projeto usa, e o
pedido (§8) autorizou continuar com "a estratégia atual". A diferença central
pedida foi respeitada: o `LIMIT`/`COUNT` agora atua **sobre o fluxo já unido**
(uma única consulta), nunca como `LIMIT` client + `LIMIT` projeto somados
depois. Teste G comprova: 15 eventos de cada fonte (30 no total) devolvem
exatamente 20 linhas na página 1 e `total: 30`, nunca 40 nem duas listas de 20.

## 9. Como ordenação funciona

`ORDER BY occurred_at DESC, id DESC` aplicado à subquery unida — cliente e
projeto competem pela mesma ordenação, sem nenhuma etapa de merge em memória
no lado da aplicação. Teste H usa timestamps explícitos intercalados
(evento de cliente, evento de projeto, evento de cliente, evento de projeto)
e confirma a ordem exata devolvida pelo banco.

## 10. Como evitou N+1

Nome do projeto (`projectName`) vem do próprio `INNER JOIN` na subquery de
eventos de Projeto — nunca é buscado linha a linha para cada evento. Duas
subqueries + uma consulta de `COUNT` sobre a união = no máximo 2 idas ao banco
por chamada (rows + total), igual ao padrão anterior da timeline de Clientes;
nenhuma consulta adicional por evento.

## 11. Eventos de Projeto mapeados para a UI

`ClientTimelineEntry` ganhou `projectName: string | null` (null para eventos
do próprio Cliente). Em
[client-timeline.tsx](../src/components/clients/client-timeline.tsx), quando
`projectName` existe, o título passa a ser `"${projectName} — ${tradução do
kind}"` (reaproveitando `translateProjectEventKind`, já usado na timeline do
próprio Projeto) em vez de `translateClientEventKind` (que não reconhece kinds
de Projeto e cairia no genérico "Atividade registrada"). O `summary` já
gravado pelo producer de Projetos continua sendo mostrado como segunda linha,
sem alteração. Nenhum `kind` cru, UUID, JSON ou payload aparece — só título
traduzido + resumo humano já existente + ator + data/hora, mesmo contrato da
timeline original.

## 12. Testes novos

[tests/integration/client-project-timeline.test.ts](../tests/integration/client-project-timeline.test.ts)
— 10 testes, contra Postgres real (PGlite) com migrations 0001–0004 aplicadas:

| # | Cenário | Cobre |
|---|---|---|
| A | `client:read` sem `project:read` | só eventos do cliente; sem nome/ID/contagem de Projetos no JSON |
| B | `client:read` + `project:read` | ambos os tipos de evento juntos, com `projectName` resolvido |
| C/D | Projeto do mesmo cliente aparece; de outro cliente da mesma org, não | isolamento por `client_id` |
| E | Evento de Projeto de outra org forjado com `org_id` da org atual | join exige `projects.org_id = orgId`; nunca aparece |
| F | Evento de Projeto órfão (sem linha em `projects`) | `INNER JOIN` exclui, sem exceção nem exclusão manual |
| G | 30 eventos (15+15) → página 1 tem exatamente 20, `total=30` | paginação sobre o fluxo unido, não somada |
| H | Timestamps intercalados entre cliente/projeto | ordenação cronológica única correta |
| I | Sem duplicação | nenhum ID repetido na página |
| J | `getClientWorkspace` | regressão — continua compondo cliente+contatos+timeline consolidada |

## 13. Total final de testes

**318 aprovados, 1 pulado** (17 arquivos: 16 aprovados, 1 com teste pulado) —
309+1 do Checkpoint D mais os 9 casos novos (o teste J de regressão soma-se
aos 8 de A–I; a tabela lista 9 linhas porque C/D estão combinados em um único
`it`). `test:foundation` permanece **210 aprovados**, sem alteração — o novo
arquivo de teste não foi incluído nesse script, seguindo o mesmo padrão já
existente (`client-service.test.ts`, que cobre a timeline original de
Clientes, também não está em `test:foundation`).

## 14. lint

`npm run lint`: **0 erros, 0 avisos.**

## 15. typecheck

`npm run typecheck`: limpo. A tipagem do `UNION ALL` (`unionAll` de
`drizzle-orm/pg-core`, subquery `.as()`, `sql<string | null>\`null::text\`.as(...)`
para casar o tipo da coluna `projectName` entre os dois ramos) compilou sem
`any`/cast forçado.

## 16. test

`npm run test`: **318 aprovados, 1 pulado** (17 arquivos).

## 17. test:foundation

`npm run test:foundation`: **210 aprovados**, 0 falhas (7 arquivos) — idêntico
ao Checkpoint D.

## 18. build

`npm run build` (após `rm -rf .next`): **concluído com sucesso**. Mesmas rotas
de antes, nenhuma rota nova, nenhuma regressão.

## 19. git diff --stat

```
 README.md                                          |  11 ++
 docs/banco.md                                      |  10 ++
 docs/roadmap.md                                    |  22 +++
 docs/seguranca.md                                  |  15 ++
 package.json                                       |   2 +-
 src/app/(app)/clientes/[id]/page.tsx               |  28 ++-
 src/app/(app)/projetos/page.tsx                    | 187 ++++++++++++++++++++-
 src/components/clients/client-timeline.tsx         |   5 +-
 src/components/layout/sidebar.tsx                  |   1 +
 src/config/navigation.ts                           |  15 +-
 src/server/db/migrations/meta/_journal.json        |   7 +
 src/server/db/schema/index.ts                      |   1 +
 src/server/repositories/client-timeline-repository.ts |  76 +++++++--
 src/server/services/client-service.ts              |  21 ++-
 src/server/services/service-error.ts               |   2 +
 tests/integration/schema-reconciliation.test.ts    |   7 +-
 16 files changed, 368 insertions(+), 42 deletions(-)
```

(Linhas anteriores a este checkpoint — `projetos/page.tsx`/sidebar/
service-error/journal/schema index/reconciliação/navigation — são do
Checkpoint D, não deste D.1. As únicas mudanças de **código** do D.1 são:
`client-timeline-repository.ts`, `client-service.ts` e `client-timeline.tsx`.
README/roadmap/seguranca ganharam mais algumas linhas nesta etapa só para
corrigir o texto que ainda apontava a lacuna como pendente (ver §23) —
`docs/banco.md` não foi tocado no D.1. `tests/integration/client-project-timeline.test.ts`
é novo e não aparece no diffstat de arquivos rastreados.)

## 20. git status

Sem staging, sem commit. `HEAD` continua em `5d68be6`. Único arquivo novo
desta etapa além do já listado: este relatório e o arquivo de teste.

## 21. Confirmação: nenhuma migration foi criada

Confirmado — nenhum arquivo em `src/server/db/migrations/` foi criado ou
alterado nesta etapa (o `_journal.json` mostrado no diffstat é a mudança já
existente desde o Checkpoint C1/D, não uma nova entrada). `0004_projects.sql`
permanece a única migration de Projetos, inalterada.

## 22. Confirmação: nenhum commit/push/deploy foi feito

Confirmado por `git status` (§20) — árvore de trabalho não commitada,
`HEAD` inalterado, nenhum `git add`/`git commit`/`git push` executado.

## 23. Pendências restantes

1. **QA visual autenticado** — continua pendente pela mesma razão dos
   Checkpoints anteriores (sem sessão autenticada disponível nesta sessão).
   Não tentei gerar magic link, senha, cookie ou token, conforme instruído.
2. As demais pendências já registradas no Checkpoint D (§40, itens 3–4:
   decisões de escopo do C2 não revertidas; filtros de UI sem suíte de teste
   dedicada) continuam as mesmas — nada mudou nelas nesta etapa.
3. **Nota de transparência:** além do código pedido, corrigi três frases em
   README.md, docs/roadmap.md e docs/seguranca.md que ainda descreviam a
   consolidação da timeline como pendente (escritas no Checkpoint D, antes
   desta correção) — passavam a ser factualmente erradas assim que o código
   mudou. Isso não estava nos 24 itens do relatório pedido; se preferir que eu
   reverta essas três frases e deixe a atualização de documentação para uma
   etapa separada, posso desfazer.

## 24. Recomendação final para publicação

O gap específico que motivou este D.1 está **corrigido e testado**: a
Timeline da Ficha Mestre do Cliente agora consolida eventos de Cliente e de
Projetos do mesmo cliente, com autorização correta (`client:read` sozinho não
vê nada de Projetos; `client:read`+`project:read` vê os dois), org/cliente
isolados por `JOIN` explícito (não por RLS nem por payload), sem duplicar
eventos, sem N+1, com paginação e ordenação corretas sobre um único fluxo
cronológico. Lint/typecheck/testes/foundation/build verdes.

Resta apenas a mesma pendência de ambiente já conhecida — QA visual
autenticado — que não é um risco de código. Tecnicamente pronto para
publicação, sujeito à sua aprovação final e à decisão sobre essa pendência de
QA visual.

Parando aqui. Sem commit/push/deploy. Aguardando aprovação.
