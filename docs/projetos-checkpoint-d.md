# Projetos — Checkpoint D: finalização e QA técnico

Data: 15/09/2026. Escopo autorizado: revisão final, segurança, regressão de
Clientes, navegação, QA visual quando disponível, responsividade estrutural,
acessibilidade, performance, lint, typecheck, testes, foundation, build e
documentação. **Sem commit/push/PR/deploy.**

## 1. Estado inicial

HEAD em `5d68be6` (Clientes). `git status`/`git diff --stat` no início deste
checkpoint eram **idênticos** ao fim do Checkpoint C2: mesmos arquivos
modificados (README, banco, roadmap, segurança, `package.json`, journal,
schema index, `service-error.ts`, teste de reconciliação, `clientes/[id]/page.tsx`,
`projetos/page.tsx`, `navigation.ts`) e os mesmos arquivos novos untracked de
fundação e UI de Projetos. Releitura confirmada dos Checkpoints A, B, C1 e C2
antes de qualquer ação. Nenhuma decisão anterior foi reaberta, exceto os dois
bugs comprovados descritos no §27.

Um arquivo solto e não documentado, `.tmp-rls-check.mjs` (script avulso de
verificação RLS contra o banco real, sempre com rollback — mesmo padrão do
Checkpoint C1, aparentemente não removido a tempo), foi encontrado na raiz do
projeto no início desta etapa, gerando 2 avisos de lint. Não foi executado
(RLS já validada em produção no C1; nenhuma mudança de RLS neste checkpoint).
Ele desapareceu do disco por conta própria durante a sessão (provavelmente
sincronização do OneDrive limpando um arquivo temporário) — confirmado pela
ausência em `git status` e por `npm run lint` voltar a ficar 100% limpo (0
avisos) depois disso. Nenhuma ação deste checkpoint o removeu.

## 2. Arquivos alterados no D

- [src/components/layout/sidebar.tsx](../src/components/layout/sidebar.tsx):
  `aria-label` no botão icon-only de recolher/expandir o menu lateral (pendência
  pré-existente, item 32 do pedido — correção isolada, sem refatorar a sidebar).
- [src/components/projects/project-filters.tsx](../src/components/projects/project-filters.tsx):
  adicionados os filtros **Prioridade** e **Somente vencidos**, que já existiam
  por completo no schema/repository/contagens desde os Checkpoints A/B mas
  nunca tinham controle na UI — bug comprovado de escopo incompleto, não uma
  decisão registrada em C2 (ver §16 e §27).
- [src/app/(app)/projetos/page.tsx](../src/app/(app)/projetos/page.tsx):
  `hasActiveFilters` passou a considerar também `priority` e `overdue`, para o
  texto correto de estado vazio (“nenhum projeto encontrado” vs. “nenhum
  projeto cadastrado”).
- Este relatório.

Nenhuma migration, RLS, policy, grant, schema, service, repository ou regra de
negócio foi alterada. Nenhum arquivo de Clientes fora de `clientes/[id]/page.tsx`
(já modificado desde C2) foi tocado.

## 3. Navegação

Confirmado em `src/config/navigation.ts`: Projetos é `status: "available"`,
sem `phase`/badge, com `permission: ["project:read", "client:read"]` — as duas
exigidas juntas via `every()` em `isNavItemVisible`. Suporte, Domínios e
Infraestrutura continuam `planned`, não ativados. `tests/unit/navigation.test.ts`
(6 testes) cobre: Projetos some com só uma permissão, some sem nenhuma, aparece
com as duas; Clientes e Equipe sem regressão. Reexecutado nesta etapa — verde.

## 4. Busca global

`src/components/ui/search.tsx` usa `getVisibleFlatNavigation(permissions)`, a
mesma função da sidebar — Projetos aparece automaticamente como destino quando
autorizado, sem nenhuma mudança adicional necessária. Confirmado que continua
sendo busca de módulos/destinos, não de registros de Projetos.

## 5. Dashboard / regressão

