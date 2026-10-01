# Domínios — Checkpoint D: QA final + regressão + acessibilidade + pré-publicação

Data: 16/09/2026. Escopo autorizado: revisão final, QA técnico/visual (quando
possível), responsividade, acessibilidade, segurança, regressão, performance,
testes, documentação. **Arquitetura e regras de negócio de Domínios
(schema/migration 0006, authorization, RLS, grants, normalização de
`domain_name`, unicidade parcial, project masking, status, version, timeline,
FK composta/tripla, integração com Cliente) não foram reabertas. Sem
commit/push/PR/deploy.**

## 1. Estado inicial

`git status`/`git diff --stat` no início desta etapa eram **idênticos** ao
fim do Checkpoint C2: mesmos 13 arquivos rastreados modificados e os mesmos
arquivos novos untracked de fundação/UI de Domínios, mais
`docs/dominios-checkpoint-c2.md`. Releitura confirmada dos Checkpoints A, B,
C1, C2 de Domínios e dos checkpoints D/D.1/D.2 de Projetos e D/D2 de Suporte
antes de qualquer ação, para usar o mesmo padrão de rigor/relatório já
estabelecido.

## 2. Arquivos alterados no D

- [`src/app/(app)/dominios/page.tsx`](../src/app/(app)/dominios/page.tsx) e
  [`src/components/domains/client-domains-tab.tsx`](../src/components/domains/client-domains-tab.tsx):
  1 linha cada — a coluna "Atualizado em" (listagem e aba Domínios da Ficha
  do Cliente) usava um `Intl.DateTimeFormat` sem `timeStyle` (mostrava só a
  data, sem hora), diferente do rodapé da ficha (`[id]/page.tsx`), que já
  mostrava data **e** hora. Corrigido para incluir `timeStyle: "short"` nos
  dois lugares — bug isolado e de baixo risco, **mesma categoria exata** do
  bug de formatação corrigido no Checkpoint D de Suporte (coluna "Atualizado
  em" da aba Suporte sem hora).
- [`README.md`](../README.md), [`docs/roadmap.md`](roadmap.md),
  [`docs/banco.md`](banco.md), [`docs/seguranca.md`](seguranca.md):
  atualizações mínimas e factuais (ver §62).
- Este relatório.

Nenhuma migration, RLS, policy, grant, schema, authorization, service ou
regra de negócio foi alterada. Nenhum arquivo de Clientes, Projetos ou
Suporte foi tocado.

## 3. Navegação

Revalidado em [`src/config/navigation.ts`](../src/config/navigation.ts):
Clientes `available` (`client:read`); Projetos `available`
(`["project:read","client:read"]`); Suporte `available`
(`["ticket:read","client:read"]`); Domínios `available`
(`["domain:read","client:read"]`) — as duas exigidas juntas via `every()` em
`isNavItemVisible`. `tests/unit/navigation.test.ts` (21 testes: 6 de
Projetos + 5 de Suporte + 5 de Domínios + regressão, reexecutados) confirma:
Domínios some sem nenhuma permissão, some com só `domain:read`, some com só
`client:read`, aparece com as duas; Clientes/Projetos/Suporte/Equipe sem
regressão. Infraestrutura não é item de navegação (só aba placeholder dentro
da Ficha do Cliente, `FUTURE_MODULE_COPY` — nenhuma mudança nesta etapa).

## 4. Busca global

`src/components/ui/search.tsx` usa `getVisibleFlatNavigation(permissions)`,
a mesma fonte única da sidebar — Domínios aparece automaticamente como
destino quando autorizado, sem nenhuma mudança necessária. Confirmado por
leitura que continua sendo busca de módulos/destinos, nunca de domínios
individuais.

## 5. Listagem `/dominios`

Revisão completa por leitura de
[`src/app/(app)/dominios/page.tsx`](../src/app/(app)/dominios/page.tsx):
autorização antes de qualquer query; `PageHeader` com CTA "Novo domínio"
condicionado a `domain:write`; 4 `KpiCard`s; `DomainFilters`; tabela desktop
(`hidden lg:block`) com 9 colunas (Domínio/Cliente/Projeto/Registrador/
Status/Vencimento/Renovação automática/Atualizado em/Ações) e cards mobile
(`lg:hidden`) no mesmo breakpoint `lg` já usado em Clientes/Projetos/Suporte;
`Pagination` reaproveitado; `EmptyState` com dois textos distintos ("Nenhum
domínio cadastrado" × "Nenhum domínio encontrado", conforme há ou não filtro
ativo); `loading.tsx`/`error.tsx` dedicados. Confirmado ao vivo, sem sessão,
que a rota redireciona para `/login?next=%2Fdominios` e zero erro de
console/servidor (ver §49).

## 6. KPIs

Confirmado em
[`domain-repository.ts:getDomainCounts`](../src/server/repositories/domain-repository.ts):
`active` = `status='active'`; `expiring30`/`expiring7` = janelas cumulativas
(`expiringWithin(30)`/`expiringWithin(7)`), sempre excluindo `inactive`;
`expired` = `expiration_date < hoje` excluindo `inactive`. Todos calculados
numa única query agregada (`count(*) filter (where ...)`), sem N+1. "Hoje" é
sempre `(now() at time zone 'America/Sao_Paulo')::date` (SQL), nunca o
relógio do processo Node — mesma regra usada em `domainExpirationState`
(client-side), sem divergência entre servidor e exibição.

## 7. Busca

Confirmado em `domain-repository.ts:conditions()`: `ILIKE` parametrizado
sobre `domain_name`, `clients.name` e `registrar` sempre; `projects.name`
**somente** quando `access.canReadProjects`. Escape de `%`/`_` via
`escapeTicketSearch` (fundação de Suporte, reaproveitada sem duplicação).
Confirmado que o termo de busca nunca passa pela normalização de domínio
(`normalizeDomainName`) — é comparado literalmente via `ILIKE`, então buscar
por `"EMPRESA"` encontra `empresa.com.br` (case-insensitive), mas não há
"correção" de domínio digitado incorretamente na busca (comportamento
correto — a normalização é só para persistência, Checkpoint A §10).

## 8. Filtros

Cliente, Projeto (só com `project:read`), Status, Vencimento (janela
cumulativa 60/30/15/7 ou "Vencidos" — um único `Select`), Renovação
automática, Responsável (+"Sem responsável") — todos implementados e
sincronizados com a URL (`DomainFilters`, `updateParams()`). Confirmado por
leitura: `params.delete("page")` roda em **toda** chamada de `updateParams`,
então qualquer mudança de filtro reseta a página automaticamente. Filtros
isolados e combinados usam o mesmo `conditions()` único, reaproveitado por
`listDomains`/`countDomains`/`getDomainCounts` (nunca predicados divergentes
entre listagem e contagem).

## 9. Vencimento — mapeamento do filtro único

Confirmado em `domain-filters.tsx`: o `Select` "Vencimento" mapeia
`expirationValue` (derivado de `expired`/`expirationWindow` da URL) para
três formas de `updateParams` — `ALL` limpa ambos; um valor de janela
(`"60"`/`"30"`/`"15"`/`"7"`) seta `expirationWindow` e limpa `expired`;
`EXPIRED` seta `expired: "true"` e limpa `expirationWindow`. Os dois campos
nunca ficam preenchidos simultaneamente na URL — consistente com o schema
(`domainFiltersSchema`), que os trata como independentes, mas o repository
(`conditions()`) já aplica os dois com `AND` caso ambos estivessem presentes
por manipulação direta da URL (defesa em profundidade, sem efeito colateral
combinado incorreto: um domínio vencido também bate `expirationWindow` de
qualquer tamanho, então o `AND` seria redundante, nunca contraditório).

## 10. Project filter

Confirmado em `DomainProjectSelector`: com `clientId` presente, busca
`listDomainProjects(orgId, clientId, q, page)` — sempre restrita àquele
cliente. Sem `clientId`, o seletor fica `disabled` e a busca nunca dispara.
Debounce de 250 ms, paginação server-side de 25 em 25.

## 11. Paginação

`domainPaginationSchema.shape.page` = mesma cadeia de normalização de
Suporte/Projetos (`normalizeTicketNumber` → `z.number().int().min(1)` →
`.catch(1)`). `domainPage(page, total, size)` clampa antes da query — nunca
uma página vazia incoerente. 25 domínios por página confirmado
(`DOMAIN_PAGE_SIZE = 25`).

## 12. Ordenação

`DOMAIN_SORTS = ["expiration","created","updated","domainName"]`, cada um
com `ORDER BY` explícito em `listDomains` (`expiration_date asc` default —
vencimento mais próximo primeiro, conforme Checkpoint A §34; `desc(createdAt)`;
`desc(updatedAt)`; `asc(domainName)`), todos com desempate determinístico
`asc(domains.id)` no final.

## 13. Criação de domínio

Fluxo confirmado em `DomainForm`/`createDomainAction`/`domain-service.
createDomain`: Cliente (seletor, obrigatório) → Domínio (texto livre,
normalizado e validado por `domainNameSchema`, mensagens específicas por
motivo de rejeição) → Projeto (seletor, opcional, só habilita com Cliente
escolhido) → Registrador → Data de registro → Data de vencimento
(obrigatória) → Renovação automática → Responsável → Observações. **Sem
campo de status no formulário** — `domainCreateSchema.status.default("active")`
garante `active` quando omitido; a UI nunca oferece escolha livre de status
na criação.

## 14. Client selector

`DomainClientSelector`: busca server-side (`searchDomainClientsAction` →
`listDomainClients`), 25 por consulta, debounce 250 ms, nunca carrega todos
os clientes. `orgId` explícito em `listDomainClients` (repository). Exige
`domain:read` (via `requireAccess` do service, chamado antes de qualquer
query). Cliente pré-selecionado por `?cliente=<id>` na URL é resolvido via
`getDomainClient` (autorizado, org explícita) **antes** de aparecer no
formulário — nunca tratado como autoridade.

## 15. Project selector

`DomainProjectSelector`: só habilita com `clientId` (§10); paginado (25),
server-side, debounce 250 ms. `projectId` sempre revalidado no servidor por
`ensureProject()` (fundação, inalterada) tanto na criação quanto na edição —
a FK tripla no banco é a última linha de defesa.

## 16. Se Cliente mudar durante criação

Confirmado em `DomainProjectSelector`: `useEffect` compara `clientId` contra
`lastClientId.current`; se mudou, limpa `selected` e chama `onChange(null)`
— o Projeto incompatível nunca fica "preso" visualmente após trocar de
Cliente no formulário de criação (na edição o Cliente é fixo, então esse
efeito nunca dispara ali).

## 17. Edição

Confirmado em `DomainForm mode="edit"`: Cliente **e** Domínio exibidos como
texto somente leitura com nota explicativa (ambos imutáveis, Checkpoint A
§7/D7 — diferente de Suporte, onde só o Cliente é imutável). Projeto,
Registrador, datas, Renovação automática, Responsável e Observações
editáveis. Vincular/trocar/remover Projeto funcionam pelo mesmo
`DomainProjectSelector`, sempre restrito ao Cliente do domínio (imutável) —
nunca outro cliente.

## 18. Domain name imutável

Confirmado em duas camadas: **schema** (`domainUpdateSchema.domainName:
z.never().optional()` — qualquer valor enviado nesse campo na edição é
rejeitado pela validação, nunca silenciosamente ignorado nem aceito) e
**banco** (trigger `atlaz.validate_domain_write()`, `NEW.domain_name IS
DISTINCT FROM OLD.domain_name` → `23514`, confirmado funcionalmente no
Checkpoint C1). A UI nunca envia esse campo no formulário de edição (nem
sequer existe um `<input name="domainName">` fora do modo `create`).

## 19. Project masking

Revalidado nas três camadas (serviço, RSC/payload, UI):

1. **Serviço:** `maskProjectVisibility()` (`domain-service.ts`, inalterado)
   zera `projectId`/`projectName` sem `project:read`, mantendo só
   `hasProject: boolean`.
2. **RSC/payload:** coberto pelos 13 testes de
   `domain-project-access.test.ts` (fundação, Checkpoint B) — reexecutados
   nesta etapa dentro de `npm run test`, sem alteração.
3. **UI:** `/dominios` (listagem), `/dominios/[id]` (ficha, cartão de resumo
   e aba Visão Geral, cartão "Vínculos"), formulário e a aba Domínios da
   Ficha do Cliente mostram "Projeto vinculado" (itálico, sem nome/ID/link)
   quando `hasProject && !projectName` — confirmado por leitura direta das
   quatro telas. Nenhuma descrição ou metadata do Projeto aparece em nenhum
   lugar do HTML de Domínios.

## 20. Ficha do domínio

Revisado [`/dominios/[id]/page.tsx`](../src/app/(app)/dominios/[id]/page.tsx):
header com domínio em Unicode (ASCII entre parênteses se IDN), badge de
**status** e badge de **situação de vencimento** — sempre separados
(Checkpoint A §19, confirmado que nunca colapsam num só badge);
`DomainStatusActions` e botão Editar (ambos só com `domain:write`); cartão
de resumo (Cliente com link, Projeto mascarado, Responsável, Vencimento com
situação); duas abas (Visão Geral, Timeline — confirmado que **não** existe
uma terceira aba de "Interações"/comentários, correto: Domínios não tem
comentários, diferente de Suporte). Visual consistente com o design system.

## 21. Ações de status

Matriz revalidada linha a linha em `ACTIONS_BY_STATUS`
(`status-actions.tsx`) contra `ALLOWED_TRANSITIONS` (`domain-service.ts`,
fundação): `active` → transferring/inactive; `transferring` →
active/inactive; `inactive` → active (único). Bate **exatamente**. A
proteção contra transição inválida vive em `updateDomain()`
(`domain-service.ts`, inalterado) — mesmo se a UI algum dia oferecesse uma
ação a mais por engano, o service rejeitaria (`invalid_transition`).

## 22. Inativar

Confirmado com variante destrutiva (`destructive: true`, botão vermelho no
modal), confirmação obrigatória, mensagem explicando que o histórico é
preservado e o domínio pode ser reativado depois — não há `DELETE` em
nenhuma camada (banco: grants sem `DELETE` para `service_role`, confirmado
no Checkpoint C1 §32; aplicação: nenhuma função `deleteDomain` existe).

## 23. Reativar

Confirmado: modal de confirmação avisa explicitamente que a reativação pode
ser rejeitada pela unicidade parcial se já existir outro domínio ativo com o
mesmo nome. O erro real do banco (`23505` em
`domains_org_active_name_key`) é traduzido por `domain-service.ts::safe`
para `"Já existe um domínio ativo com este nome."` antes de chegar à Server
Action — nunca o código/constraint do Postgres exposto ao usuário.

## 24. Version conflict

Cenário revalidado via os testes de integração existentes
(`domain-service.test.ts`): duas leituras da mesma `version`, uma escrita
vence (`version+1`), a segunda recebe `code: "conflict"` sem sobrescrever
nada. Nenhum evento/auditoria é gravado na tentativa recusada. Na UI,
`DomainForm` mostra o `Alert` com a mensagem **exata** — "Este domínio foi
atualizado por outro usuário. Atualize a página antes de salvar novamente."
— com o botão "Recarregar dados" (`router.refresh()`). As ações de status
(`DomainStatusActions`) também enviam a `version` capturada na renderização
da ficha; um conflito ali aparece como `toast.error` com a mesma mensagem
(via `changeDomainStatusAction` → `toStatusResult`).

## 25. No-op

Confirmado no teste existente de fundação: editar sem mudança real de
nenhum campo não gera `UPDATE`, evento ou auditoria, e não avança `version`;
uma versão desatualizada **ainda** é rejeitada como conflito mesmo quando o
conteúdo enviado seria um no-op.

## 26. Integração com Cliente

Revisado [`clientes/[id]/page.tsx`](../src/app/(app)/clientes/[id]/page.tsx):
`listDomains({clientId, page})` só chamada quando
`authorizeDomainSession(session,"read").ok` (checagem **antes** do `await`,
nunca "consultar e depois esconder") — mesmo padrão exato das abas
Projetos/Suporte. Sem `domain:read`, `ClientDomainsForbidden` (`Alert`
genérico, sem número/nome/contagem). CTA "Novo domínio" (só com
`domain:write`) aponta para `/dominios/novo?cliente=<id>`.

## 27. Timeline consolidada do Cliente

Revalidado (fundação da consolidação: Checkpoint B; tradução visual:
Checkpoint C2 — fechada desde a origem, sem precisar de um C2.1 como
Suporte) com as combinações de permissão, via a suíte de
`client-domain-timeline.test.ts` (12 testes, incluindo o teste com as
**quatro** fontes simultâneas) e `client-timeline.test.tsx` (8 testes novos
de tradução de Domínios do Checkpoint C2), todos reexecutados, verdes.

## 28. Timeline — Domínios (tradução visual)

Confirmado em [`client-timeline.tsx`](../src/components/clients/client-timeline.tsx):
título `"<domínio> — <kind traduzido>"`, reutilizando
`translateDomainEventKind` (nenhuma segunda tradução criada); status/
renovação automática já chegam traduzidos no `summary` gravado pela
fundação; masking preservado (`projectName` sempre `null` para eventos de
domínio, por desenho do repository — ver §19); nenhum UUID exposto.

## 29. Aba Domínios da Ficha Mestre do Cliente

`ClientDomainsTab` revisada: lista `listDomains({clientId, page})` (só
chamada quando `canReadDomains` — checagem **antes** do `await`); paginação
(`?dominiosPage=`); colunas Domínio/Status/Vencimento/Renovação automática/
Responsável/Atualizado em (data+hora — corrigido nesta etapa, ver §2); link
"Ver" para a ficha; CTA "Novo domínio" (condicionado a `domain:write`) para
`/dominios/novo?cliente=<id>`. Sem `domain:read`: `ClientDomainsForbidden`
(`Alert` genérico) — `listDomains` nunca é chamado nesse caminho.

## 30. CTA Novo domínio (a partir da Ficha do Cliente)

Confirmado em `novo/page.tsx`: `?cliente=<id>` é resolvido via
`getDomainClient` (autorizado, org explícita) **antes** de pré-preencher o
formulário; se inválido/inacessível, a pré-seleção é silenciosamente
ignorada. No submit, `createDomain` (service) chama `ensureClient` de novo.

## 31. Cliente com zero domínios

`ClientDomainsTab` e `/dominios` (`rows.length === 0`) mostram `EmptyState`
dedicado — nunca uma tabela vazia quebrada.

## 32. 404 seguro

`getDomainDetail`/`getDomainWorkspace` lançam `ServiceError("not_found")`
para UUID inválido, domínio inexistente ou de outra org — sempre o mesmo
código, capturado por `notFound()` em `[id]/page.tsx` e `[id]/editar/page.tsx`,
renderizando `not-found.tsx` com texto idêntico independente da causa real.
Confirmado ao vivo, sem sessão, que
`/dominios/00000000-0000-0000-0000-000000000000` redireciona para
`/login?next=...` antes de qualquer lógica de 404.

## 33. Forbidden

Todas as entradas do service (`listDomains`, `getDomainDetail`,
`getDomainWorkspace`, `createDomain`, `updateDomain`, `listDomainClients`,
`listDomainProjects`, etc.) chamam `requireAccess()` **antes** de qualquer
query ao repository. Nas páginas, `authorizeDomainSession` é chamado antes
de `getDomainsPageData`/`getDomainWorkspace`/`listDomains`. Nenhum caminho
consulta primeiro para negar depois.

## 34. Cross-org

Coberto pela suíte de fundação já existente
(`tests/integration/domain-foundation.test.ts`: FK cross-org rejeitada;
`tests/integration/client-domain-timeline.test.ts`: evento de domínio de
outra org nunca aparece), reexecutada sem alteração. Toda função de
repository recebe `orgId` explícito e o aplica em `where`/joins.

## 35. BYPASSRLS

Reli linha a linha `domain-repository.ts` e
`domain-timeline-repository.ts`: **todas** as funções recebem `orgId` como
parâmetro obrigatório e o usam em pelo menos uma condição de `where`/`join`.
Não encontrada nenhuma chamada como `getDomain(id)`/`getProject(id)` sem
contexto de organização. RLS no banco é defesa em profundidade, já validada
contra produção no Checkpoint C1.

## 36. N+1

`getDomainsPageData`/`getDomainWorkspace` — a primeira usa `Promise.all`
(listagem+KPIs+responsáveis); a segunda busca o domínio e depois a timeline
sequencialmente (mesmo padrão herdado de `getTicketWorkspace`, não uma
regressão desta etapa — a timeline depende logicamente de o domínio existir,
e o custo de duas queries pequenas sequenciais nesse caminho específico é
desprezível, mesma decisão já aceita em Suporte). `listDomains` já resolve
`clientName`/`projectName`/`ownerName` com `LEFT JOIN` numa única query.
`DomainClientSelector`/`DomainProjectSelector` só buscam ao abrir o modal.
Nenhum N+1 real encontrado.

## 37. Datas / timezone

`registrationDate`/`expirationDate` são `<input type="date">` puro — sem
nenhuma conversão de timezone client-side (diferente de `dueAt` em Suporte),
porque `DATE` no Postgres nunca passa por `Date`/fuso (Checkpoint A §21/§23)
e o HTML nativo `type="date"` já trabalha com strings `YYYY-MM-DD`.
`formatDomainDaysLabel`/`domainExpirationState` (puros, testados) usam
sempre "hoje" em America/Sao_Paulo — mesma regra do servidor
(`(now() at time zone 'America/Sao_Paulo')::date`). Nenhum deslocamento de
fuso encontrado nos 21 testes de fronteira já existentes (`domain-format.test.ts`).

## 38. Situação de vencimento

Confirmado que a situação (`DomainExpirationBadge`) é **sempre** derivada na
leitura, nunca persistida, e que `inactive` sempre devolve
`not_applicable` (decisão D31) — inclusive nas ações de status: reativar um
domínio vencido não "limpa" o vencimento, ele volta a mostrar "Vencido"
imediatamente após reativar (comportamento correto, testado em
`domain-badges.test.tsx`: "inactive nunca gera urgência (not_applicable),
mesmo vencido").

## 39. Empty states

Revisados: nenhum domínio cadastrado (`/dominios` e aba do Cliente, com CTA
condicionado); nenhum resultado após filtro (mensagem distinta, sem CTA de
criar); sem projeto vinculado ("Nenhum"); sem responsável ("Sem
responsável"/"—"); sem observações ("Nenhuma observação registrada.");
timeline vazia (`EmptyState` dedicado, tanto no domínio quanto no Cliente).

## 40. Loading

`dominios/loading.tsx`: skeleton com a mesma estrutura da página real
(header, 4 KPIs, filtros, tabela) — sem layout shift perceptível, mesmo
padrão de Clientes/Projetos/Suporte. Aplica-se também a `/dominios/novo`,
`/dominios/[id]`, `/dominios/[id]/editar` por herança de segmento do App
Router (mesma convenção já usada nos outros três módulos).

## 41. Error states

`dominios/error.tsx`: mensagem genérica com botão "Tentar novamente" —
nunca SQL, stack, constraint ou código de erro do Postgres. Confirmado em
`domain-service.ts:safe()`: só traduz códigos específicos conhecidos
(`23514`/`invalid domain owner` → `invalid_owner`; `23503`/
`domains_client_fkey` → `invalid_client`; idem `_project_fkey`; `23505`/
`domains_org_active_name_key` → `duplicate_domain`; `40001`/`40P01` →
`conflict`) para mensagens humanas; qualquer outro erro cai no genérico
`"Não foi possível concluir a operação. Tente novamente."`.

## 42. Responsividade

**Estrutural, por leitura de código — sem sessão autenticada disponível
nesta sessão** (ver §49): tabela desktop (`hidden lg:block`) e cards
mobile/tablet (`space-y-3 lg:hidden`) no mesmo breakpoint `lg` usado em
Clientes/Projetos/Suporte, em `/dominios` e na aba Domínios do Cliente;
formulário `max-w-3xl` com `grid sm:grid-cols-2`; ficha com `grid-cols-1
sm:grid-cols-2 lg:grid-cols-4`; filtros usam `flex-wrap`/`flex-col
sm:flex-row`. Confirmado ao vivo, sem login, que `/dominios`,
`/dominios/novo`, `/dominios/[id]`, `/dominios/[id]/editar` e
`/clientes/[id]?tab=dominios` redirecionam para `/login?next=...`, sem erro
de console/servidor relacionado a este código em nenhuma.

## 43. 1280×720

Mesma limitação estrutural do §42 — não verificado visualmente com sessão
ativa. Os mesmos breakpoints (`sm`/`lg`) já validados nessa resolução para
Clientes/Projetos/Suporte foram reaproveitados sem alteração específica para
Domínios; nenhum componente usa altura fixa que pudesse cortar conteúdo fora
da viewport.

## 44. Mobile

Mesma limitação. Estruturalmente: listagem vira cards; `DomainClientSelector`/
`DomainProjectSelector` abrem `Modal` full-width; `Select`s ocupam largura
total abaixo de `sm`; ações de status usam os mesmos componentes responsivos
do design system.

## 45. Acessibilidade

- Labels associados via `htmlFor`/`id` em todos os campos de `DomainForm`
  (registrador, datas, renovação automática, responsável, observações).
- `aria-label` em buscas/filtros/seletores sem label visível: "Buscar
  domínios", "Filtrar por status/vencimento/renovação automática/
  responsável", "Ordenar", "Buscar cliente"/"Buscar projeto" (dentro dos
  modais), "Limpar filtro de cliente", "Remover projeto vinculado".
- `aria-invalid` refletido em `Input`/`Textarea` via prop `error` (mesmo
  componente compartilhado já auditado em Clientes/Projetos/Suporte).
- Botões icon-only (limpar filtro de cliente, remover projeto, ações de
  status) todos com `aria-label` ou texto visível ao lado do ícone.
- `Select`, `Modal`, `Tabs` são primitivas Radix (acessíveis por padrão),
  reaproveitadas sem modificação.
- **Não verificado nesta etapa:** navegação por teclado/leitor de tela numa
  sessão viva — mesma limitação de ambiente já registrada em todos os
  checkpoints anteriores.

## 46. Contraste

`DomainStatusBadge`/`DomainExpirationBadge` usam variantes do `Badge`
compartilhado (`neutral`/`warning`/`success`/`danger`) — o mesmo componente
e os mesmos tokens de cor já usados (e já contrastados) nos badges de status
de Clientes/Projetos/Suporte; nenhuma cor nova foi criada para Domínios.
`active` usa `success`; `transferring` usa `warning`; `inactive` usa
`neutral`; situação `expired` usa `danger` (único tom crítico); `due_*` usam
`warning`; `ok`/`not_applicable` usam `neutral` — confirmado por leitura de
`status-badge.tsx`/`expiration-badge.tsx`.

## 47. Segurança de credenciais/segredos

Revalidado por `grep`: nenhum campo de senha, EPP/Auth Code, API key, token,
secret ou chave privada em nenhum schema/componente/service de Domínios
(Checkpoint A §23/§25, reafirmado). O aviso fixo no formulário ("Nunca
registre senhas, códigos de transferência (EPP), tokens ou chaves aqui")
está presente no campo Observações. Conteúdo de `notes` confirmado ausente
de `activity_events`/`audit.log` (fundação, testado no Checkpoint B) — a
timeline e a auditoria mostram só o rótulo "observações" como campo
alterado, nunca o texto.

## 48. Fluxo ponta a ponta

Não executado — depende diretamente do QA visual autenticado (§49), que
está pendente pelo mesmo motivo de ambiente. Nenhum dado de teste foi criado
em produção.

## 49. QA visual autenticado

**Permanece pendente.** Não há sessão autenticada disponível nesta sessão.
Respeitando as instruções explícitas desta etapa, não foi solicitada nem
gerada nenhuma credencial, magic link, cookie ou token, e nenhum bloqueio de
segurança foi contornado. Verificado sem login, via Browser pane real
(`navigate`/`read_console_messages`, não presumidos): `/dominios`,
`/dominios/novo`, `/dominios/00000000-0000-0000-0000-000000000000`,
`/dominios/00000000-0000-0000-0000-000000000000/editar` e
`/clientes/00000000-0000-0000-0000-000000000000?tab=dominios` redirecionam
corretamente para `/login?next=...`. Os únicos erros de console observados
foram falhas de conexão WebSocket de HMR do próprio servidor de
desenvolvimento (`ws://localhost:3000/_next/hmr?...`) — ruído esperado do
ambiente de preview, não um erro da aplicação. `npm run build` prova que
todo o código (imports, JSX, Server Actions, das 4 rotas de Domínios e de
todos os componentes) compila e resolve sem erro.

## 50. Fluxo ponta a ponta (repetido do pedido)

Ver §48.

## 51. Regressão de Clientes

- `src/app/(app)/clientes/[id]/page.tsx`: única mudança desta linha de
  trabalho foi o Checkpoint C2 (aba Domínios real) — inalterado nesta etapa.
- `src/components/clients/client-timeline.tsx`: única mudança foi o
  Checkpoint C2 (tradução de Domínios) — inalterado nesta etapa. Os testes
  de `client-timeline.test.tsx` (Cliente/Projeto/Suporte/Domínios)
  reexecutados, verdes.
- Nenhum outro arquivo de Clientes foi tocado nesta etapa nem desde o C2 de
  Domínios — confirmado por `git status`/leitura.

## 52. Regressão de Projetos

Nenhum arquivo de Projetos foi tocado nesta etapa nem em nenhum checkpoint
de Domínios até aqui. Project masking, timeline própria do Projeto, filtros
— tudo reexecutado dentro da suíte completa, sem regressão.

## 53. Regressão de Suporte

Nenhum arquivo de Suporte foi tocado nesta etapa nem em nenhum checkpoint de
Domínios até aqui. `ticket_number`, comentários imutáveis, timeline própria
do chamado, tradução visual (C2.1) — tudo reexecutado dentro da suíte
completa, sem regressão.

## 54. Dashboard

`git diff -- "src/app/(app)/dashboard/page.tsx"` retornou **vazio** —
nenhuma mudança, nenhum KPI de Domínios adicionado, conforme decisão já
registrada em C2 §30 e reconfirmada aqui.

## 55. Bugs encontrados

1. Formatação de data/hora inconsistente na coluna "Atualizado em" da
   listagem `/dominios` e da aba Domínios da Ficha do Cliente (sem hora,
   diferente do rodapé da ficha) — **corrigido** (§2).

Nenhum outro bug — schema, RLS, grants, normalização de `domain_name`,
unicidade parcial, project masking, status, version, timeline, FK
composta/tripla e integração com Cliente permanecem exatamente como
aprovados, sem qualquer divergência encontrada nesta revisão linha a linha.

## 56. Bugs corrigidos

Ver §55, item 1. Nenhuma migration, schema, RLS, service ou repository foi
alterado — apenas dois componentes de apresentação.

## 57. Testes novos

Nenhum teste dedicado foi adicionado para o bug de formatação (§55) — é uma
troca de opção de formatação já coberta indiretamente pelo comportamento
padrão de `Intl.DateTimeFormat` (não uma lógica nova); um teste redundante
ali só infla a suíte sem cobrir nada novo, mesma decisão já tomada no
Checkpoint D de Suporte para o bug equivalente.

## 58. `npm run test`

**734 aprovados, 2 pulados** (37 arquivos) — idêntico ao fim do C2 (o bug
corrigido nesta etapa não tinha teste dedicado a criar, ver §57).

## 59. `npm run test:foundation`

**512 aprovados**, 0 falhas (17 arquivos) — idêntico ao Checkpoint C2.

## 60. `npm run lint`

**0 erros, 0 avisos.**

## 61. `npm run typecheck`

Limpo (`tsc --noEmit`).

## 62. `npm run build`

`rm -rf .next && npm run build`: **concluído com sucesso**. Todas as 28
rotas compilam, incluindo as 4 de Domínios, todas dinâmicas (`ƒ`); nenhuma
rota quebrada.

## 63. Documentação

Criado este relatório (`docs/dominios-checkpoint-d.md`). Atualizações
mínimas e factuais:

- [`README.md`](../README.md): parágrafo de Domínios adicionado
  (Checkpoints A–C2/D concluídos, testes 734+2, "tecnicamente pronto,
  aguardando publicação" — sem marcar como publicado); nota de abertura
  ajustada (Domínios deixou de estar "não implementado").
- [`docs/roadmap.md`](roadmap.md): seção "Continuidade — Domínios"
  adicionada com a mesma conclusão acima; "ordem de trabalho" atualizada
  (Domínios sai da lista de pendentes, entra Infraestrutura como próximo);
  Fase 1 continua explicitamente em aberto (Infraestrutura pendente).
- [`docs/banco.md`](banco.md): nota de continuidade da migration `0006`
  adicionada, incluindo o achado do Checkpoint C1 (migration já aplicada ao
  início daquela etapa, tratada como aplicação genuína após revisão
  explícita).
- [`docs/seguranca.md`](seguranca.md): nota de continuidade da autorização
  de Domínios adicionada (RLS, `anon` sem grants, `service_role` sem
  `DELETE`, quarto ramo de `activity_select`), revalidada sem alteração
  nesta etapa.

Nenhum dos quatro arquivos foi reescrito — só os parágrafos diretamente
relacionados ao estado de Domínios.

## 64. `git diff --stat`

```
 README.md                                          | 21 ++++-
 docs/banco.md                                      | 17 ++++
 docs/roadmap.md                                    | 35 ++++++--
 docs/seguranca.md                                  | 15 ++++
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
 17 files changed, 275 insertions(+), 69 deletions(-)
```

(`src/app/(app)/dominios/page.tsx` e
`src/components/domains/client-domains-tab.tsx`, corrigidos nesta etapa,
estão dentro de diretórios ainda não rastreados — aparecem em `git status`
como parte do `??` de `src/app/(app)/dominios/`/`src/components/domains/`,
não neste `diff --stat`, que só cobre arquivos já rastreados pelo Git.)

## 65. `git status`

Sem staging, sem commit. Mesmos arquivos rastreados modificados desde C2,
mais `README.md`/`docs/banco.md`/`docs/roadmap.md`/`docs/seguranca.md`
(documentação) e `docs/dominios-checkpoint-d.md` (novo). Nenhum arquivo
temporário, secret, `.env`, dump, screenshot ou usuário de teste hardcoded
— confirmado por `grep` de `console.log`/`TODO`/`FIXME`/`DATABASE_URL` em
`src/app/(app)/dominios`, `src/components/domains` e `src/lib/domains` (zero
ocorrências).

## 66. Confirmação: nenhuma migration nova

`src/server/db/migrations/` não ganhou nenhum arquivo novo. `0006_domains.sql`
permanece exatamente como aplicado no Checkpoint C1.

## 67. Confirmação: nenhum commit/push/deploy

Confirmado por `git status` (§65) — árvore de trabalho não commitada, `HEAD`
inalterado (`74515e4`), nenhum `git add`/`git commit`/`git push` executado.

## 68. Recomendação final para publicação

**Domínios é recomendado para publicação, com uma única ressalva de
ambiente:**

Verde: lint, typecheck, testes (734+2), foundation (512), build; permissions
corretas (`domain:read`+`client:read` leitura, soma `domain:write` escrita,
`project:read` nunca gate.ia o domínio, `scope=assigned` sempre negado);
cross-org correto (repository sempre com `orgId` explícito, RLS já validada
contra produção no C1); project masking correto (três camadas, com testes
de payload); unicidade parcial correta (4/4 casos, testado no C1); timeline
correta (própria do domínio e consolidada do Cliente, com tradução visual já
desde C2 — sem precisar de um C2.1 como Suporte); segurança de segredos
confirmada (nenhum campo de credencial, `notes` nunca em auditoria/eventos);
Clientes, Projetos e Suporte sem regressão; 1 bug visual isolado corrigido.

**Único ponto pendente: QA visual autenticado (§49)** — bloqueado por
ambiente (sem sessão disponível nesta sessão), não por código. Mesma
ressalva já aceita para Clientes, Projetos e Suporte antes de suas
respectivas publicações.

**Critério de pronto: atingido.** Marcado como *"tecnicamente pronto; QA
visual autenticado pendente"* — nenhuma validação visual foi inventada.

Parando aqui. Sem commit, push ou deploy. Aguardando aprovação final do
usuário antes de qualquer publicação.
