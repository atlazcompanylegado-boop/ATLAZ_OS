# Suporte — Hotfix: acesso a Projeto (`project:read`) e edição do chamado

Data: 16/09/2026. Escopo: correção cirúrgica no módulo Suporte já publicado
(commit `6cfc715`). **Sem migration, sem mudança de schema, RLS ou grants, sem
feature nova.**

**Publicado em produção em 16/09/2026** — commit `dcd70cb434bbdc08c9a6c52dab945a26f7cdecab`
(`dcd70cb`), deploy Render `dep-dal9mbm1egvs73f0jd70` (`live`, ~80s), smoke
test não destrutivo aprovado (§10).

Origem: risco R1 da [auditoria de Domínios](dominios-checkpoint-a.md) (§47).
Os checkpoints históricos de Suporte não foram reescritos.

## 1. Causa raiz

O contrato aprovado no Checkpoint A de Suporte (Opção A) diz que `project:read`
não bloqueia o chamado, mas controla tudo o que envolve o Projeto vinculado. A
implementação aplicou essa regra em **um único lugar**: o mascaramento da
**saída** de detalhe/listagem (`maskProjectVisibility`). Todo o resto do fluxo
ignorava `project:read`.

1. `listTicketProjects` e `getTicketProject` exigiam só `ticket:read` +
   `client:read` e devolviam **nome e status** de Projetos. O seletor de Projeto
   aparecia para todos, nos filtros de `/suporte` e no formulário.
   `/suporte?clientId=…&projectId=…` mostrava o nome no filtro.
2. O filtro `projectId` da URL era aplicado mesmo sem permissão.
3. A busca comparava sempre `projects.name`, o que permitia descobrir nomes de
   projeto por tentativa.
4. `createTicket`/`updateTicket` aceitavam vincular, trocar ou remover Projeto
   sem `project:read`.
5. A edição tratava o payload como substituição completa. Para quem não tem
   `project:read`, o formulário nascia sem projeto selecionado e enviava
   `projectId=""`. Resultado: salvar qualquer outra alteração gravava
   `project_id = NULL`, com evento "Projeto desvinculado".

### Achado adicional durante o hotfix (funcional, mais grave que o R1)

`ticketUpdateSchema` exigia `status`, mas o formulário de edição **não tem campo
de status** e a Server Action nunca o enviava. **Toda edição de chamado pela
interface falhava** com "Revise os campos informados.", para qualquer usuário,
com ou sem `project:read`. O erro de campo (`status: Required`) não era exibido
porque não há campo correspondente.

Os testes existentes chamavam o service com payload completo, e nunca houve QA
autenticado (pendência aceita na publicação). Por isso a falha não apareceu. Ela
foi reproduzida nesta sessão pela Server Action real com o mesmo `FormData` do
formulário. A correção é a mesma semântica de PATCH pedida para `projectId` (§3).

## 2. Risco e por que não era explorável hoje

- **Itens 1–5:** exposição de nome/status de Projeto e alteração indevida do
  vínculo por membros autenticados da mesma org com `ticket:read` +
  `client:read`, mas **sem** `project:read`. No snapshot somente leitura de
  15/09 (`docs/projetos-preflight.json`), todos os papéis com `ticket:read`
  (designer, dev, financeiro, socio) também têm `project:read`, e `super_admin`
  recebe o catálogo inteiro. **Nenhum papel atual conhecido alcançava o
  caminho vulnerável.** A falha ficaria ativa assim que qualquer papel
  recebesse `ticket:read` sem `project:read`, justamente o cenário para o qual
  a Opção A foi aprovada. Os grants reais não foram relidos nesta sessão (a
  leitura de produção segue bloqueada no ambiente).
- **Achado adicional:** afetava todos os usuários com `ticket:write` — a edição
  pela UI não funcionava em produção. Criação, ações de status, reabertura e
  comentários não eram afetados.
- Nenhum item permitia acesso cross-org nem ultrapassava a RLS. Todas as
  consultas continuam com `org_id` explícito.

## 3. Como foi corrigido

### Service (`src/server/services/ticket-service.ts`) — autoridade única

- `requireProjectAccess(actor)`: lança `forbidden` sem `project:read`. Sempre
  roda **antes** de validar a entrada ou consultar o banco, para que a resposta
  nunca revele se um Projeto existe.
- `listTicketProjects` e `getTicketProject`: exigem `project:read`.
- `scopeFilters()`: sem `project:read`, o `projectId` vindo da URL é
  **ignorado** (vira `null`). Decisão documentada: ignorar em vez de responder
  `forbidden`. O resultado passa a ser idêntico ao da listagem sem filtro, para
  projeto real ou UUID inventado, então não existe oráculo. A página continua
  funcional para quem só colou um link.
- `createTicket`: `projectId` não nulo exige `project:read`. Projeto real ou
  inexistente recebem o mesmo `forbidden`.