`src/app/(app)/dashboard/page.tsx` **não foi alterado** nesta etapa nem em C2.
Os cinco KpiCards (Membros, Clientes ativos, Leads, Faturamento, Chamados)
continuam os mesmos; nenhum KPI de Projetos foi adicionado, conforme decisão
registrada em C2 §23 e reconfirmada aqui — a expansão do Dashboard operacional
fica para depois de Suporte/Domínios/Infraestrutura.

## 6. Integração com a Ficha Mestre do Cliente

Revisado `src/app/(app)/clientes/[id]/page.tsx`: `canReadProjects` é calculado
em memória (`authorizeProjectSession(session, "read").ok`, sem consulta) antes
de qualquer chamada a `listProjects`. Quando falso, `listProjects` **nunca é
chamado** — a aba renderiza `ClientProjectsForbidden` (Alert genérico, sem
número, nome ou contagem). Quando verdadeiro, `ClientProjectsTab` mostra
listagem paginada (25/página) com status, responsável, prazo (com indicador de
atraso) e CTA “Novo projeto” condicionado a `project:write`, apontando para
`/projetos/novo?cliente=<id>`. Nenhum dado de Projetos aparece no HTML/RSC sem
autorização — confirmado pela ausência de chamada ao service, não apenas por
CSS escondendo a aba.

## 7. Timeline consolidada — achado significativo

**A timeline da própria Ficha de Projeto está correta** (`ProjectTimeline` +
`listProjectTimeline`, org+projeto explícitos, janelas fixas de 20, tradução
em português, sem UUID/JSON).

**Porém a aba “Timeline” da Ficha Mestre do *Cliente* não inclui eventos de
Projetos.** Inspecionado
[client-timeline-repository.ts](../src/server/repositories/client-timeline-repository.ts):
a query filtra exclusivamente `entity_type = 'client'`. Não há nenhum join ou
união com `projects`/eventos `entity_type='project'`. Isso diverge do que o
Checkpoint A §21 descreveu como parte do escopo (“Timeline do Cliente combina
eventos próprios com eventos de Projetos via join... autorização de Projetos”)
e do que o próprio pedido deste Checkpoint D (item 8) pede para confirmar.

Não é um vazamento de segurança (a timeline do Cliente simplesmente omite
esses eventos por completo, para todo mundo) — é uma lacuna de escopo entre o
que foi aprovado no Checkpoint A e o que foi implementado no C2, que o
relatório de C2 não registrou como decisão consciente (ao contrário de outras
omissões do C2, como a ausência de filtro de Cliente na listagem ou o KPI do
Dashboard, que foram explicitamente justificadas).

**Decisão tomada nesta etapa: não implementar agora.** Motivos: (1) exigiria
nova lógica de authorization/branching dentro de `client-timeline-repository.ts`
— hoje um arquivo puro de Clientes, módulo de produção que o próprio pedido
pede para não arriscar; (2) o pedido deste checkpoint é finalização/QA, não
nova implementação (“NÃO REABRIR A–C2” / item 38); (3) o risco de introduzir
uma regressão em Clientes para fechar uma lacuna de Projetos não parece
justificado sem aprovação explícita. Registrado aqui como pendência para
decisão do usuário, não corrigido silenciosamente nem ignorado.

## 8. Timeline de Projeto (a própria ficha)

Confirmado: ordenação `occurred_at DESC, id DESC`; paginação em janelas fixas
de 20 (`Pagination` real, Anterior/Próxima, não “carregar mais” cumulativo);
`translateProjectEventKind` traduz todos os 6 kinds para português; ator
(`actorName ?? "Sistema"`) e data/hora `pt-BR`; `before`/`after` nunca
aparecem na UI (só no payload interno do evento, usado apenas para auditoria);
sem UUID, JSON ou nomes técnicos visíveis.

## 9. Status actions

Revisado `project-service.ts` (`mutate`) e `status-actions.tsx`:

- **Concluir:** `status="completed"`, `progress=100`, `completedAt=new Date()`
  no servidor — a UI nunca envia esses valores diretamente.
- **Cancelar:** `status="cancelled"`, `completedAt=null`, progresso anterior
  preservado.
- **Reabrir:** exige status final; `status="active"`, `completedAt=null`,
  `progress=null`.
