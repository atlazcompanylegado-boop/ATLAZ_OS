# Domínios — Checkpoint C2: UI completa + integração com Cliente

Data: 16/09/2026. Escopo autorizado: implementação funcional e visual de
Domínios sobre a fundação já aplicada e validada em produção no Checkpoint C1.
**Sem migration nova, sem commit/push/PR/deploy.**

## 1. Estado inicial

HEAD em `74515e4` ("docs: registra hotfix de Suporte em producao"), árvore
idêntica ao fim do Checkpoint C1 (`git status`/`git diff --stat` conferidos
antes de qualquer código novo). Releitura confirmada dos três relatórios de
Domínios (A/B/C1) e dos checkpoints C2/C2.1 de Suporte (mesmo padrão
arquitetural a seguir) antes de começar. Nenhuma decisão de fundação foi
reaberta.

## 2. Arquivos criados

**UI de rotas**
- `src/app/(app)/dominios/actions.ts`, `loading.tsx`, `error.tsx`.
- `src/app/(app)/dominios/novo/page.tsx`.
- `src/app/(app)/dominios/[id]/page.tsx`, `not-found.tsx`, `editar/page.tsx`.

**Componentes** (`src/components/domains/`)
- `status-badge.tsx`, `expiration-badge.tsx` (situação de vencimento —
  sempre um badge separado do status, Checkpoint A §19).
- `client-selector.tsx`, `project-selector.tsx` (seletor de Projeto restrito
  ao Cliente escolhido — cópia adaptada do padrão de Suporte/Projetos).
- `domain-filters.tsx`, `domain-form.tsx`, `status-actions.tsx`.
- `domain-timeline.tsx`.
- `client-domains-tab.tsx` (aba Domínios da Ficha Mestre do Cliente).

**Formatação**
- `src/lib/domains/format.ts` — uma função nova, aditiva:
  `formatDomainDaysLabel` (texto "Vence em N dias" / "Vence hoje" / "Vencido
  há N dias" / "Não se aplica" para o cartão de Renovação da ficha,
  Checkpoint A §40). Todas as funções da fundação (Checkpoint B) permanecem
  inalteradas.

**Testes**
- `tests/unit/domain-badges.test.tsx` (badges de status/situação de
  vencimento).
- Extensão de `tests/unit/domain-format.test.ts` (`formatDomainDaysLabel`).
- Extensão de `tests/unit/navigation.test.ts` (Domínios).
- Extensão de `tests/unit/client-timeline.test.tsx` (tradução de eventos de
  Domínios na Timeline consolidada do Cliente — ver §27).

Este relatório (`docs/dominios-checkpoint-c2.md`).

## 3. Arquivos modificados

- `src/app/(app)/clientes/[id]/page.tsx` — aba Domínios real (§26).
- `src/components/clients/client-timeline.tsx` — tradução de eventos de
  Domínios (§27) — **feito nesta própria etapa, não como correção
  posterior** (diferente de Suporte, que precisou do Checkpoint C2.1 para
  fechar a mesma lacuna).
- `src/config/navigation.ts` — Domínios ativado (§28).

**Nenhuma migration, tabela, coluna, FK, RLS, policy ou grant foi tocado.**
**Nenhum arquivo de fundação de Domínios** (`domain-service.ts`,
`domain-repository.ts`, `domain-access.ts`, `src/lib/validation/domain.ts`,
`domain-normalize.ts`) **foi alterado** — diferente de Suporte, esta etapa
não precisou de nenhum ajuste de fundação: os contratos definidos no
Checkpoint B (semântica de PATCH, transições de status, masking de Projeto)
já bateram exatamente com o que a UI precisava.

## 4. Rotas

`/dominios` (listagem), `/dominios/novo`, `/dominios/[id]` (ficha),
`/dominios/[id]/editar`, com `loading`/`error`/`not-found` dedicados. Todas
compilam e aparecem no `next build` como rotas dinâmicas (`ƒ`) — confirmado.

