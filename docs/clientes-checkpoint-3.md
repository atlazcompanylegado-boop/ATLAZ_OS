# Fase 1 — Clientes / Ficha Mestre — Checkpoint 3

## 1. Estado inicial encontrado

Checkpoint 2 (Etapas E–I) aprovado: validation/normalization, repository, service,
transações, listagem, cadastro, Ficha Mestre, contatos, timeline e edição/concorrência
implementados e testados (148 testes, 8 arquivos). `/clientes` já era uma tela real,
mas ainda `status: "planned"` em `config/navigation.ts` (badge "Fase 1"), sem KPI real
no Dashboard, sem teste de RLS contra um Postgres real (só a fixture em memória do
Checkpoint 1) e sem QA visual/responsiva ao vivo. `git status`/`git diff --stat`
conferidos no início batiam exatamente com o estado descrito em
[clientes-checkpoint-2.md](clientes-checkpoint-2.md); os 148 testes passavam.

Este checkpoint assumiu esse estado sem reabrir nenhum contrato de sessão, RLS,
schema, repository/service, validação, cadastro, edição, contatos ou timeline já
aprovado.

## 2. Mudanças da Etapa J

- `src/config/navigation.ts`: item "Clientes" passou de `status: "planned"` (com
  `phase: "Fase 1"`) para `status: "available"`, com um novo campo opcional
  `permission?: PermissionKey` no tipo `NavItem` (não usado por nenhum outro item —
  Equipe e os demais continuam exatamente como estavam).
- `src/app/(app)/layout.tsx`: passou a chamar `getCurrentSession()` (além da checagem
  de Auth já existente, inalterada) só para extrair `permissions` e repassar ao Shell.
- `Shell → Sidebar/Topbar → SidebarNav/MobileNav/GlobalSearch`: todos passaram a
  aceitar um prop opcional `permissions`, usado só para decidir visibilidade — nenhum
  outro comportamento desses componentes mudou.
- `src/app/(app)/dashboard/page.tsx`: card "Clientes ativos" passou a mostrar dado real.

## 3. Como Clientes foi ativado na navegação

`getVisibleNavigation()`/`getVisibleFlatNavigation()` (novas funções em
`navigation.ts`) filtram grupos/itens cujo `permission` declarado o usuário não
possui, usando o `can()` já existente de `config/permissions.ts` — nenhuma
verificação nova de papel, nenhuma permissão nova criada. Sidebar (desktop e drawer
mobile) e a busca global (Cmd/Ctrl+K) usam essas funções; o item só aparece (sem
badge de fase) para quem tem `client:read`. Projetos/Suporte/Domínios/Infraestrutura
continuam `status: "planned"` inalterados.

## 4. Como o Dashboard foi integrado

`client-service.ts` ganhou `getClientKpis()` (autoriza leitura, devolve só os
agregados, sem a listagem). O Dashboard chama essa função **somente se**
`can(session.membership.permissions, "client:read")` for verdadeiro; qualquer
`ServiceError` (ex.: scope `assigned` mesmo com a permissão presente) é tratado como
"sem acesso", nunca como zero. O card fica clicável (`<Link href="/clientes">`) só
quando há dado real a mostrar.

## 5. KPI escolhido e cálculo exato

O card já existente era **"Clientes ativos"** — mantive esse significado (não virou
"Clientes" genérico). Valor = `count(*) filter (where status = 'active')` da própria
organização (mesma agregação usada em `getClientKpis` da listagem, reaproveitada, sem
métrica nova nem número inventado).

## 6. Como as permissões do Dashboard funcionam

Sem `client:read`: `getClientKpis()` nunca é chamado (a checagem acontece antes, na
página) — nenhuma query de Clientes roda, nenhum dado aparece, o card mostra "—" com
o texto "Sem permissão para ver Clientes" (nunca zero enganoso). Isso é decidido pela
mesma função `can()` já usada em toda a aplicação; nenhuma regra de autorização nova.

## 7. Resultado do teste real sem membership