- Todas passam por `requireAccess("write")` (autorização), lock de linha por
  versão (`lockProject` com `FOR UPDATE`), confirmação em `Modal` no cliente,
  evento (`recordProjectEvent`) e auditoria (`recordProjectAudit`) na mesma
  transação Drizzle (`getDb().transaction`).

## 10. Concorrência

`tests/integration/project-concurrency.test.ts` (parte de `npm run test` e
`test:foundation`) reexecutado nesta etapa — verde. Cenário: duas leituras da
mesma `version`, uma escrita vence e avança para `version+1`, a segunda recebe
`conflict` sem sobrescrever nada. `updateProjectAction` traduz `code:"conflict"`
para a mensagem “Este projeto foi atualizado por outro usuário. Atualize a
página antes de salvar novamente.” com botão **Recarregar dados**
(`router.refresh()`). Contenção real de duas conexões PostgreSQL simultâneas
contra o banco real já foi validada com fixtures efêmeras no Checkpoint C1
(28/28 asserções, incluindo version stale/pulo/sem-avanço); não repetida aqui
por não haver mudança de schema/trigger nesta etapa e por exigir acesso
privilegiado ao banco de produção, fora do escopo de QA de UI.

## 11. Matriz de permissions

`authorizeProjectSession` (ver
[project-access.ts](../src/lib/auth/project-access.ts)) exige: sessão válida,
membership ativa, `scope="org"`, `project:read` **e** `client:read` (leitura);
soma `project:write` (escrita). `scope="assigned"` é negado mesmo com todas as
permissões — sem exceção para super admin (o resolver central de sessão trata
super admin antes desta função, não aqui). Coberto por
`tests/integration/project-foundation.test.ts`/`project-service.test.ts` e,
contra o banco real, pelas 28 asserções do Checkpoint C1 (sem `project:read`
nem `client:read` → 0 linhas; só um dos dois → 0 linhas; ambos → visível;
`assigned` → negado; membership inativa → negado). Nenhuma mudança nesta etapa.

## 12. Cross-org

Toda função de repository recebe `orgId` explícito e o aplica em `where`/joins
(`project-repository.ts`, `project-timeline-repository.ts`) — nenhuma consulta
depende só de RLS. `getProjectDetail`/`getProjectWorkspace` retornam
`not_found` genérico para ID de outra org (mesmo código de UUID inválido/
inexistente). Validado contra o banco real no Checkpoint C1 (usuário de org B
não vê projeto de org A nem por listagem nem por ID direto). Não alterado
nesta etapa.

## 13. BYPASSRLS — revisão de org explícita

Reli linha a linha as duas funções de query (`project-repository.ts`,
`project-timeline-repository.ts`) e os agregadores do service
(`getProjectsPageData`, `getProjectWorkspace`, `getProjectCounts`,
`listProjectClients`, `listAvailableProjectOwners`): **todas** recebem `orgId`
como parâmetro obrigatório e o usam em pelo menos uma condição de `where`
(count, listagem, detalhe, lock, cliente, owner, seletor de cliente, KPI,
timeline). Não encontrada nenhuma chamada de repository sem org explícita. A
conexão do Drizzle usa a role privilegiada (`BYPASSRLS`), então essa disciplina
na aplicação é a única proteção real — RLS no banco é defesa em profundidade,
já validada separadamente no C1.

## 14. Query review / N+1

`getProjectsPageData` e `getProjectWorkspace` usam `Promise.all`/chamadas
sequenciais únicas — nenhuma busca por linha da tabela. `listProjects` já
resolve `clientName`/`ownerName` com `LEFT JOIN` numa única query. Timeline usa
`LIMIT`/`OFFSET` reais. `ClientSelector` só consulta ao abrir o modal (debounce
de 250 ms), não a cada render da página. Nenhum N+1 encontrado em
`/projetos`, `/projetos/[id]` ou na aba Projetos de Clientes.

## 15. Filtros — 2 bugs comprovados corrigidos

Revalidando item a item do pedido: busca (nome do projeto/cliente, `ILIKE`
escapado) ok; cliente (via `?cliente=` na pré-seleção do formulário, decisão
registrada em C2 de não ter dropdown na listagem) ok; responsável e “sem
responsável” ok; sort ok; paginação ok. **Dois filtros que já existiam
completos no schema/repository desde os Checkpoints A/B nunca tinham controle
na UI:**