- `updateTicket`: `projectId` **presente** no payload (UUID, `null` ou vazio)
  exige `project:read`. Ausente, preserva o valor atual. Editar os demais campos
  não exige `project:read`.
- `mutate()`: allowlist explícita dos campos editáveis. `status` ausente
  preserva o status atual. `projectId` ausente preserva o vínculo.

### Validação (`src/lib/validation/ticket.ts`)

`ticketUpdateSchema` passa a declarar `status` e `projectId` como opcionais,
com semântica de PATCH: ausente = preservar; presente, inclusive vazio → `null`,
= alteração explícita. A criação não muda (sem `projectId` = sem projeto;
`status` padrão `open`).

### Repository (`src/server/repositories/ticket-repository.ts`)

`listTickets`/`countTickets` recebem `TicketQueryAccess` obrigatório.
- Sem `project:read`: o filtro por `projectId` não é aplicado e
  `projects.name` sai do predicado de busca.
- Vale igualmente para listagem e contagem.
- É defesa em profundidade além do service.

`TicketWrite` virou tipo explícito e completo (sem campos opcionais), para que o
repository nunca grave um campo "ausente".

### Server Action (`src/app/(app)/suporte/actions.ts`)

Allowlist por **presença**: `projectId` só é repassado quando o campo existe no
`FormData`. Ausente nunca vira `null`. Se o campo for injetado manualmente por
alguém sem permissão, o service **rejeita** a operação inteira (`forbidden`), em
vez de ignorar em silêncio.

A Action não resolve a sessão de novo para decidir isso. A autoridade fica num
único lugar (o service), e o formulário legítimo já não envia o campo a quem não
pode gerenciar Projeto.

### UI

- `TicketForm` (`canManageProject`):
  - sem `project:read`, não renderiza o seletor nem o campo oculto;
  - mostra só "Projeto vinculado" / "Nenhum projeto vinculado" e o aviso
    "Vincular ou alterar o Projeto exige acesso a Projetos";
  - mesmo que um chamador passe `projectId`/`projectName` por engano, eles não
    são renderizados.
- `TicketFilters` (`canFilterByProject`): sem permissão, o filtro de Projeto não
  existe. A dica da busca deixa de mencionar "projeto".
- `/suporte`: `getTicketProject` só é chamado com `project:read`.
- `/suporte/novo` e `/suporte/[id]/editar`: passam `canManageProject` a partir
  da sessão.
- Listagem, ficha e aba do Cliente já mostravam só "Projeto vinculado" sem
  permissão (inalterado).

### Revisão de consumidores

A busca por `projectName`, `projectId`, `projects.name`, `listTicketProjects`,
`getTicketProject`, `searchTicketProjects` e `TicketProjectSelector` em `src/`
confirmou:
- linhas de chamado só saem do service mascaradas (`listTickets`,
  `getTicketsPageData`, `getTicketDetail`, `getTicketWorkspace`);
- as funções do repository que leem Projeto só são alcançáveis por caminhos que
  já exigem `project:read`;
- a timeline consolidada do Cliente nunca preenche `projectName` para eventos de
  chamado.

`projectId` continua presente só em `audit.log` e no payload de
`activity_events`, sem nome. Nenhuma tela lê essas colunas. Esse desenho já
estava aprovado no Checkpoint B e não foi alterado.

## 4. Comportamento resultante

| Ação | Sem `project:read` | Com `project:read` |
|---|---|---|
| Listar/abrir/ver chamado | sim | sim |
| Ver nome/status/UUID/link do Projeto | não ("Projeto vinculado") | sim |
| Seletor de Projeto (listar/consultar) | não (`forbidden`, antes de qualquer consulta) | sim, só do Cliente |
| Filtro por Projeto | não existe; `projectId` na URL é ignorado | sim |
| Busca pelo nome do Projeto | não casa | casa |
| Criar chamado | sim, sempre sem projeto | sim, com ou sem projeto |
| Criar com `projectId` forjado | `forbidden` | validado (mesmo cliente/org) |
| Editar título/descrição/prioridade/responsável/prazo | sim, **vínculo preservado** | sim |
| Vincular/trocar/remover Projeto | `forbidden` | sim |
| Ações de status e comentários | sim, vínculo preservado | sim |

Cross-org inalterado: projeto de outra org ou de outro cliente continua
`invalid_project` (service + FK tripla).

## 5. Novos testes

| Arquivo | Testes | Cobre |
|---|---|---|
| `tests/integration/ticket-project-access.test.ts` (novo, em `test:foundation`) | 16 | A–P do pedido, cenário principal (Server Action real), `FormData` forjado, status preservado, ações de status/comentário |
| `tests/unit/ticket-project-access-ui.test.tsx` (novo) | 6 | formulário e filtros sem/com `project:read`; conjunto real de campos do `<form>` |
| `tests/helpers/ticket-form-fields.ts` (novo) | — | lista de campos compartilhada entre o teste de componente e o de integração |