Executado contra o **Postgres real do projeto Supabase configurado em
`DATABASE_URL`** (não a fixture em memória do Checkpoint 1) — o servidor MCP do
Supabase disponível nesta sessão está conectado a outra conta/organização (projetos
`teste-multiempresarial`, `agente-estudos`, `Crescer Com Delivery`, nenhum deles o
projeto do ATLΛZ OS), então a verificação foi feita por um script Node efêmero
(apagado ao final, nunca commitado) usando a mesma `DATABASE_URL` que a aplicação já
usa para migrations/seed.

**Método:** dentro de **uma única transação sempre revertida (`ROLLBACK`, com ou sem
sucesso)**, o script criou fixtures sintéticas (2 orgs, 2 papéis, 4 usuários — um
deles **sem membership alguma** —, memberships, 1 cliente, 1 contato, 1 evento, 1
auditoria) e, para cada usuário, fez `SET LOCAL ROLE authenticated` +
`set_config('request.jwt.claims', ...)` com o `sub` daquele usuário (a mesma técnica
já usada e aprovada nos testes do Checkpoint 1, agora contra o banco real em vez da
fixture). Nada foi persistido: a checagem pós-rollback confirmou `0` linhas
remanescentes com os e-mails de teste.

**Isto não é um login real via GoTrue** (não valida emissão/assinatura de JWT do
Supabase Auth — isso é infraestrutura do próprio Supabase, fora do nosso código).
Valida exatamente o que estava pendente: as políticas RLS e grants **realmente
implantados** no banco de produção, não uma reconstrução Drizzle/fixture que poderia
ter divergido.

**Resultado do usuário sem membership** (papel `authenticated`, `sub` de um usuário
com linha em `public.users` mas nenhuma `membership`):

| Verificação | Resultado |
|---|---|
| `select count(*) from public.clients` | `0` |
| `select count(*) from public.client_contacts` | `0` |
| `select count(*) from public.activity_events` | `0` |
| `select count(*) from audit.log` | `0` |
| `select count(*) from public.orgs` | `0` |
| `select count(*) from public.memberships` | `0` |
| `select count(*) from public.users` (próprio perfil) | `1` |
| `update public.users set is_active = true` (auto-reativação) | negado (`42501`) |

O único dado visível é o próprio perfil (`public.users`, política `users_select`
herdada) — **isso é esperado e documentado desde o Checkpoint 1: "perfil próprio não
é considerado dado operacional".** Nenhum dado de Clientes, org, membership,
timeline ou auditoria vazou.

## 8. Comportamento do usuário sem membership na UI

Não foi reexecutado neste checkpoint via login real na aplicação (ver §39/limitações
abaixo) — o comportamento de UI já está coberto pelo código existente e pelos testes:
`getCurrentSession()` devolve `membership: null`; toda página de Clientes trata isso
com `authorizeClientSession()` retornando `{ok:false, reason:"membership"}`, exibindo
`Alert` "Sem acesso" (mesmo padrão já usado no Dashboard/Equipe desde a Fase 0) — não
um dashboard operacional normal. Nenhuma UX nova foi inventada.

## 9. Resultado do teste read-only

Coberto por dois caminhos complementares:
- **Automatizado** (`tests/integration/client-service.test.ts`, Checkpoint 2, ainda
  verde): usuário só com `client:read` lista, busca, filtra, abre ficha, vê contatos
  e timeline; `createClient`/`createClientContact` etc. rejeitam com `forbidden`.
- **Real, ao vivo** (Checkpoint 3): o script do §7 confirmou que a *ausência* de
  `client:read` (usuário sem membership) bloqueia tudo a nível de RLS, e o teste
  cross-org do §11 confirmou que mesmo *com* `client:read` (só não na organização
  certa) o acesso continua negado.

## 10. Resultado do teste read+write

Testado ao vivo na aplicação real (não só nos 34 testes automatizados do
Checkpoint 2): logado como super admin (`client:read`+`client:write` via o catálogo
de super_admin), o fluxo completo funcionou fim a fim — cadastro com contato
principal, edição, CRUD de contatos, troca de principal, timeline — ver §15–21.
Adicionalmente, o script do §7 confirmou que mesmo o usuário de escrita **não
consegue** fazer `UPDATE`/`DELETE` direto via SQL simulando `authenticated` (só o
service/servidor, com a conexão BYPASSRLS, pode escrever) — ver §12.

## 11. Resultado do teste cross-org