## 5. Listagem

Tabela desktop (`hidden lg:block`) com Domínio, Cliente, Projeto (mascarado —
ver §15), Registrador, Status, Vencimento (data + badge de situação),
Renovação automática, Atualizado em, Ações. Cards no mobile/tablet
(`lg:hidden`). CTA "Novo domínio" condicionado a `domain:write`. Ordenação
padrão: vencimento mais próximo primeiro (Checkpoint A §34).

## 6. KPIs

Quatro KPIs reais, uma única query agregada (`getDomainCounts`, fundação
inalterada):

- **Ativos** = `status='active'`.
- **Vencem em até 30 dias** = janela cumulativa, excluindo `inactive`.
- **Vencem em até 7 dias** = janela cumulativa, excluindo `inactive`
  (subconjunto do anterior, nunca esconde urgência).
- **Vencidos** = `expiration_date < hoje`, excluindo `inactive`.

Nenhum número inventado; todos server-side, decisão D31 aplicada
consistentemente (Checkpoint A §35).

## 7. Busca

Server-side (`ILIKE` parametrizado, escape literal de `%`/`_`, reaproveitando
`escapeTicketSearch` da fundação), cobrindo `domain_name`, nome de Cliente e
`registrador` (fundação, inalterada) **mais** nome de Projeto **somente**
quando o chamador tem `project:read` (Checkpoint A §36) — comportamento já
implementado no repository desde o Checkpoint B, apenas exposto na UI nesta
etapa.

## 8. Filtros

Seis, exatamente os do pedido (Checkpoint A §37): Cliente (seletor modal
paginado), Projeto (só habilita depois de um Cliente filtrado, também
paginado, só com `project:read`), Status, Vencimento (janela cumulativa
60/30/15/7 **ou** "Vencidos" — um único select que mapeia para
`expirationWindow`/`expired` no backend), Renovação automática
(configurada/desativada/não informada), Responsável (+ "Sem responsável").
Todos sincronizados com a URL, resetando a página ao mudar qualquer filtro.
Ordenação: vencimento mais próximo (padrão), mais recentes, atualizados
recentemente, nome do domínio (desempate sempre por `id`, fundação).

## 9. Domain name

Exibido em Unicode na ficha (com a forma ASCII entre parênteses quando
diferem — IDN, Checkpoint A §12/D4) via `domainNameToUnicode` (fundação,
reaproveitada, nenhuma segunda conversão criada); na listagem/aba do Cliente,
exibido na forma ASCII canônica (mesma decisão de simplicidade da listagem de
Suporte, que mostra o número técnico sem tradução extra) — a ficha é o único
lugar que precisa da leitura amigável de um IDN, e é lá que a decisão do
Checkpoint A pede a exibição dupla.

## 10. Formulário de criação

`/dominios/novo` → `DomainForm mode="create"` → `createDomainAction` →
`domain-service.createDomain` (fundação inalterada) → `redirect` para
`/dominios/[id]`. Campos: Cliente (seletor), Domínio (texto livre — a
normalização e as mensagens específicas de rejeição, Checkpoint A §10,
acontecem inteiramente no schema Zod da fundação, `domainCreateSchema`),
Projeto (opcional, seletor restrito ao Cliente), Registrador, Data de
registro, Data de vencimento (obrigatória), Renovação automática,
Responsável, Observações (com aviso fixo contra segredos, Checkpoint A §22).
**Sem campo de status** — a fundação já cria com `status="active"` por
default; a UI nunca oferece essa opção no cadastro (Checkpoint A §39/§18).

## 11. Formulário de edição

`/dominios/[id]/editar` reaproveita o mesmo `DomainForm` (`mode="edit"`).
Cliente e Domínio aparecem como texto somente leitura com nota explicativa
(ambos imutáveis, Checkpoint A §7/D7 — erro de digitação no nome exige
inativar e recadastrar, nunca uma edição). Projeto, Registrador, datas,
Renovação automática, Responsável e Observações são editáveis. **Sem campo de
status também** — todas as transições acontecem exclusivamente pelas ações
explícitas da ficha (§21), nunca por um select genérico. `version` e
`domainId` em campos ocultos.