O cenário principal (chamado com `status = in_progress`, Projeto A vinculado;
usuário com `ticket:read`, `ticket:write` e `client:read`, sem `project:read`)
passa pela `updateTicketAction` real, com o mesmo `FormData` que o formulário
renderizado envia — sem `status`, sem `projectId`. Editando **só a
prioridade**:
- a prioridade muda (`normal` → `high`);
- `status` continua `in_progress` (não regride para `open` nem qualquer outro
  valor por ausência no payload);
- `project_id` continua sendo o Projeto A;
- `version` avança de 1 para 2;
- os únicos eventos são `ticket.created` e `ticket.priority_changed`;
- `audit.log` tem exatamente `ticket.create` + `ticket.update`, com
  `before`/`after` refletindo só a mudança de prioridade;
- o formulário renderizado não contém nome nem UUID do Projeto.

Antes da correção, 12 dos 16 testes de integração falhavam contra o código
publicado. Os demais foram escritos para cobrir regressão e caminhos que já
estavam corretos.

## 6. Resultado

- `npm run lint`: 0 erros, 0 avisos.
- `npm run typecheck`: limpo.
- `npm run test`: **522 aprovados, 2 pulados** (antes 500 + 2; +22).
- `npm run test:foundation`: **359 aprovados** (antes 343; +16).
- `npm run build`: concluído; rotas de Suporte inalteradas.

## 7. Se os grants mudarem

A correção não depende dos grants atuais. Se um papel passar a ter
`ticket:read` sem `project:read`:
- ele vê e atende chamados normalmente;
- vê só "Projeto vinculado";
- não consegue listar, buscar, filtrar, vincular, trocar nem remover Projetos;
- ao editar um chamado, preserva o vínculo existente.

Se um papel ganhar `project:read`, as capacidades completas aparecem sem outra
mudança.

## 8. Confirmações

- Nenhuma migration nova; nenhum schema, RLS, policy ou grant alterado.
- `docs/dominios-checkpoint-a.md` não foi alterado, não foi incluído no commit
  do hotfix e permanece `untracked`; Checkpoint B de Domínios não iniciado.
- Commit isolado (§10) — nenhum arquivo fora do escopo de Suporte.

## 9. Riscos restantes

- Os grants reais de produção não foram relidos nesta sessão (leitura bloqueada
  pelo ambiente). A análise de exposição se apoia no snapshot de 15/09.
- Server Actions são endpoints públicos por natureza. A proteção está no
  service, que é coberto por testes. A UI só evita oferecer o que não é
  permitido.
- `audit.log` continua registrando o `projectId` (UUID, sem nome) nas edições,
  como aprovado no Checkpoint B. Quem tem `audit:read` lê isso via RLS.
- **QA autenticado permanece pendente após a publicação** (§10) — sem sessão
  disponível nesta sessão, não foi possível observar uma edição real feita por
  uma pessoa. O caminho está coberto pela `updateTicketAction` real em teste
  automatizado (§5), e o smoke test pós-deploy não encontrou erro de aplicação
  na janela do deploy.

## 10. Publicação

Commit `dcd70cb434bbdc08c9a6c52dab945a26f7cdecab` (`dcd70cb`) — isolado, só os
13 arquivos do hotfix (`git add` explícito por caminho, sem `-A`/`.`);
`docs/dominios-checkpoint-a.md` conferido fora do stage antes de commitar.

- **Branch:** `main`. **Push:** `9075f5a..dcd70cb`, sem force, sem conflito.
- **Deploy:** `dep-dal9mbm1egvs73f0jd70`, commit `dcd70cb` confirmado no
  objeto do deploy, status **`live`**, build+rollout em ~80s
  (`13:35:42Z`–`13:37:02Z`). O auto-deploy do serviço não disparou sozinho
  pelo push (mesmo comportamento já observado nas publicações anteriores);
  disparado manualmente via `trigger_deploy`, mesmo fluxo já usado, sem
  alterar nenhuma configuração do serviço.
- **Smoke test sem sessão** (`https://atlaz-os.onrender.com`): `/login` → 200;
  `/suporte` → `/login?next=%2Fsuporte` (200); `/suporte/novo` →
  `/login?next=%2Fsuporte%2Fnovo` (200). Zero erro de console, zero 500.
- **Logs de aplicação** (`list_logs`, nível `error`, janela `13:35:00Z`–
  `13:45:00Z`): zero linhas — nenhum erro disparado pelo código publicado.
- **Smoke autenticado:** não executado — sem sessão disponível nesta sessão;
  nenhuma credencial foi gerada. O caminho de edição está coberto pela
  `updateTicketAction` real em `tests/integration/ticket-project-access.test.ts`
  (§5), não por observação ao vivo.