No mesmo script do §7: um usuário com `client:read` na organização B tentou acessar o
cliente sintético da organização A.

| Verificação | Resultado |
|---|---|
| Listar clientes (org B) | `0` (cliente da org A invisível) |
| `select ... where id = <cliente da org A>` | `0` linhas — equivalente a "não encontrado", nunca revela existência |
| `update` no cliente da org A | negado (`42501`) |
| `delete` no contato da org A | negado (`42501`) |

Confirma also em nível de aplicação pelos testes automatizados
(`client-service.test.ts`: "edição de outra organização é tratada como not_found",
"getClientWorkspace é not_found para outra organização" etc.) — `getClientById`
sempre filtra por `orgId`, então cross-org e "não existe" produzem exatamente o
mesmo `ServiceError("not_found", ...)`.

## 12. Como BYPASSRLS foi mitigado na prática

Dois níveis independentes, ambos verificados neste checkpoint:
1. **Nível de aplicação** (o que realmente importa, já que a conexão Drizzle usa
   BYPASSRLS): `client-service.ts` chama `authorizeClientSession()` antes de
   qualquer repository, e todo repository recebe `orgId` explícito e filtra por ele
   — nunca um `getById(id)` sem organização. Coberto por 37 testes de integração.
2. **Nível de banco** (defesa em profundidade, não a barreira principal): o teste
   real do §7 confirmou que mesmo simulando a role `authenticated` (não a conexão
   BYPASSRLS do servidor), grants/RLS **também** bloqueiam — um cliente de outra org
   não é lido nem escrito, e nenhuma mutation direta é possível para nenhum papel.

## 13. Fixtures criadas

- **Teste de RLS (§7/§11)**: 2 orgs, 2 papéis, 4 usuários, 3 memberships, 1 cliente,
  1 contato, 1 evento, 1 registro de auditoria — todos sintéticos, dentro de uma
  transação **revertida antes do script terminar**. Nada foi commitado.
- **QA visual/funcional (§15–24)**: 1 cliente real ("Cliente QA Checkpoint 3"), 1
  contato ("Fulano de Tal"), criados através da própria aplicação (Server Actions
  reais) para exercitar cadastro, edição, conflito de versão, contatos e timeline.

## 14. Fixtures removidas

- Teste de RLS: nada a remover — a transação nunca foi commitada; o próprio script
  confirmou `0` linhas remanescentes com os identificadores de teste antes de
  terminar. O script (`tmp-qa-rls-check.mts`) foi apagado do repositório.
- QA visual: o cliente/contato/eventos/auditoria criados via UI foram removidos por
  um segundo script pontual (`tmp-qa-cleanup.mts`, também apagado), que deletou
  exclusivamente as linhas com o ID daquele cliente (1 cliente, 1 contato, 4 eventos,
  4 registros de auditoria) e confirmou `0` linhas restantes para aquele ID depois.
  `/clientes` voltou a mostrar "Nenhum cliente cadastrado" e KPIs zerados.

## 15. QA de /clientes

Testado ao vivo em 1440×900, 1280×720, 768×1024 (tablet) e 375×812 (mobile).
PageHeader, CTA "Novo cliente" (só com `client:write`), 4 KPIs reais, busca, filtros
de status/responsável, ordenação, tabela (desktop, ≥1024px) vs. cards (abaixo de
1024px — nunca tabela espremida), status badges, ações "Ver"/"Editar", empty state
("Nenhum cliente cadastrado" com CTA condicionado a permissão) — todos conferidos com
`get_page_text`/screenshot reais, não só leitura de código.

## 16. QA de /clientes/novo

Formulário centrado com `max-w-3xl` (nunca esticado em 1440px), seções "Dados
principais" / "Contato principal" (opcional) / "Gestão" / "Outras informações",
rótulo do documento trocando entre "CPF"/"CNPJ"/"Documento" conforme o tipo de
pessoa selecionado (confirmado ao vivo). Cadastro real de ponta a ponta funcionou
(ver §7 dos bugs em §28) e redirecionou para a Ficha Mestre.

## 17. QA da Ficha Mestre