1. **Prioridade** — `ProjectFilters` não tinha nenhum `Select` para `priority`,
   mesmo o repository/schema suportando desde a fundação.
2. **Vencidos** — idem para `overdue`: contagem de KPI (`getProjectCounts`)
   já calculava, repository já filtrava, mas não havia nenhum controle
   (`checkbox`/toggle) para o usuário ativar `?overdue=true`.

Ambos corrigidos nesta etapa (§2), seguindo o mesmo padrão visual dos filtros
existentes (`Select` para prioridade, `Checkbox` — mesmo componente já usado em
Clientes/contatos — para vencidos). `hasActiveFilters` em `/projetos/page.tsx`
atualizado para considerar os dois no texto do estado vazio. Combinações de
filtros usam os mesmos predicados em listagem e contagem (`conditions()`
único, reaproveitado por `listProjects` e `countProjects`). URL preserva
estado (query string); back/forward funcionam por serem navegação real
(`router.push`), não estado local.

## 16. Paginação

25/página em `/projetos` e na aba do Cliente; 20/janela na timeline. Mesmo
componente `Pagination` reaproveitado nos três lugares. `projectPage()` faz
`Math.min(page, Math.max(1, Math.ceil(total/size)))` — nunca uma página maior
que o total real.

## 17. Overdue (definição)

`isProjectOverdue`/a constante `overdue` do repository usam exatamente:
`due_date < hoje em America/Sao_Paulo` **e** status fora de
`completed`/`cancelled`. `paused` com prazo vencido continua atrasado (não há
exclusão especial para `paused`). Nenhuma dependência do timezone do
navegador — `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })`
no client component, mesma regra SQL no repository.

## 18. Page bounds

`projectPaginationSchema`/`projectVersionSchema` normalizam página/versão via
`normalizeProjectNumber` com `.catch(1)` — página 0, negativa, string ou não
numérica caem para 1. Página muito maior que o total é clampada por
`projectPage()` no repository antes da query. Nenhuma renderização de página
vazia incoerente.

## 19. Client selector

`ClientSelector` nunca carrega todos os clientes: abre modal, busca
server-side (`searchProjectClientsAction` → `listProjectClients`, 25 por
consulta, org isolada, exige `client:read` via `requireAccess`), acumula
páginas com “Carregar mais”. Cliente pré-selecionado fora da primeira página
funciona porque `initialClient` é resolvido separadamente (por ID, via
`getProjectClient`) e injetado como opção já selecionada, sem precisar estar
na primeira página de busca.

## 20. Novo projeto com cliente pré-selecionado

`/projetos/novo?cliente=<id>` (`novo/page.tsx`): o ID da URL é resolvido por
`getProjectClient` (autorizado, org explícita) **antes** de aparecer no
formulário; se inválido/de outra org, a pré-seleção é ignorada silenciosamente
(página não quebra) — nunca tratado como autoridade. No submit,
`createProject` (service) roda `ensureClient` de novo, independente do que a
UI mostrou.

## 21. 404

`getProjectDetail`/`getProjectWorkspace` lançam `ServiceError("not_found")`
para UUID inválido, ID inexistente ou projeto de outra org — sempre o mesmo
código, capturado pela página via `notFound()`, renderizando
`[id]/not-found.tsx` com texto idêntico independente da causa real. Testado
estruturalmente nesta etapa navegando para
`/projetos/00000000-0000-0000-0000-000000000000` sem sessão (redireciona para
login antes de chegar à lógica de 404, como esperado — ver §26).

## 22. Forbidden

Todas as entradas do service (`listProjects`, `getProjectDetail`,
`getProjectWorkspace`, `createProject`, `updateProject`,
`changeProjectStatus`, `reopenProject`, etc.) chamam `requireAccess()` **antes**
de qualquer query ao repository — `ServiceError("forbidden")` é lançado sem
nunca ter consultado o projeto. Nas páginas, `authorizeProjectSession` é
chamado antes de `getProjectWorkspace`/`getProjectDetail`/`listProjects`.
Nenhum caminho consulta o projeto primeiro para depois negar.

## 23. Empty states