## 12. Client selector

`DomainClientSelector` — cópia adaptada do seletor já usado em
Suporte/Projetos (busca server-side, 25 por consulta, nunca carrega todos).
Reaproveitado tanto no formulário quanto nos filtros da listagem.

## 13. Project selector

`DomainProjectSelector` — mesmo padrão do seletor de Projeto de Suporte:
sempre desabilitado sem `clientId`; busca `listDomainProjects(clientId, q,
page)` (fundação, já escopada ao cliente). Se o `clientId` mudar (só possível
na criação), a seleção é limpa automaticamente; o servidor sempre revalida de
novo no submit (`ensureProject`, fundação inalterada).

## 14. Project selector — habilitação condicional

Confirmado: no formulário de criação, o seletor de Projeto fica desabilitado
("Selecione um cliente primeiro") até que um Cliente seja escolhido. Na
edição, o Cliente já é fixo desde a carga da página, então o seletor de
Projeto já nasce habilitado.

## 15. Project masking

Implementado em três camadas, herdado integralmente da fundação (Checkpoint
B §14, já com a correção do hotfix de Suporte desde o primeiro commit — sem
nenhum ajuste necessário nesta etapa):

1. **Serviço** (fundação, inalterada): `maskProjectVisibility()` zera
   `projectId`/`projectName` sem `project:read`, mantendo só `hasProject`.
2. **Payload já coberto pelos 13 testes de `domain-project-access.test.ts`**
   desde o Checkpoint B — não refeito aqui, só reaproveitado.
3. **UI:** quando `hasProject && !projectName`, mostra "Projeto vinculado"
   (ficha, listagem, aba do Cliente e formulário) — sem nome, sem UUID, sem
   link. Quando `projectName` existe (autorizado), mostra nome com link para
   `/projetos/[id]`.

## 16. Owner (Responsável)

`Select` com "Sem responsável" + `listAvailableDomainOwners()` (membros
ativos da própria org, função já existente da fundação, sem alteração).
Nunca carrega membros de outra org (a função já filtra por `orgId` da
sessão). Usado tanto no formulário quanto no filtro "Responsável" da
listagem.

## 17. Datas

`registrationDate`/`expirationDate` são `<input type="date">` puro — sem
componente de conversão de timezone (diferente de `dueAt` em Suporte, que é
`datetime-local`): `DATE` no Postgres nunca passa por `Date`/fuso horário
(Checkpoint A §21/§23, fundação inalterada), e o HTML nativo `type="date"`
já trabalha com strings `YYYY-MM-DD` sem interpretação de fuso. Exibição via
`formatDomainDate` (fundação) e o novo `formatDomainDaysLabel` (§2) — ambos
puros, sem I/O.

## 18. Ficha do domínio