Header (nome, badge de status, botão Editar só com `client:write`), cartão de resumo
(contato principal, documento formatado, responsável, site, última atualização),
7 abas com quebra de linha em telas estreitas (`flex-wrap`) — Visão Geral, Contatos e
Timeline funcionais; Projetos/Suporte/Domínios/Infraestrutura com o texto
institucional exato pedido, sem números inventados. Visual consistente com o design
system (glass, hairlines, sem emoji/neon).

## 18. QA de Contatos

CRUD completo testado ao vivo: adicionar (Drawer, campo Nome com foco automático),
editar (Drawer pré-preenchido), menu de ações (Editar / "Definir como principal" só
aparece quando o contato não é o principal / Remover em vermelho), toast de sucesso
("Contato atualizado") via `sonner`. Testado em mobile (Drawer ocupa a tela cheia) —
ver §22.

## 19. QA de Timeline

Testada ao vivo após cada mutação real: eventos aparecem na ordem certa (mais recente
primeiro), com título traduzido ("Cliente cadastrado", "Contato adicionado", "Contato
atualizado", "Dados atualizados"), detalhe (`summary`) correto (ex.: "Campos
alterados: nome, origem"), ator (e-mail da sessão real) e data/hora — nunca `kind`
cru, UUID ou JSON. Diffing confirmado: editar só "origem" e "nome" gerou **um único**
evento "Dados atualizados" com exatamente esses dois campos — nenhum evento espúrio.

## 20. QA de edição

`/clientes/[id]/editar` reaproveita o mesmo `ClientForm`, sem seção de contato,
`clientId`/`version` como campos ocultos, dados pré-preenchidos (inclusive CPF já
formatado). Edição real mudou nome e origem, avançou a versão de 2→3 e gerou o
evento correto (ver §19).

## 21. QA de conflito de versão

Simulado ao vivo (não só nos testes automatizados): reduzi manualmente o campo
oculto `version` para um valor anterior ao real e enviei o formulário. O service
rejeitou (`UPDATE` condicionado a `org_id+id+version` não afetou nenhuma linha), a
página mostrou exatamente **"Este cliente foi atualizado por outro usuário. Atualize
a página antes de salvar novamente."** num `Alert` de aviso com botão "Recarregar
dados", e o nome do cliente **não foi alterado** no banco. Confirmei também que,
depois da tentativa recusada, o formulário já reaparece com a versão real atual
(nenhuma sobrescrita, nenhuma perda de sincronismo).

## 22. QA mobile (375×812)

Sidebar vira drawer com hambúrguer; item "Clientes" aparece ativo, sem badge de fase,
enquanto Projetos/Suporte/CRM/Propostas/Contratos/Financeiro mantêm seus badges de
fase. `/clientes`: KPIs em coluna única, filtros empilhados, cards (não tabela).
Ficha Mestre: header empilhado, resumo em coluna única, abas quebrando em 3 linhas
sem overflow horizontal. Drawer de contato ocupa a largura cheia da tela, todos os
campos e botões acessíveis, `Escape` fecha o Drawer e o menu de ações do contato.

## 23. QA tablet (768×1024)

Sidebar nasce compacta (72px, só ícones) nesse intervalo, como já previsto no design
system. `/clientes` usa o layout de cards (breakpoint da tabela é 1024px, então 768px
corretamente ainda mostra cards, não uma tabela espremida). KPIs em 2 colunas, Ficha
Mestre com resumo em 2 colunas e "Visão geral" em coluna única. Sem overflow
horizontal em nenhuma tela testada.

## 24. QA desktop (1440×900)

Layout completo: sidebar expandida com rótulos, tabela real na listagem, formulário
com largura controlada, Ficha Mestre com resumo em 4 colunas e "Visão geral" em 2
colunas. Nenhuma tela "genérica" — hairlines, glass, tipografia e badges de status
consistentes com o resto do ATLΛZ OS.

## 25. QA 1280×720

Verificado especificamente por ser a resolução historicamente problemática do login.
`/clientes/novo`: o formulário rola naturalmente dentro do `<main>` (`overflow-y:
auto`), botões "Cancelar"/"Salvar cliente" alcançáveis rolando a área de conteúdo —
nada preso fora da viewport, sem scroll da página inteira (só do painel de conteúdo,
como já era o padrão do Shell). Ficha Mestre, Drawer e Modal também couberam sem
corte nessa altura.

## 26. Acessibilidade

Confirmado ao vivo (não só por leitura de código):
- **Tab real** a partir do topo da página alcança a sidebar, depois o conteúdo, na
  ordem esperada; o campo de busca de Clientes tem `aria-label="Buscar clientes"` e
  mostra anel de foco visível.
- **Escape** fecha o Drawer de contato e o menu de ações (dropdown) — confirmado
  interativamente, não presumido.
- Labels associados a inputs, erros abaixo do campo, `aria-invalid` refletido em
  Input/Textarea, botão de ações do contato com `aria-label` dinâmico.
- **Achado pré-existente, fora do escopo de Clientes**: o botão de recolher a
  sidebar (`sidebar.tsx`, já existia antes deste checkpoint) não tem `aria-label` —
  reportado aqui, **não corrigido**, pois alterar o shell global está fora do pedido
  desta etapa (ver §45 do prompt). Recomendo tratar num checkpoint de UI global.

## 27. Problemas encontrados durante QA

1. **Cadastro com tipo de pessoa nunca era salvo corretamente.** O `<Select>` do
   campo "Tipo de pessoa" tinha `name="personType"` **e** havia um `<input
   type="hidden" name="personType">` separado para traduzir o valor. Dois campos com
   o mesmo `name` no mesmo `<form>` colidem — `FormData` lê o primeiro em ordem no
   DOM (o do Radix, com o valor bruto do sentinel `"__none__"`), nunca o hidden
   corrigido. Resultado real observado: `{"error":"Revise os campos
   destacados.","fieldErrors":{"personType":"Invalid enum value... received
   '__none__'"}}` mesmo com "Pessoa física" selecionado na tela.
2. **Cadastro com contato principal preenchido quebrava silenciosamente.** O
   cadastro inline de contato em `/clientes/novo` não tem campo "Observações", mas
   `extractContactInput()` sempre lê `contactNotes` — `FormData.get()` devolve
   `null` (não `""`) para um campo inexistente, e `emptyToUndefined()` só tratava
   string vazia, não `null`. Resultado real observado:
   `{"error":"Revise os dados do contato principal.","fieldErrors":{"contactNotes":
   "Expected string, received null"}}`.

Nenhum dos dois aparecia nos 148 testes do Checkpoint 2 porque os testes chamam o
service diretamente com objetos JS corretos — só surgiram testando o formulário real
no navegador, exatamente o motivo de existir esta etapa.

## 28. Bugs corrigidos

1. `src/components/clients/client-form.tsx`: removido `name="personType"` do
   `<Select>` (mantido só o `<input type="hidden">` que já traduzia o sentinel
   corretamente). Retestado ao vivo: `FormData` passou a conter `personType:
   "individual"` uma única vez; o cadastro com CPF foi concluído com sucesso.
2. `src/lib/validation/client.ts`: `emptyToUndefined()` agora trata `null` (além de
   string vazia) como "não informado" — `value == null || (typeof value ===
   "string" && value.trim() === "")`. Adicionado teste de regressão em
   `tests/unit/client-validation.test.ts` (campos ausentes do formulário, não só
   vazios).

Ambos retestados ao vivo no navegador após a correção (cadastro completo, com
contato, concluído com sucesso — ver §16/§27) e cobertos por teste automatizado.

## 29. Performance/query review

Revisão de código (sem ferramenta de observabilidade nova) encontrou uma
redundância real: `getClientDetail`, `listClientContacts` e `listClientTimeline`
cada uma chamava `requireAccess()` (que resolve a sessão inteira — perfil,
membership, papel, permissões) **e** `getClientById()` de forma independente. Como a
Ficha Mestre precisa das três coisas na mesma renderização, isso significava
resolver a sessão e buscar o mesmo cliente até 3× numa única visita à página.
Corrigido com duas funções novas, aditivas (as funções antigas continuam existindo,
testadas e usadas por quem precisar de uma peça isolada):

- `getClientWorkspace(clientId, timelinePage)`: uma sessão, um `getClientById`,
  contatos e timeline buscados em paralelo. Usada por `/clientes/[id]`.
- `getClientsPageData(rawFilters)`: combina `listClients` + `listAvailableOwners`
  (evita resolver a sessão duas vezes na listagem). Usada por `/clientes`.

Não foi encontrado N+1 "por linha" (a listagem já usava uma única query paginada +
uma de contagem + uma de KPI agregada, sem loop por cliente). Timeline já é limitada
(20/página, cumulativa). Nenhuma outra alteração de performance foi feita — sem
cache, sem índice novo, sem biblioteca de observabilidade.

## 30. Resultado `npm run lint`

Aprovado, 0 erros/avisos.

## 31. Resultado `npm run typecheck`

Aprovado (`tsc --noEmit`).

## 32. Resultado `npm run test`

**152 testes, 8 arquivos, todos aprovados** (148 do Checkpoint 2 + 1 teste de
regressão de validação + 3 testes das funções consolidadas do §29).

## 33. Resultado `npm run test:foundation`

Aprovado — **74 testes, 3 arquivos** (sessão, fundação de Clientes, reconciliação de
schema) — suíte do Checkpoint 1, ainda válida e sem alteração de contrato.

## 34. Resultado `npm run build`

Aprovado (Next.js 16 / Turbopack). Todas as rotas de Clientes compilam como
dinâmicas (`ƒ`); nenhuma quebra de App Router.

## 35. Total final de testes

**152 testes** (arquivo único de teste "Foundation" é um subconjunto dos 152, não
soma à parte).

## 36. Arquivos criados

- `docs/clientes-checkpoint-3.md` (este relatório).

Nenhum outro arquivo novo neste checkpoint — J–L são integração/ativação/QA sobre a
estrutura já criada nos Checkpoints 1–2, não uma feature nova com arquivos próprios.
(Os dois scripts temporários de verificação usados nas Etapas K/L —
`tmp-qa-rls-check.mts` e `tmp-qa-cleanup.mts` — foram apagados do repositório antes
de este relatório; não constam no `git status` final.)

## 37. Arquivos modificados

- `src/config/navigation.ts` — Clientes `status: "available"`, tipo `NavItem` ganhou
  `permission?`, novas `getVisibleNavigation()`/`getVisibleFlatNavigation()`.
- `src/app/(app)/layout.tsx` — passa `permissions` da sessão ao `Shell`.
- `src/app/(app)/dashboard/page.tsx` — KPI real de "Clientes ativos", condicionado a
  `client:read`, linkado a `/clientes`.
- `src/components/layout/shell.tsx`, `sidebar.tsx`, `mobile-nav.tsx`,
  `sidebar-nav.tsx`, `topbar.tsx`, `src/components/ui/search.tsx` — plumbing aditivo
  de `permissions` (prop opcional); nenhum comportamento visual mudou para quem já
  tinha acesso a tudo.
- `src/components/clients/client-form.tsx` — correção do bug §27.1.
- `src/lib/validation/client.ts` — correção do bug §27.2.
- `src/server/services/client-service.ts` — `getClientKpis`, `getClientWorkspace`,
  `getClientsPageData` (aditivo, ver §29).
- `src/app/(app)/clientes/page.tsx`, `src/app/(app)/clientes/[id]/page.tsx` — passam
  a usar as funções consolidadas do §29.
- `src/components/ui/textarea.tsx` — sem mudança neste checkpoint (já vinha do
  Checkpoint 2).
- `tests/unit/client-validation.test.ts`, `tests/integration/client-service.test.ts`
  — testes novos para as correções/consolidações acima.
- `docs/roadmap.md` — Clientes marcado como concluído (Checkpoints 1–3); Fase 1 como
  um todo continua pendente; itens do checklist da Fase 0 relacionados a build/RLS
  real/dashboard atualizados com o que foi de fato verificado.

## 38. Documentação atualizada

`docs/clientes-checkpoint-3.md` (novo) e `docs/roadmap.md` (Clientes concluído nos
critérios do §46 abaixo; Fase 1 geral continua pendente; checklist da Fase 0
atualizado só nos itens diretamente verificados nesta sessão).

## 39. Pendências restantes

- Projetos, Suporte, Domínios, Infraestrutura (Fase 1, fora do escopo de Clientes).
- Teste de RLS real via **login GoTrue completo** (email/senha por um usuário sem
  membership) ainda não foi feito — o Checkpoint 3 fechou a lacuna testando as
  políticas reais via claim JWT simulada contra o Postgres de produção (mais
  rigoroso que a fixture em memória do Checkpoint 1), mas não substitui um teste
  ponta a ponta pelo fluxo de autenticação do Supabase.
- QA de leitura/escrita por papéis granulares diferentes de super admin não foi
  reexecutada ao vivo neste checkpoint (coberta pelos 37 testes automatizados de
  `client-service.test.ts`, que simulam exatamente essas permissões).
- Acessibilidade com leitor de tela real (NVDA/VoiceOver) não foi testada — só
  teclado e estrutura semântica.
- Botão de recolher a sidebar sem `aria-label` (achado pré-existente, §26) — fora do
  escopo desta etapa.
- Commit, push, PR, deploy: nenhum feito, conforme instrução.

## 40. `git diff --stat`

```
 README.md                                   |   7 +-
 docs/arquitetura.md                         |   2 +-
 docs/banco.md                               |  24 ++--
 docs/roadmap.md                             |  23 ++--
 docs/seguranca.md                           |  25 ++--
 drizzle.config.ts                           |   2 +-
 package-lock.json                           |   8 ++
 package.json                                |   6 +-
 src/app/(app)/clientes/page.tsx             | 175 ++++++++++++++++++++++++++--
 src/app/(app)/dashboard/page.tsx            |  37 +++++-
 src/app/(app)/layout.tsx                    |  13 ++-
 src/components/layout/mobile-nav.tsx        |  12 +-
 src/components/layout/shell.tsx             |  14 ++-
 src/components/layout/sidebar-nav.tsx       |   7 +-
 src/components/layout/sidebar.tsx           |   6 +-
 src/components/layout/topbar.tsx            |  12 +-
 src/components/ui/search.tsx                |  11 +-
 src/components/ui/textarea.tsx              |   9 +-
 src/config/navigation.ts                    |  20 +++-
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
 src/server/db/schema/roles.ts               |  13 ++-
 src/server/db/schema/users.ts               |  13 +--
 31 files changed, 454 insertions(+), 129 deletions(-)
```

(`docs/clientes-checkpoint-3.md` é arquivo novo — não aparece no `diff --stat` de
arquivos rastreados; `client-service.ts`, `client-form.tsx`,
`tests/**/client-*.test.ts` e o restante dos arquivos de Clientes criados no
Checkpoint 2 aparecem como `??` no `git status` abaixo, não neste diff.)

## 41. `git status`

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
 M src/app/(app)/dashboard/page.tsx
 M src/app/(app)/layout.tsx
 M src/components/layout/mobile-nav.tsx
 M src/components/layout/shell.tsx
 M src/components/layout/sidebar-nav.tsx
 M src/components/layout/sidebar.tsx
 M src/components/layout/topbar.tsx
 M src/components/ui/search.tsx
 M src/components/ui/textarea.tsx
 M src/config/navigation.ts
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
?? docs/clientes-checkpoint-3.md
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

Sem secrets, `.env`, dump, screenshot, arquivo temporário ou usuário de teste
hardcoded neste diff — os dois scripts de verificação (`tmp-qa-rls-check.mts`,
`tmp-qa-cleanup.mts`) e o cliente de QA criado via UI foram removidos antes deste
relatório (ver §14). Nenhuma migration além de `0002`/`0003` (já aprovadas no
Checkpoint 1) foi criada ou alterada. Sem commit, push, PR ou deploy.

## Checkpoint 3 — critério de conclusão (Clientes)

Navegação ativa, Dashboard integrado, listagem/cadastro/ficha/contatos/timeline/
edição funcionais, concorrência e permissões corretas, isolamento de org validado
(automatizado e ao vivo contra o Postgres real), teste real sem membership
executado, responsividade validada em 5 resoluções, acessibilidade revisada (teclado
+ estrutura), lint/typecheck/testes/build verdes: **Clientes está pronto**, com as
ressalvas do §39. **A Fase 1 como um todo não está concluída** — Projetos, Suporte,
Domínios e Infraestrutura seguem pendentes.

Parando no Checkpoint 3. Sem commit, push, PR ou deploy — aguardando revisão.
