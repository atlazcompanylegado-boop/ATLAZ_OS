# Suporte — Checkpoint C2.1: correção visual da Timeline consolidada do Cliente

Data: 16/09/2026. Escopo autorizado: correção pontual de apresentação — tradução
humana dos eventos de Suporte na Timeline consolidada da Ficha Mestre do
Cliente. **Sem migration, sem alteração de producers/RLS/services de Suporte,
sem commit/push/deploy.**

## 1. Causa exata da lacuna

`src/components/clients/client-timeline.tsx` só tinha dois ramos de tradução:

```ts
entry.projectName
  ? `${entry.projectName} — ${translateProjectEventKind(entry.kind)}`
  : translateClientEventKind(entry.kind)
```

Eventos de Suporte (`entity_type='ticket'`) sempre chegam com `projectName:
null` (contrato do repository desde o Checkpoint B — o UNION nunca preenche
`projectName` para a fonte `ticket`), então todo evento `ticket.*` caía no
`else` e era traduzido por `translateClientEventKind`, que não conhece nenhum
`kind` de chamado e devolve o fallback genérico `"Atividade registrada"`. Não
era um vazamento de segurança (o `summary` humano gravado pela fundação
continuava aparecendo abaixo do título) — só a tradução do **título** do
evento estava ausente, exatamente como já registrado nos Checkpoints C2 §45 e
§50 (mesma lacuna, nunca fechada).

O componente próprio de Suporte (`ticket-timeline.tsx`, timeline do chamado
individual) já tinha a tradução certa via `translateTicketEventKind` — só
nunca tinha sido conectado ao componente da Timeline consolidada do Cliente.

## 2. Arquivos alterados

- [`src/components/clients/client-timeline.tsx`](../src/components/clients/client-timeline.tsx) — único arquivo de produção tocado (13 linhas).
- [`tests/integration/client-support-timeline.test.ts`](../tests/integration/client-support-timeline.test.ts) — 1 teste novo (item L, integração/PGlite).
- [`tests/unit/client-timeline.test.tsx`](../tests/unit/client-timeline.test.tsx) — arquivo novo, 13 testes (componente).

Nenhum outro arquivo de schema, migration, RLS, producer, repository ou
service foi tocado. `client-timeline-repository.ts`, `client-service.ts`,
`ticket-service.ts`, `ticket-events.ts` permanecem exatamente como estavam
(conferido por `git diff` — sem alteração nesta sessão).

## 3. Helper reutilizado

**Reutilizado, não criado:** `translateTicketEventKind` (`src/lib/support/activity.ts`),
já usado pela Timeline do próprio chamado (`ticket-timeline.tsx`). É um módulo
independente (sem "server-only", sem acoplamento ao componente de Suporte),
então não precisou de nenhuma extração — só um novo import em
`client-timeline.tsx`. Também reutilizado `formatTicketNumber` (`src/lib/support/format.ts`)
para exibir `#1042` em vez do número cru. Nenhuma segunda tradução foi criada
para o mesmo vocabulário de eventos.

## 4. Eventos traduzidos

Os 8 kinds da fundação, todos já cobertos pelo `translateTicketEventKind`
existente (nenhum novo label criado nesta etapa):

| kind | Título agora exibido |
|---|---|
| `ticket.created` | "Chamado #N — Chamado criado" |
| `ticket.updated` | "Chamado #N — Chamado atualizado" |
| `ticket.status_changed` | "Chamado #N — Status alterado" |
| `ticket.priority_changed` | "Chamado #N — Prioridade alterada" |
| `ticket.assignee_changed` | "Chamado #N — Responsável alterado" |
| `ticket.project_changed` | "Chamado #N — Projeto vinculado alterado" |
| `ticket.due_date_changed` | "Chamado #N — Prazo alterado" |
| `ticket.comment_added` | "Chamado #N — Comentário adicionado" |

O detalhe da mudança (`"Aberto → Em atendimento"`, `"Baixa → Crítica"`,
`"Projeto vinculado"`, `"Comentário adicionado"` etc.) já vinha correto da
fundação no campo `summary` — segue aparecendo, inalterado, na segunda linha
(mesmo layout já usado para Cliente/Projeto). Um `kind` desconhecido cai no
fallback humano `"Atividade do chamado"` (nunca a string crua) — testado.

## 5. `ticket_number`