Revisados: nenhum projeto cadastrado (com CTA condicionado a `project:write`);
nenhum resultado após filtro (mensagem distinta, sem CTA de criar); timeline
vazia (`ProjectTimeline` com `EmptyState`); cliente sem projetos
(`ClientProjectsTab`); responsável ausente (`"—"` / `"Sem responsável"`, nunca
confundido com erro).

## 24. Progresso: NULL vs. 0 vs. 100

Confirmado em três lugares — ficha (`project.progress === null ? "Não
informado" : `${project.progress}%``), formulário (`defaultValue={... ??
""}`, nunca `0`) e eventos (`progress_changed` summary usa o mesmo ternário
`null → "Não informado"`). Nenhum `if (progress)`/`progress ||` que
confundiria `0` com ausência.

## 25. Datas

`start_date`/`due_date` são `DATE` puro (`YYYY-MM-DD`), formatados por split de
string em `formatProjectDate` — nunca passam por `new Date()`/timezone, sem
deslocamento de calendário. `completed_at`/`created_at`/`updated_at` são
`TIMESTAMPTZ`, formatados com `Intl.DateTimeFormat("pt-BR", {dateStyle,
timeStyle})` de forma consistente em toda a UI (ficha de Projeto, listagem,
aba do Cliente).

## 26. Responsividade