`/dominios/[id]`: header (domínio em Unicode, ASCII entre parênteses se IDN;
badge de **status** e badge de **situação de vencimento** — sempre
separados, Checkpoint A §19; ações de status; botão Editar), cartão de
resumo (Cliente com link, Projeto mascarado, Responsável, Vencimento com
situação), `Tabs` com **Visão geral** e **Timeline** — só duas abas,
conforme especificado (Checkpoint A §39: "Duas abas, mesmo critério de
enxugamento do Suporte"). Dentro de Visão geral: cartões "Renovação"
(vencimento, dias restantes, renovação automática, registrador, responsável
— sem botão "Renovar", conforme §40), "Vínculos" (Cliente/Projeto
mascarado), "Registro" (registrador, data de registro, cadastro, versão),
"Observações".

## 19. Renovação

Cartão com data de vencimento, dias restantes (`formatDomainDaysLabel`:
"Vence em 12 dias" / "Vence hoje" / "Vencido há 4 dias" / "Não se aplica"
para `inactive`), renovação automática declarada, registrador e responsável.
**Sem botão "Renovar"** — não há integração (Checkpoint A §40). Registrar uma
renovação = editar a data de vencimento pelo formulário, que gera
`domain.expiration_changed` (fundação inalterada).

## 20. Timeline

`DomainTimeline` traduz todos os 7 kinds (`domain.created` →
`domain.owner_changed`) via `translateDomainEventKind` (fundação, já pronta
desde o Checkpoint B — reaproveitada, nenhuma segunda tradução criada). Nunca
mostra `kind` cru, UUID ou payload — só título traduzido + `summary` humano
já gravado pela fundação + ator + data/hora.

## 21. Ações de status

`DomainStatusActions` implementa exatamente as transições aprovadas
(Checkpoint A §18, reafirmadas em §39 — "Marcar em transferência / Concluir
transferência, Inativar / Reativar"), idênticas ao `ALLOWED_TRANSITIONS` já
validado na fundação (`domain-service.ts`): a partir de `active` — "Marcar em
transferência" e "Inativar"; a partir de `transferring` — "Concluir
transferência" e "Inativar"; a partir de `inactive` — só "Reativar". Nenhum
select genérico de status na ficha. "Inativar" é a única ação com variante
destrutiva (substitui exclusão — não há `DELETE` em nenhuma camada,
Checkpoint A §27).

## 22. Inativar

Confirmação obrigatória com variante destrutiva (`destructive: true`, botão
vermelho no modal), mensagem explicando que o histórico é preservado e o
domínio pode ser reativado depois — mesmo padrão de "Cancelar" em Suporte.

## 23. Reativar

Confirmação simples, com aviso explícito de que a reativação pode ser
rejeitada pela unicidade parcial (`domains_org_active_name_key`) se já
existir outro domínio ativo com o mesmo nome na organização — comportamento
já testado estruturalmente no Checkpoint C1 (§20, casos A–D), aqui só
comunicado na UI. O erro real do banco (`23505`) é traduzido pela fundação
(`domain-service.ts::safe`) para a mensagem "Já existe um domínio ativo com
este nome." antes de chegar à Server Action.

## 24. Concurrency UI

Formulário sempre envia `version` em campo oculto; as ações de status também
recebem a `version` atual da ficha. Em conflito, o Alert mostra exatamente a
mensagem já produzida pela fundação — **"Este domínio foi atualizado por
outro usuário. Atualize a página antes de salvar novamente."** — com botão
"Recarregar dados" (`router.refresh()`), nunca sobrescrevendo silenciosamente.
Mesma UX já usada em Clientes/Projetos/Suporte.

## 25. Erro de duplicidade

`duplicate_domain` (reativação em conflito com a unicidade parcial) e
`invalid_transition` (tentativa de pular uma transição não aprovada — nunca
exercitável pela UI, já que `DomainStatusActions` só oferece transições
válidas, mas defendido também no service) aparecem como `Alert` de erro
padrão no topo do formulário/ficha, nunca como exceção não tratada.

## 26. Integração com Cliente

Aba "Domínios" na Ficha Mestre deixou de ser `EmptyState` de módulo futuro e
passa a chamar `listDomains({ clientId, page })` — só quando
`authorizeDomainSession(session, "read").ok` for verdadeiro, mesmo padrão
exato das abas Projetos/Suporte: **`listDomains` nunca é chamado sem
autorização** (`canReadDomains ? await listDomains(...) : null`, checagem
antes do `await`, não depois). Sem `domain:read`, `ClientDomainsForbidden`
(Alert genérico, sem número/nome/contagem). CTA "Novo domínio" (só com
`domain:write`) aponta para `/dominios/novo?cliente=<id>`, revalidado no
servidor (mesmo padrão de Projetos/Suporte — `getDomainClient` antes de
pré-preencher, `ensureClient` de novo no submit). A aba "Infraestrutura"
continua como `EmptyState` de módulo futuro — só "Domínios" saiu da lista de
módulos placeholder.

## 27. Timeline consolidada do Cliente

**Já implementada na fundação desde o Checkpoint B** (repository, quarto
ramo dinâmico via `unionAll`) — esta etapa fechou a última peça que faltava:
a **tradução visual** do título do evento. Diferente de Suporte (que
precisou do Checkpoint C2.1, uma correção separada, para isso),
`client-timeline.tsx` já nasce aqui com o terceiro `if` (`entry.domainName`
→ `translateDomainEventKind`) — a mesma lacuna nunca chegou a existir para
Domínios. Os 7 kinds da fundação traduzem corretamente, o nome do domínio
aparece como identificador humano (nunca o UUID), e o masking de Projeto
permanece garantido pela origem (`client-timeline-repository.ts` nunca
preenche `projectName` para a fonte `domain`, mesmo contrato já usado para
`ticket`) — sem necessidade de nenhuma mudança de repository/service.
Cobertura: 8 testes novos em `client-timeline.test.tsx` (criado/traduzido,
status alterado, projeto vinculado sem vazamento, observações sem conteúdo,
sem UUID exposto, quatro fontes intercaladas, `kind` desconhecido, regressão
de Suporte).

## 28. Navegação

`src/config/navigation.ts`: item "Domínios" **criado** (não existia nem como
`planned`) com `status: "available"`, `permission: ["domain:read",
"client:read"]`, posicionado no grupo Operação logo após Suporte — mesma
recomendação do Checkpoint A §3 (`Clientes → Projetos → Suporte → Domínios`).
Testado: some sem nenhuma permissão, some com só uma das duas, aparece com as
duas; Clientes, Projetos e Suporte continuam sem regressão (mesmo arquivo de
teste, casos novos).

## 29. Busca global

`GlobalSearch` já lê de `getVisibleFlatNavigation` — Domínios passou a
aparecer nela automaticamente, sem nenhuma mudança adicional. Continua sendo
busca de destinos/módulos, não de domínios cadastrados.

## 30. Regressão do Dashboard

`src/app/(app)/dashboard/page.tsx`: **zero diferença** (`git diff` vazio para
este arquivo). Nenhum KPI de Domínios foi adicionado, conforme o próprio
Checkpoint A (§50: "Fora da V1 — KPI no Dashboard").

## 31. Permissions

Confirmado por leitura de código e pela suíte de testes (fundação, inalterada
nesta etapa): leitura exige `domain:read`+`client:read`; escrita soma
`domain:write`; `project:read` nunca é exigido para o domínio em si, só
libera detalhes do Projeto vinculado; `scope='assigned'` continua negado sem
exceção. Autorização acontece **antes** de qualquer consulta em todas as
páginas (`authorizeDomainSession` chamado antes de `getDomainsPageData`/
`getDomainWorkspace`/etc.), nunca "consultar primeiro, negar depois".

## 32. Cross-org

Coberto pela fundação (Checkpoints B/C1) e revalidado nesta etapa
indiretamente — nenhuma página/service novo introduz uma consulta sem
`orgId`; `getDomainDetail`/`getDomainWorkspace` continuam devolvendo
`not_found` genérico (nunca diferenciando UUID inválido de cross-org),
comportamento herdado e confirmado pela página `[id]/page.tsx`, que só trata
`code === "not_found"` → `notFound()`.

## 33. N+1 review

`getDomainsPageData`/`getDomainWorkspace` buscam tudo em paralelo
(`Promise.all`) numa única resolução de sessão — sem N+1: `listDomains` já
faz um único `SELECT` com `LEFT JOIN` para `clientName`/`projectName`/
`ownerName` (fundação, inalterada); nenhum componente novo dispara consulta
por linha da tabela. `DomainClientSelector`/`DomainProjectSelector` só
buscam ao abrir o modal (debounce de 250ms), não a cada renderização.

## 34. Responsividade

**Estrutural apenas — sem sessão autenticada disponível nesta sessão** (ver
§36). Tabela desktop (`hidden lg:block`) e cards mobile/tablet (`lg:hidden`)
no mesmo breakpoint (`lg`) já usado em Clientes/Projetos/Suporte. Formulário
`max-w-3xl` com grid `sm:grid-cols-2`. Ficha com `grid-cols-1 sm:grid-cols-2
lg:grid-cols-4` no cartão de overview. Filtros usam `flex-wrap`. Verificado
ao vivo, sem login, que as quatro rotas (`/dominios`, `/dominios/novo`,
`/dominios/[id]`, `/dominios/[id]/editar`) e a Ficha do Cliente com
`?tab=dominios` redirecionam para `/login?next=...` corretamente, sem erro
500 nem erro de console em nenhuma (confirmado via navegador, `npm run
build` limpo confirma que todo o código compila e resolve).

## 35. Acessibilidade

Labels associados (`htmlFor`/`id`) em todos os campos do formulário;
`aria-label` em buscas/filtros/seletores sem label visível; botões
icon-only (remover projeto no seletor) com `aria-label`;
`Select`/`Modal`/`Tabs` são primitivas Radix já acessíveis por padrão,
reaproveitadas sem modificação. Não foi possível testar navegação por
teclado/leitor de tela numa sessão viva (mesmo limite do §36 abaixo).

## 36. QA visual

**Pendente — mesma limitação de todos os checkpoints anteriores.** Não há
sessão autenticada disponível nesta sessão; não tentei gerar credenciais,
magic link ou token. Verificado sem login: `/dominios`, `/dominios/novo`,
`/dominios/[id]` (UUID de teste), `/dominios/[id]/editar` e
`/clientes/[id]?tab=dominios` redirecionam corretamente para
`/login?next=...`, todas sem erro de console/servidor relacionado a este
código (o único erro no log do servidor é `AuthApiError: Invalid Refresh
Token`, esperado para qualquer rota sem sessão — não específico de Domínios,
mesmo padrão observado nos checkpoints anteriores). `npm run build` prova que
todo o código (imports, JSX, Server Actions) compila e resolve sem erro,
inclusive os trechos que só executam depois do login.

## 37. Bugs encontrados

Nenhum bug de fundação encontrado durante a implementação da UI. Diferente de
Suporte (que precisou de dois ajustes pontuais de fundação, KPI "Abertos" e
schema de `changeTicketStatus`), a fundação de Domínios (Checkpoint B) já
bateu exatamente com o que a especificação de UI pedia — nenhum arquivo em
`src/server/services/domain-service.ts`, `domain-repository.ts`,
`src/lib/auth/domain-access.ts` ou `src/lib/validation/domain.ts` precisou
ser tocado.

## 38. Bugs corrigidos

Nenhum — ver §37.

## 39. Testes novos

| Arquivo | Testes |
|---|---|
| `tests/unit/domain-badges.test.tsx` | 7 |
| `tests/unit/domain-format.test.ts` (extensão, `formatDomainDaysLabel`) | +6 |
| `tests/unit/navigation.test.ts` (extensão, Domínios) | +5 |
| `tests/unit/client-timeline.test.tsx` (extensão, tradução de Domínios) | +8 |
| **Total novo líquido** | **+26** |

## 40. Total de testes

`npm run test`: **734 aprovados, 2 pulados** (era 708+2 no fim do C1 —
incremento exato de 26, todos os testes novos listados acima, zero
regressão).

## 41. Total foundation

`npm run test:foundation`: **512 aprovados** (idêntico ao C1 — nenhum dos
testes novos desta etapa entra em `test:foundation`, mesmo padrão de
Projetos/Suporte: testes de UI/badges/navegação/timeline ficam fora da lista
de fundação).

## 42. lint

`npm run lint`: **0 erros, 0 avisos.**

## 43. typecheck

`npm run typecheck`: limpo.

## 44. build

`npm run build` (após `rm -rf .next`): **concluído com sucesso**. Rotas novas
confirmadas no manifesto: `/dominios`, `/dominios/novo`, `/dominios/[id]`,
`/dominios/[id]/editar`, todas dinâmicas; nenhuma rota existente quebrou.

## 45. Documentação

Este relatório (`docs/dominios-checkpoint-c2.md`). **Domínios não foi
marcado como concluído** em nenhum documento — nenhuma pendência de UI
oculta:

1. Nenhuma lacuna de tradução na Timeline consolidada do Cliente (§27,
   fechada desde a origem nesta própria etapa).
2. QA visual autenticado continua pendente (mesma razão de sempre — sem
   sessão disponível nesta sessão).
3. Integrações conscientemente adiadas desde o Checkpoint A/B (aba de
   domínios na Ficha do Projeto; timeline do Projeto incluindo Domínios; KPI
   de Domínios no Dashboard) continuam fora do escopo — não fazem parte de
   C2.

## 46. `git diff --stat`

```
 package.json                                       |  2 +-
 src/app/(app)/clientes/[id]/page.tsx               | 28 ++++++-
 src/components/clients/client-timeline.tsx         |  4 +-
 src/config/navigation.ts                           |  2 +
 src/server/db/migrations/meta/_journal.json        |  7 ++
 src/server/db/schema/index.ts                      |  1 +
 .../repositories/client-timeline-repository.ts     | 94 +++++++++++++---------
 src/server/services/client-service.ts              | 18 +++--
 src/server/services/service-error.ts               |  1 +
 tests/helpers/projects.ts                          |  2 +-
 tests/integration/schema-reconciliation.test.ts    | 16 ++--
 tests/unit/client-timeline.test.tsx                | 61 ++++++++++++++
 tests/unit/navigation.test.ts                      | 20 +++++
 13 files changed, 198 insertions(+), 58 deletions(-)
```

(`client-timeline-repository.ts`, `client-service.ts`,
`schema-reconciliation.test.ts`, `journal.json`, `schema/index.ts`,
`service-error.ts`, `helpers/projects.ts`, `package.json` já estavam
modificados desde os Checkpoints B/C1 de Domínios, não tocados nesta etapa —
confirmado por diff idêntico ao final do C1. As linhas novas desta etapa são
só em `clientes/[id]/page.tsx`, `client-timeline.tsx`, `navigation.ts` e os
dois arquivos de teste. A maior parte do trabalho (rotas, componentes de
Domínios) é arquivo novo, listado no `git status` abaixo, não neste diff de
arquivos já rastreados.)

## 47. `git status`

Sem staging, sem commit. `HEAD` continua em `74515e4`. Arquivos novos: todos
os componentes/rotas de Domínios listados no §2, mais este relatório.

## 48. Confirmação: nenhuma migration nova

Confirmado — `src/server/db/migrations/` não ganhou nenhum arquivo novo
nesta etapa. `0006_domains.sql` permanece exatamente como aplicado no
Checkpoint C1, sem edição.

## 49. Confirmação: nenhum commit/push/deploy

Confirmado por `git status` (§47) — árvore de trabalho não commitada, `HEAD`
inalterado, nenhum `git add`/`git commit`/`git push` executado.

## 50. Pendências para Checkpoint D

1. **QA visual autenticado** — pendente pela mesma razão de sempre (sem
   sessão disponível nesta sessão).
2. Decisões já registradas nesta etapa e não revertidas sem aprovação:
   Domínio exibido em ASCII na listagem/aba do Cliente e em Unicode+ASCII só
   na ficha (§9); só duas abas na ficha (§18); sem botão "Renovar" (§19).
3. Integrações conscientemente adiadas desde o Checkpoint A/B (aba de
   Domínios na Ficha do Projeto; timeline do Projeto incluindo Domínios; KPI
   de Domínios no Dashboard) continuam fora do escopo — não fazem parte de
   C2.

Parando aqui. Sem commit/push/deploy. Aguardando aprovação para o Checkpoint
D (QA final).