Exibido via `formatTicketNumber()` como `#N`, prefixado por `"Chamado "` —
mesmo identificador humano já usado em toda a UI de Suporte. Obtido do próprio
`ClientTimelineEntry.ticketNumber`, já preenchido pelo `JOIN` consolidado do
repository (fundação, Checkpoint B) — **nenhuma query nova, nenhum lookup por
evento** (ver §10).

## 6. Status labels

Nenhum novo mapeamento criado — o texto exato já vem pronto em `entry.summary`
(gravado pelo `ticket-service.ts` usando `TICKET_STATUS_LABELS`, que já tem
exatamente os seis rótulos pedidos: Aberto/Triagem/Em atendimento/Aguardando
cliente/Resolvido/Cancelado). Confirmado por teste que nenhuma chave técnica
(`in_progress` etc.) aparece na tela.

## 7. Priority labels

Mesmo raciocínio de §6 — `TICKET_PRIORITY_LABELS` já tem exatamente
Baixa/Normal/Alta/Crítica, já usado no `summary` gravado pela fundação.
Confirmado por teste.

## 8. Project masking

**Nenhuma mudança necessária no masking em si** — já era estruturalmente
seguro antes desta correção: `client-timeline-repository.ts` grava
`projectName: NULL_TEXT` para toda linha da fonte `ticket` (nunca preenche o
nome do Projeto ali, com ou sem `project:read`), e `ticket-service.ts` já
grava o `summary` do evento `ticket.project_changed` como texto sempre
genérico ("Projeto vinculado"/"Projeto desvinculado", nunca o nome — ver
`src/server/services/ticket-service.ts:218`). Esta etapa só garantiu que a
**tradução do título** também nunca vaze nada (`"Chamado #N — Projeto
vinculado alterado"`, sem nome/ID) — testado explicitamente (unitário, com uma
string "Projeto Secreto" que nunca aparece) e validado de ponta a ponta com um
teste de integração novo (§13, item L) que cria um projeto de verdade, vincula
a um chamado, e confirma que nem o payload de `listClientTimeline` nem o JSON
serializado contêm o nome ou o UUID do projeto para um usuário sem
`project:read`.

## 9. `comment_added`

Continua mostrando só "Comentário adicionado" — o `summary` gravado pela
fundação nunca inclui o texto do comentário (contrato do Checkpoint B,
inalterado), e a tradução do título (`"Chamado #N — Comentário adicionado"`)
também não introduz conteúdo novo. Testado com uma string de conteúdo
sensível de exemplo, confirmando ausência na tela.

## 10. Revisão de N+1

**Nenhuma consulta nova introduzida.** A correção é puramente de apresentação
(uma função de tradução em memória, chamada por linha já carregada) — não
toca `listClientTimeline`/`client-timeline-repository.ts`, que já resolvia
`ticketNumber` num único `JOIN` consolidado desde o Checkpoint B. Confirmado
por leitura: `client-timeline.tsx` não ganhou nenhum `await`/chamada a
repository/service.

## 11. Segurança do RSC

Teste de integração novo (`tests/integration/client-support-timeline.test.ts`,
item L): usuário com `client:read`+`ticket:read` **sem** `project:read`
chamando `clientService.listClientTimeline` sobre um chamado com projeto
vinculado — o evento `ticket.project_changed` aparece na timeline, mas
`changed.projectName` é `null` e `JSON.stringify(timeline)` não contém nem o
nome ("Projeto Secreto") nem o UUID do projeto. Complementado pelo teste
unitário de componente (§13) que confirma a mesma ausência no `textContent`
renderizado.

## 12. Testes novos

| Arquivo | Testes | Cobre |
|---|---|---|
| `tests/unit/client-timeline.test.tsx` (novo) | 13 | itens 1–4, 7–12 do pedido (§18) + 1 extra (kind desconhecido) |
| `tests/integration/client-support-timeline.test.ts` (item L, novo) | 1 | itens 5, 6 do pedido (masking ponta a ponta, RSC) |
| **Total novo líquido** | **14** | |

Mapeamento direto aos 12 itens pedidos no §18: (1) `ticket.created` traduzido
✅; (2) status traduzido ✅; (3) prioridade traduzida ✅; (4) responsável sem
dado técnico ✅; (5) `project_changed` com `project:read` ✅ (masking
já é idêntico com/sem — texto sempre genérico, confirmado no teste de
integração); (6) `project_changed` sem `project:read` ✅; (7) `comment_added`
sem conteúdo ✅; (8) `ticket_number` humano ✅; (9) nenhum UUID exposto ✅; (10)
client/project/ticket intercalados ✅; (11) regressão Timeline de Projetos ✅;
(12) regressão Timeline de Clientes ✅.