**Estrutural apenas — sem sessão autenticada disponível nesta sessão** (ver
§38). Confirmado por leitura de código: tabela desktop (`hidden lg:block`) e
cards mobile/tablet (`space-y-3 lg:hidden`) no mesmo breakpoint (`lg`) usado em
Clientes; formulário `max-w-3xl` com grid `sm:grid-cols-2` colapsando para uma
coluna abaixo de `sm`; ficha com `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
Verificado ao vivo, sem login, que `/projetos`, `/projetos/novo`,
`/projetos/[id]` e `/projetos/[id]/editar` redirecionam para `/login?next=...`
sem erro 500/console/servidor em nenhuma das quatro rotas (screenshots
tiradas). Não foi possível renderizar as páginas reais nas cinco resoluções
pedidas (1440/1280×720/1024/768/375) por falta de sessão.

## 27. QA 1280×720

Mesma limitação do §26 — não verificado visualmente. Estruturalmente, os
mesmos breakpoints (`sm`/`lg`) usados em Clientes (já validados nessa
resolução no Checkpoint 3 de Clientes) foram reaproveitados sem alteração
específica para Projetos.

## 28. QA mobile

Mesma limitação. Estruturalmente: listagem vira cards (não tabela forçada),
`ClientSelector`/`Select`s ocupam largura total abaixo de `sm`, badges/botões
usam os componentes já responsivos do design system, timeline usa a mesma
lista vertical em qualquer largura.

## 29. Acessibilidade

- Labels associados via `htmlFor`/`id` em todos os campos de `ProjectForm`.
- `aria-label` em buscas/filtros sem label visível (`ProjectFilters`,
  `ClientSelector`), incluindo os dois novos controles adicionados nesta etapa
  (`aria-label="Filtrar por prioridade"` no Select; o checkbox de vencidos usa
  `<label>` envolvendo `<Checkbox>`, mesmo padrão de
  `contact-form.tsx`).
- Botões icon-only: `Ver ações`/fechar modal herdam `aria-label`/`sr-only` dos
  componentes `ui/` já auditados.
- **Corrigido nesta etapa:** botão de recolher/expandir a sidebar (pendência
  pré-existente, não introduzida por Projetos) — agora tem
  `aria-label="Recolher menu lateral"`/`"Expandir menu lateral"` conforme o
  estado (§2).
- `Select`, `Modal`, `Tabs`, `Checkbox` são primitivas Radix (acessíveis por
  padrão) reaproveitadas sem modificação.
- **Não verificado nesta etapa:** navegação por teclado/leitor de tela numa
  sessão viva (mesma limitação do §38).

## 30. Correções encontradas

1. Dois filtros (`prioridade`, `vencidos`) existentes no backend desde a
   fundação sem controle na UI (§15) — **corrigido**.
2. `aria-label` ausente no toggle da sidebar, pendência pré-existente
   explicitamente autorizada para correção neste checkpoint (§29) —
   **corrigido**.
3. Timeline da Ficha Mestre do Cliente não inclui eventos de Projetos, ao
   contrário do que o Checkpoint A descreveu (§7) — **não corrigido, reportado
   como pendência para decisão do usuário** (fora do critério de “bug
   isolado e de baixo risco” usado nos itens 1–2; toca um repository de
   Clientes em produção).
4. Arquivo solto `.tmp-rls-check.mjs` fora do padrão documentado — **resolvido
   sozinho** (desapareceu do disco durante a sessão; não removido por mim).

## 31. Bugs corrigidos

Ver §2 e §30, itens 1–2. Nenhuma migration, schema, RLS, service ou
repository foi alterado — apenas dois componentes de UI e um arquivo de
listagem.

## 32. Regressão de Clientes

- `src/app/(app)/clientes/[id]/page.tsx`: única mudança é a aba Projetos
  (leitura condicionada, sem afetar cadastro/contatos/timeline/visão geral).
- Nenhum outro arquivo de Clientes (`client-service.ts`, `client-repository.ts`,
  `client-access.ts`, `client-timeline-repository.ts`, componentes de
  `components/clients/*`) foi alterado nesta etapa nem em C2 — confirmado por
  `git status`/leitura.
- Testes de Clientes (`tests/integration/client-foundation.test.ts`, suíte de
  serviço em `tests/test` geral) continuam na mesma suíte executada em §33 —
  todos passando, nenhuma falha nova.
- Dashboard (KPI de Clientes ativos) inalterado (§5).

## 33. lint

`npm run lint`: **0 erros, 0 avisos** (o arquivo solto do §1 que gerava 2
avisos já não existe mais).

## 34. typecheck

`npm run typecheck` (`tsc --noEmit`): limpo, sem erros.

## 35. tests

`npm run test`: **309 aprovados, 1 pulado** (16 arquivos: 15 aprovados, 1 com
teste pulado) — idêntico ao total do Checkpoint C2, reexecutado após as
correções do §2 sem regressão.

## 36. foundation

`npm run test:foundation`: **210 aprovados**, 0 falhas (7 arquivos) — idêntico
ao Checkpoint C2.

## 37. build

`npm run build` (após `rm -rf .next`, mesmo procedimento documentado desde o
Checkpoint B por causa do bloqueio de sincronização do OneDrive sobre
`.next`): **concluído com sucesso**, duas vezes nesta etapa (antes e depois
das correções do §2). Rotas confirmadas no manifesto: `/projetos`,
`/projetos/novo`, `/projetos/[id]`, `/projetos/[id]/editar`, todas dinâmicas,
mais todas as rotas existentes sem regressão.

## 38. Total final de testes

**309 aprovados + 1 pulado** (suíte completa), **210 aprovados** (foundation).
Nenhuma mudança de contagem em relação ao Checkpoint C2 — as correções desta
etapa foram de UI/exibição, sem cobertura de teste automatizado dedicada (ver
§41, pendência).

## 39. Documentação

Criado este relatório
([docs/projetos-checkpoint-d.md](projetos-checkpoint-d.md)). Atualizações
mínimas e factuais em README.md, docs/roadmap.md, docs/banco.md e
docs/seguranca.md apontando para o Checkpoint D e registrando o estado atual
(implementação funcional concluída localmente, QA visual autenticado
pendente) — sem marcar a Fase 1 como concluída.

## 40. Pendências

1. **QA visual autenticado** (responsividade real nas 5 resoluções, teclado/
   leitor de tela em sessão viva, fluxo ponta a ponta Cliente → Novo Projeto →
   Ficha → Editar → Timeline → voltar ao Cliente) — bloqueado por falta de
   sessão autenticada disponível nesta sessão. Ver §41 para o motivo exato.
2. **Timeline consolidada do Cliente não inclui eventos de Projetos** (§7) —
   decisão registrada em C2 não documentou essa omissão como escolha
   consciente; diverge do Checkpoint A. Requer decisão do usuário: implementar
   como extensão aprovada, ou aceitar como limitação da V1.
3. Decisões já registradas em C2 e não revertidas: sem filtro dropdown de
   Cliente na listagem principal (C2 §8); KPIs com rótulos reais de status em
   vez de “Aguardando” (C2 §6); Dashboard sem KPI de Projetos (C2 §23, §5
   deste relatório).
4. Sem testes automatizados dedicados para os dois filtros de UI adicionados
   nesta etapa (`ProjectFilters` não tem suíte própria, mesmo padrão de antes
   desta etapa — o componente já não era testado isoladamente).

## 41. QA visual autenticado: executado ou pendente

**Pendente.** Verificado sem login: `/projetos`, `/projetos/novo`,
`/projetos/[id]` (com UUID válido de teste) e `/projetos/[id]/editar`
redirecionam corretamente para `/login?next=...`, sem erro 500 nem erro de
console/servidor (screenshots tiradas via Browser pane, logs do dev server
conferidos). `npm run build` prova que todo o código (imports, JSX, Server
Actions, dos quatro arquivos de rota e de todos os componentes novos) compila
e resolve sem erro, inclusive os trechos que só executam depois do login.

## 42. Motivo exato da pendência

Esta sessão não possui login real via Supabase Auth/GoTrue (sem senha, sem
cookie de sessão, sem token). Nenhuma sessão autenticada criada manualmente
pelo usuário estava disponível no navegador desta sessão (`tabs_context`
retornou nenhuma aba aberta). Respeitando as instruções explícitas desta
etapa, não foi solicitada nem gerada nenhuma credencial, magic link, cookie ou
token, e o bloqueio de segurança do ambiente que impediu isso no Checkpoint C2
não foi contornado nem testado novamente.

## 43. git diff --stat (final)

```
 README.md                                       |  10 ++
 docs/banco.md                                   |  10 ++
 docs/roadmap.md                                 |  18 +++
 docs/seguranca.md                               |  11 ++
 package.json                                    |   2 +-
 src/app/(app)/clientes/[id]/page.tsx            |  28 +++-
 src/app/(app)/projetos/page.tsx                 | 187 ++++++++++++++++++++++--
 src/components/layout/sidebar.tsx               |   1 +
 src/config/navigation.ts                        |  15 +-
 src/server/db/migrations/meta/_journal.json     |   7 +
 src/server/db/schema/index.ts                   |   1 +
 src/server/services/service-error.ts            |   2 +
 tests/integration/schema-reconciliation.test.ts |   7 +-
 13 files changed, 281 insertions(+), 18 deletions(-)
```

(`src/components/projects/project-filters.tsx`, alterado nesta etapa, é parte
de um diretório ainda não rastreado — não aparece no diffstat acima, que só
cobre arquivos já rastreados pelo Git.)

## 44. git status (final)

Sem staging, sem commit. `HEAD` continua em `5d68be6`. Arquivos novos desta
etapa (não rastreados): este relatório. Todos os demais arquivos untracked são
os já existentes desde B/C1/C2 (fundação + UI de Projetos).

## 45. Recomendação de publicação

**Tecnicamente pronto, com uma pendência de escopo e uma de QA visual —
nenhuma aprovação visual foi inventada.**

Verde: lint, typecheck, testes (309+1), foundation (210), build, segurança
(autorização antes de query, org explícita em toda query, BYPASSRLS revisado,
RLS/cross-org/concorrência já validados contra produção no C1), regressão de
Clientes (nenhum arquivo de Clientes alterado além da integração já existente
da aba Projetos).

Dois pontos pendentes, de naturezas diferentes:

1. **QA visual autenticado** (§40–42) — bloqueado por ambiente, não por
   código. Decisão de publicar sem ele é do usuário.
2. **Timeline consolidada do Cliente sem eventos de Projetos** (§7) — gap real
   entre o que o Checkpoint A descreveu e o que foi entregue; não é um risco
   de segurança (nada vaza, apenas omite), mas é uma funcionalidade do escopo
   original ainda não implementada. Requer decisão explícita: tratar como
   extensão futura aprovada agora, ou publicar V1 sem essa consolidação e
   registrar como limitação conhecida.

Nenhuma migration nova, sem commit/push/PR/deploy. Parando aqui, aguardando
decisão do usuário sobre os dois pontos acima antes de qualquer publicação.