## 13. Total de testes

`npm run test`: **498 aprovados, 2 pulados** (era 485 aprovados + 2 pulados
antes desta etapa — incremento de 13, exatamente os testes novos: 12 originais
mais 1 teste extra de robustez para `kind` desconhecido, mais 1 de integração,
menos nenhum removido).

## 14. `test:foundation`

`npm run test:foundation`: **343 aprovados** (idêntico ao estado anterior —
nem `client-timeline.test.tsx` nem `client-support-timeline.test.ts` fazem
parte da lista de `test:foundation`, mesmo padrão já estabelecido para testes
de UI/timeline consolidada desde o Checkpoint C2).

## 15. lint

`npm run lint`: **0 erros, 0 avisos.**

## 16. typecheck

`npm run typecheck`: limpo.

## 17. build

`npm run build` (após remover `.next`): **concluído com sucesso.** Todas as
27 rotas (incluindo as 4 de Suporte e a Ficha do Cliente) compilam sem erro;
nenhuma rota nova, nenhuma rota quebrada.

## 18. `git diff --stat`

```
 README.md                                          |  12 +-
 docs/banco.md                                      |  12 ++
 docs/roadmap.md                                    |  29 ++-
 docs/seguranca.md                                  |  10 +
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
 18 files changed, 419 insertions(+), 73 deletions(-)
```

(Todos os arquivos além de `client-timeline.tsx` já estavam modificados desde
os Checkpoints anteriores de Suporte, ainda não commitados — esta etapa só
adicionou as 13 linhas de `client-timeline.tsx` a essa lista. O teste novo de
integração está dentro de um arquivo que já era `??` — não aparece no `diff
--stat` de arquivos rastreados.)

## 19. `git status`

Idêntico ao início da sessão, mais: `src/components/clients/client-timeline.tsx`
passou a `M` (modificado), e `tests/unit/client-timeline.test.tsx` apareceu
como `??` (novo). `tests/integration/client-support-timeline.test.ts` já era
`??` desde antes desta sessão — continua `??`. Nada staged, nenhum commit.

## 20. Confirmação: nenhuma migration

Confirmado — `src/server/db/migrations/` não ganhou nenhum arquivo novo nesta
etapa. Nenhum schema Drizzle foi tocado. Nenhum producer, RLS, grant ou
service de Suporte foi alterado (só o componente de apresentação da Timeline
consolidada do Cliente).

## 21. Confirmação: nenhum commit/push/deploy

Confirmado por `git status` (§19) — árvore de trabalho não commitada, nenhum
`git add`/`git commit`/`git push`/`git deploy` executado nesta sessão.

## 22. Recomendação para Checkpoint D

Lacuna visual da Timeline consolidada do Cliente (registrada nos Checkpoints
C2 §45/§50) está fechada: eventos de Suporte agora traduzem para título humano
em português, com identificador `#N` em vez de UUID, sem vazar status/
prioridade técnicos, sem vazar nome/ID de Projeto (com ou sem `project:read`)
e sem vazar conteúdo de comentário — mesma disciplina já usada para Cliente/
Projetos, reutilizando o tradutor já existente de Suporte. Nenhuma decisão de
arquitetura, schema, RLS ou producer foi reaberta. Testes, lint, typecheck e
build verdes.

**Nota lateral (fora do escopo autorizado desta etapa, não tocada):** a mesma
lacuna de tradução ainda existe no lado de Projetos → o texto acima já
registrava, desde o Checkpoint D.1 de Projetos, que a Timeline consolidada do
Cliente não tinha essa tradução; a correção desta etapa resolveu **apenas** o
ramo de Suporte, conforme pedido explícito (§1: "corrigir SOMENTE essa
lacuna"). Não há lacuna de Projetos a fechar aqui — `translateProjectEventKind`
já era chamado corretamente para eventos de Projetos desde antes desta sessão
(confirmado no código lido em §1); a única lacuna real era a ausência do ramo
de Suporte.

Parando aqui, conforme pedido (§22 — regra de parada). Não iniciando o
Checkpoint D automaticamente.
