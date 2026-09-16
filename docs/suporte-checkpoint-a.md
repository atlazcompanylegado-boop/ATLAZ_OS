# Suporte — Checkpoint A: auditoria e proposta

Data: 16/09/2026. **Aguardando aprovação. Nenhuma implementação de Suporte.**

## Base auditada e limites

- Branch `main`, HEAD `b166c74` ("docs: marca Projetos como publicado — Checkpoint D.2"). `git status`: árvore limpa. `git diff --stat`: vazio. `git log --oneline -15` confirma Clientes (`5d68be6`) e Projetos (`82539d2`, `b166c74`) publicados; nenhum commit de Suporte existe.
- Lidos README, roadmap, banco, segurança; os três checkpoints de Clientes; os sete checkpoints de Projetos (A, B, C1, C2, D, D1, D2); schema Drizzle completo (`orgs`, `users`, `memberships`, `roles`, `role-permissions`, `permissions`, `clients`, `client-contacts`, `projects`, `activity-events`, `audit-log`); `config/permissions.ts`; `config/navigation.ts`; `lib/auth/session.ts`, `client-access.ts`, `project-access.ts`; `client-service.ts`, `project-service.ts` e seus repositories; as migrations `0002`–`0004` (RLS, grants, policy de `activity_events`); `tests/helpers/projects.ts` e a suíte de fundação.
- Esta é uma auditoria do repositório local **mais uma verificação pontual, somente leitura, contra o Supabase real** (ver §3 abaixo) — sem DDL/DML, sem exportar dado de negócio, script apagado ao final (mesmo padrão do preflight de Projetos A/B). Não recria nada da fundação existente (Auth, RBAC, memberships, RLS, `audit.log`, `activity_events`, Design System, navegação permissionada, Clientes, Projetos, timeline consolidada, version/concurrency, services/repositories, Server Actions, testes de fundação).

## 1. Estado atual de `/suporte`

Existe apenas `src/app/(app)/suporte/page.tsx`, renderizando `ModulePlaceholder` com o texto: *"Chamados por cliente/projeto, prioridade, categoria, responsável e regras de cobrança de suporte."* Esse texto é intenção histórica da Fase 0, não requisito definitivo — em particular, "categoria" e "regras de cobrança" não aparecem em nenhuma decisão aprovada até aqui e não devem ser assumidas como escopo da V1 sem pedido explícito (ver §43).

Não existem schema `support_tickets`/`tickets`/`ticket_comments`, service, repository, validação, cadastro, detalhe ou testes de Suporte. Nenhum código parcial foi encontrado.

## 2. Placeholders auditados

- **Navegação** (`src/config/navigation.ts`): `{ label: "Suporte", href: "/suporte", icon: LifeBuoy, status: "planned", phase: "Fase 1" }` — sem `permission` declarada (porque ainda não existe nada para autorizar).
- **Ficha Mestre do Cliente** (`src/app/(app)/clientes/[id]/page.tsx`): a aba `suporte` usa `FUTURE_MODULE_COPY.suporte = "Os chamados deste cliente aparecerão aqui quando o módulo Suporte for habilitado."` — texto institucional honesto, sem número inventado.
- **Ficha do Projeto**: não tem aba/seção de Suporte hoje (Checkpoint C2 do Projetos manteve só "Visão geral" e "Timeline" por serem as únicas com conteúdo real).
- **Busca global**: lê de `getVisibleFlatNavigation`, então Suporte aparecerá automaticamente como destino quando `status` virar `available` e a permissão for satisfeita — sem mudança adicional necessária (mesmo mecanismo já usado por Clientes/Projetos).
- Nenhum schema, migration, service, repository ou componente parcial de Suporte foi encontrado em nenhuma parte do código.

## 3. Permissions reais existentes

`src/config/permissions.ts` (catálogo TypeScript, espelha `public.permissions`) já contém:

```
"ticket:read",
"ticket:write",
```

**Confirmado: não existe `support:read`/`support:write`** — a convenção do projeto é por entidade de domínio (`client:*`, `project:*`, `ticket:*`), não por módulo de UI. Não há `ticket:delete` nem `ticket:manage` em nenhuma parte do catálogo, schema ou banco. Não vou criar uma convenção nova: o módulo se chamará "Suporte" na navegação/UI, mas a permissão continua `ticket:*`, exatamente como Projetos manteve `project:*` (não `projetos:*`) e como o próprio Checkpoint A de Projetos já havia identificado (§22 daquele relatório).

## 4. Grants reais por papel (organização `atlaz`)

Verificação somente leitura contra o Supabase configurado (transação `REPEATABLE READ READ ONLY`, sem DDL/DML, script `.tmp-suporte-audit.mjs` criado e apagado nesta sessão, nunca commitado — confirmado ausente do `git status` ao final):

| Papel | Grants explícitos `ticket:*` |
|---|---|
| ceo | Nenhum |
| comercial | Nenhum |
| designer | read |
| dev | read, write |
| financeiro | read |
| social_media | Nenhum |
| socio | read, write |
| super_admin | Nenhum grant explícito; catálogo efetivo resolvido pelo comportamento central existente (mesmo contrato de `getCurrentSession()` já usado por Clientes/Projetos) |

Adicionalmente confirmado nesta mesma verificação: nenhuma tabela `support_tickets`/`tickets`/`ticket_comments`/`ticket_messages` existe no banco; `activity_events`/`audit.log` têm **zero** registros com `entity_type='ticket'` (nenhum órfão a se preocupar antes de ativar produtores). Nenhum grant foi criado, removido ou promovido — mesma disciplina de Clientes/Projetos.

## 5. Autorização proposta

Seguindo exatamente o padrão de `authorizeClientSession`/`authorizeProjectSession`:

```ts
function authorizeTicketSession(session, access: "read" | "write" = "read"): TicketAccess
```

- Nega sem sessão, sem membership, `scope !== "org"` (③ `assigned` continua negado — ver §42, decisão já tomada, não uma novidade).
- Leitura exige `ticket:read` **e** `client:read` (mesmo motivo de Projetos exigir `client:read`: toda ficha/listagem de chamado expõe o cliente pai).
- Escrita soma `ticket:write`.
- Não exige `client:write` nem qualquer permissão de Projetos para operações básicas do chamado.

**Decisão importante pendente de aprovação — acesso ao Projeto vinculado (§7 do pedido):**

Comparação:

| | Opção A — leitura parcial | Opção B — bloquear o chamado inteiro |
|---|---|---|
| Comportamento | Chamado continua 100% acessível com `ticket:read`+`client:read`; se houver projeto vinculado e o usuário **não** tiver `project:read`, o campo mostra só um indicador genérico ("Projeto vinculado — sem permissão para ver detalhes"), sem nome/status/link | Chamado inteiro (título, descrição, comentários, timeline) fica inacessível para quem não tiver `project:read`, só por ele referenciar um projeto |
| Risco de vazamento | Nenhum — nome/status do projeto nunca aparece sem `project:read`, mesmo padrão de "nunca mostrar nome/contagem sem permissão" já usado na aba Projetos da Ficha do Cliente | Nenhum adicional, mas não reduz risco nenhum a mais que a Opção A |
| UX | Um agente de suporte com `ticket:read+client:read` mas sem `project:read` continua atendendo o chamado normalmente (é o caso comum: suporte não precisa enxergar o backlog de Projetos) | Um agente perde acesso a um chamado do próprio cliente que está atendendo só porque alguém vinculou um projeto — comportamento surpreendente e provavelmente incorreto para a operação real |
| Consistência com o padrão do sistema | Alinhado — é exatamente o mesmo espírito de "campo escondido dentro de uma entidade acessível", já usado (ex.: `ownerName` continua visível mesmo sem certas permissões em outros módulos) | Trocaria a granularidade de "por campo" para "por entidade inteira", inconsistente com o resto do sistema |

**Minha recomendação: Opção A.** Justificativa: Suporte e Projetos são domínios conceitualmente distintos (ver §item 4 do pedido); tratar "chamado tem projeto vinculado" como motivo para bloquear o chamado inteiro misturaria a autorização dos dois módulos de um jeito que o próprio pedido pede para evitar (§4: "não transformar Suporte em task manager de Projetos"). A Opção A preserva a regra de nunca vazar nome/detalhe de Projeto sem `project:read`, sem penalizar quem só faz atendimento. **Não adotei isso automaticamente — é uma decisão que aguarda sua aprovação explícita**, junto com a redação exata do indicador genérico (proponho algo como "Projeto vinculado" sem nome, ou simplesmente omitir a linha "Projeto" da ficha quando sem permissão — as duas variantes têm o mesmo nível de segurança; a diferença é só de clareza para o agente).

## 6. Relação com Cliente

Confirmado conforme pedido: `client_id` **obrigatório**, mesma org, e proponho **imutável após a criação na V1** (mesmo contrato de Projetos) — não há motivo forte identificado para permitir mover um chamado entre clientes; se isso for necessário no futuro, deve ser um fluxo explícito e auditado, não uma edição comum. Nenhuma cópia de nome/documento do Cliente na tabela de chamados — nome obtido por join com filtro de organização, mesmo padrão de Projetos.

## 7. Relação com Projeto

`project_id` **opcional**. Quando informado: precisa existir, mesma org, e pertencer **exatamente** ao mesmo cliente do chamado (nunca um projeto de outro cliente da mesma org, nunca de outra org). Ver §8 para a garantia estrutural.

## 8. FK estrutural proposta

`projects` hoje só tem `UNIQUE(org_id, id)` — suficiente para a FK simples `(org_id, client_id) → clients(org_id, id)` que Projetos usa, mas **não** suficiente para uma FK que amarre `client_id` e `project_id` juntos no chamado.

**Proposta:** adicionar (na futura migration de Suporte, **aditiva**, sem alterar nenhuma coluna existente) um novo `UNIQUE(org_id, client_id, id)` em `projects` — não conflita com o unique já existente, não quebra nenhuma constraint/trigger/RLS atual de Projetos, não exige tocar em nenhum dado. Com isso, `support_tickets` ganha:

```sql
FOREIGN KEY (org_id, client_id, project_id)
  REFERENCES projects (org_id, client_id, id)
  ON DELETE RESTRICT
```

Como FKs multi-coluna do Postgres usam `MATCH SIMPLE` por padrão, a constraint **não é avaliada quando `project_id` é NULL** (chamado sem projeto passa livre) — mas quando `project_id` **é** informado, as três colunas precisam bater exatamente, tornando estruturalmente impossível `Cliente A + Projeto do Cliente B` mesmo com bug de aplicação, exatamente o que foi pedido. Esta é a mesma técnica que o Checkpoint A de Projetos já havia previsto conceitualmente para esta situação (§22 daquele relatório: "avaliar FK tripla e unique correspondente em Projetos").

## 9. Schema de `support_tickets` (proposta, não implementada)

| Campo | Tipo, default e regra proposta |
|---|---|
| `id` | UUID PK, gerado no banco |
| `org_id` | UUID NOT NULL, FK `orgs`, RESTRICT; só da sessão |
| `client_id` | UUID NOT NULL, FK composta `(org_id, client_id) → clients`, RESTRICT; imutável |
| `project_id` | UUID opcional, FK tripla conforme §8; imutável após criação (mesma razão do `client_id`) |
| `ticket_number` | `bigint` gerado pelo banco (`GENERATED ALWAYS AS IDENTITY`), único global — ver §12 |
| `title` | Texto NOT NULL, trim, 1–200 caracteres |
| `description` | Texto **opcional**, até 10.000 caracteres — ver §13 |
| `status` | Texto NOT NULL, default `open`, CHECK dos seis estados — ver §14 |
| `priority` | Texto NOT NULL, default `normal`, CHECK dos quatro níveis |
| `assigned_user_id` | UUID opcional, FK composta `(org_id, user_id)` para membership |
| `due_at` | TIMESTAMPTZ opcional — ver §17 |
| `resolved_at` | TIMESTAMPTZ opcional; definido pelo servidor ao resolver |
| `created_by` | UUID NOT NULL, FK composta para membership; só da sessão |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL, default now; `updated_at` por trigger |
| `version` | Inteiro NOT NULL, default 1; UPDATE avança exatamente 1 |

Removidos da lista conceitual original do pedido, com justificativa (ver itens correspondentes abaixo): `opened_at` (§16), `closed_at` (§14 — decisão de simplificar status), `opened_by` como campo separado de `created_by` (§16).

## 10. Necessidade de `ticket_comments`

**Sim, necessário.** Um chamado sem histórico de interação não cumpre o objetivo declarado no pedido de ser "central de atendimento" (§3/§28) — sem comentários, a única forma de registrar acompanhamento seria abusar de `activity_events`/`audit.log` com texto livre, o que o próprio pedido proíbe explicitamente (§20: "NÃO colocar corpo de comentários em `audit.log`"). Comentários são conteúdo operacional de primeira classe, merecem tabela própria.

## 11. Schema de `ticket_comments` (proposta)

| Campo | Tipo, default e regra proposta |
|---|---|
| `id` | UUID PK, gerado no banco |
| `org_id` | UUID NOT NULL, FK `orgs`, RESTRICT |
| `ticket_id` | UUID NOT NULL, FK composta `(org_id, ticket_id) → support_tickets(org_id, id)`, RESTRICT |
| `author_user_id` | UUID NOT NULL, FK composta para membership; só da sessão |
| `content` | Texto NOT NULL, trim, 1–10.000 caracteres |
| `created_at` | TIMESTAMPTZ NOT NULL, default now |

**Sem `updated_at`, sem `version`, sem edição/exclusão na V1** — proposta explícita: comentários são **imutáveis** depois de criados. Justificativa: (1) nenhuma decisão aprovada pede edição/remoção de comentário; (2) um comentário incorreto pode ser corrigido por um novo comentário, preservando o histórico real de atendimento (mais correto para uma central de atendimento do que permitir reescrever o passado); (3) sem edição, não existe conflito de concorrência a resolver, então `version` seria complexidade sem função. Se no futuro houver necessidade real de corrigir/remover um comentário, isso deve ser uma extensão aprovada separadamente (edição teria motivo para usar o mesmo padrão de `version` de Clientes/Projetos; exclusão precisaria decidir entre soft-delete visível como "removido" ou remoção real). **Isto é uma decisão que aguarda aprovação explícita**, não uma imposição.

Sem separação "interno × cliente" (§21 do pedido): não existe portal externo hoje, então todo comentário é implicitamente interno — criar um campo de visibilidade agora seria modelar preventivamente algo sem uso (proibido por §57).

## 12. Identificador humano

Recomendo **`ticket_number bigint GENERATED ALWAYS AS IDENTITY`, sequência global (não por organização)**, exibido como `#000123` (zero-padding só na exibição, não no banco).

Comparação das três opções levantadas no pedido:

- **Sequência por organização** (`#0001` reiniciando por org): UX ligeiramente melhor (números pequenos e "limpos" por cliente do sistema), mas exige uma tabela de contador dedicada por organização com `SELECT ... FOR UPDATE` (ou `INSERT ... ON CONFLICT DO UPDATE RETURNING`) a cada criação de chamado para evitar corrida entre duas inserções simultâneas na mesma org — complexidade real de concorrência para um requisito puramente cosmético.
- **Sequência global** (proposta): implementação trivial e livre de condição de corrida (o próprio Postgres garante atomicidade de uma `IDENTITY`/`SEQUENCE`), zero tabelas novas, zero lógica de aplicação. Efeito colateral cosmético: o primeiro chamado da organização B pode nascer como `#000047` se a organização A já tiver 46 chamados — não é um vazamento de dado sensível (não revela quantidade de chamados de outra org por si só, já que não há como comparar sequências entre orgs sem acesso cross-org, que já é bloqueado por toda a cadeia de autorização), só um detalhe estético.
- **Nenhum identificador na V1**: rejeitado — o próprio pedido já assume corretamente que UUID não deve aparecer na UI (§30, "provavelmente não"), e uma central de atendimento sem número de referência prejudica comunicação real ("chamado 47" é o tipo de frase que times de suporte usam o tempo todo).

**Recomendação técnica e de UX: sequência global.** Aguardando aprovação — se preferir sequência por organização apesar da complexidade adicional, é uma extensão possível sem reabrir o restante do desenho.

## 13. Título

Proposta: obrigatório, trim, **1–200 caracteres** (o teto superior da faixa sugerida no pedido — títulos de chamado tendem a precisar de um pouco mais de espaço que nomes de projeto, que usam 160).

## 14. Descrição

**Recomendação: opcional**, mesmo limite de 10.000 caracteres já usado em Clientes/Projetos. Justificativa: um chamado pode nascer só com título (ex.: "Não consigo acessar o e-mail") e ser detalhado no primeiro comentário/interação — exigir descrição obrigatória adiciona fricção na abertura rápida de um chamado sem ganho técnico correspondente; a "central de atendimento" (§28) já tem a aba de Interações para captar o detalhe real. Mesma filosofia já aprovada para a descrição de Projetos.

## 15. Status — proposta com simplificação de `resolved`/`closed`

**Recomendo simplificar para cinco estados não-terminais + dois terminais**, removendo `closed` como estado separado e adicionando `cancelled` no lugar:

| Chave | Interface | Significado |
|---|---|---|
| `open` | Aberto | Chamado recebido, aguardando triagem |
| `triage` | Triagem | Em análise inicial |
| `in_progress` | Em atendimento | Execução em curso |
| `waiting_client` | Aguardando cliente | Bloqueado por resposta/ação do cliente |
| `resolved` | Resolvido | Encerrado com solução aplicada |
| `cancelled` | Cancelado | Encerrado sem solução (duplicado, não é bug, desistência) |

**Por que remover `closed` (ver §16 abaixo para a análise completa):** sem portal externo do cliente nesta V1 (§21/§57 — nenhum cliente confirma nada pela própria aplicação), a distinção original "resolved = tecnicamente resolvido, aguardando fechamento" vs. "closed = definitivamente encerrado" perde a maior parte do seu valor prático: quem decidiria mover de `resolved` para `closed` seria sempre o mesmo agente interno, sem nenhum evento externo (confirmação do cliente) para justificar dois passos manuais em vez de um. Isso tende a virar apenas um clique extra sem sinal real por trás.

`cancelled`, por outro lado, cobre um caso genuinamente diferente que os seis estados originais não cobriam: um chamado que nunca deveria ter sido aberto (duplicado) ou que não será resolvido por decisão (não é bug, cliente desistiu) — sem esse estado, a única opção seria forçar `resolved` para algo que não foi resolvido, poluindo métricas de resolução. Isso espelha exatamente o par `completed`/`cancelled` que Projetos já usa e que você já aprovou como modelo claro.

**Terminais:** `resolved`, `cancelled`. Não-terminais: os outros quatro, com transição livre entre eles (mesma regra de Projetos — mudança explícita entre não-terminais, ação explícita para entrar/sair de um terminal).

## 16. `resolved` × `closed` — análise dedicada

Ver §15 para a decisão. Resumindo o trade-off pedido: manter os dois adicionaria uma transição manual extra (`resolved → closed`) sem nenhum gatilho automático possível na V1 (não há como o cliente "confirmar" nada), then na prática quase sempre seria um clique reflexo do mesmo agente, no mesmo momento — complexidade sem benefício mensurável agora. **Recomendo a simplificação proposta em §15**; se no futuro houver portal do cliente (Fase de integrações), a distinção `resolved`/`closed` volta a fazer sentido genuíno (cliente confirma → fecha) e pode ser reintroduzida como extensão aditiva (novo status, sem quebrar os existentes).

## 17. Prioridade

Adoto a proposta original sem alteração: `low`/`normal`/`high`/`critical` → Baixa/Normal/Alta/Crítica. CHECK e rótulos próprios de Suporte (`TICKET_PRIORITY_LABELS`), nunca reaproveitando o enum de Projetos (`ProjectPriority`) — são vocabulários semanticamente distintos mesmo com nomes parecidos, exatamente como o pedido exige (§15). Nenhuma automação de SLA por causa de "Crítica" — é só rótulo visual (mesmo variant `danger` do Badge, sem decoração extra).

## 18. Responsável

`assigned_user_id` opcional, validado por usuário+membership ativos da mesma org (reaproveitar `findAvailableOwner`/`listAvailableOwners` do repository de Clientes ou o equivalente de Projetos — a função já é genérica o bastante, sem regra específica de Clientes/Projetos embutida). Mesmo contrato de preservação histórica: responsável desativado depois permanece como referência, sem revalidação em edições que não tocam o campo.

## 19. Aberto por — `created_by` é suficiente

**Recomendação: não criar `opened_by` separado.** Justificativa direta do próprio pedido (§17): todo chamado da V1 é criado por um usuário interno autenticado (não existe portal externo — §57 proíbe modelar isso preventivamente). Nessas condições, `created_by` (o ator técnico da sessão, mesmo padrão de `createdBy` em Clientes/Projetos) já responde completamente "quem abriu o chamado". Se um dia existir abertura por cliente externo (fora do escopo atual), a diferenciação `created_by` (ator técnico/sistema) vs. `opened_by` (autor real, possivelmente externo) passa a fazer sentido — e pode ser adicionada então, sem quebrar o que existir.

## 20. Datas

| Campo | Tipo | Automática/editável | Invariante |
|---|---|---|---|
| `created_at` | TIMESTAMPTZ | Automática (default now) | Imutável |
| `updated_at` | TIMESTAMPTZ | Automática (trigger) | — |
| `due_at` | TIMESTAMPTZ | Editável (formulário) | Opcional; ver §21 |
| `resolved_at` | TIMESTAMPTZ | Automática (servidor, ao entrar em `resolved`) | NULL sempre que `status ≠ resolved`; preenchido se e somente se `resolved` |

**Removidos:** `opened_at` (redundante com `created_at`, ver §19), `closed_at` (não existe mais `closed`, ver §15). Sem `cancelled_at` dedicado — mesmo padrão de Projetos, que não tem `cancelledAt` próprio (o momento fica registrado em `updated_at` + evento de timeline, não em coluna extra). `due_at` é TIMESTAMPTZ (não DATE): diferente do prazo de entrega de um Projeto (que é uma data de calendário), um prazo de atendimento de chamado costuma ter granularidade de hora ("responder até as 14h"), então TIMESTAMPTZ é mais correto aqui — decisão pontual, não uma inconsistência com Projetos.

## 21. SLA / `due_at`

Confirmando exatamente o que o pedido já orienta: `due_at` sozinho é suficiente para um controle inicial de prazo ("atrasado" = `due_at < now()` e status não-terminal, mesma fórmula de Projetos adaptada). **Nada além disso na V1** — sem política de SLA por prioridade, sem calendário útil, sem pausa de contagem, sem contrato de SLA por cliente. Se isso vier a ser necessário, é uma decisão de escopo separada e maior, não uma extensão incremental trivial.

## 22. Version

**Sim, `support_tickets` recebe `version`**, mesmo padrão de Clientes/Projetos: `UPDATE` condicionado a `org_id + id + version`, incremento atômico, conflito devolve erro tratável sem sobrescrita silenciosa. Justificativa: um chamado pode ser editado por dois agentes simultaneamente (ex.: um muda prioridade enquanto outro reatribui) exatamente como um Projeto ou Cliente — o mesmo risco de corrida existe, a mesma solução se aplica.

**`ticket_comments` não recebe `version`** — ver §11 (comentários imutáveis na V1 tornam concorrência de edição um não-problema).

## 23. Concorrência

Mesmo modelo exato de Clientes/Projetos: `WHERE org_id = ? AND id = ? AND version = ?`, zero linhas afetadas → `ServiceError("conflict", ...)` com a mesma mensagem padrão já usada ("Este chamado foi atualizado por outro usuário. Atualize a página antes de salvar novamente."), sem sobrescrita silenciosa, sem exceção especial.

## 24. Exclusão

**Sem DELETE de chamado**, sem soft-delete, sem campo de arquivamento. `resolved`/`cancelled` (ver §15) preservam o histórico completo e continuam consultáveis/reabríveis — mesmo contrato de Projetos (`completed`/`cancelled` também não têm DELETE nem soft-delete).

## 25. Reabertura

**Decisão explícita, conforme pedido:** chamado `resolved` **ou** `cancelled` pode ser reaberto; volta para **`in_progress`** (não para `open`/`triage`, porque reabrir normalmente significa "o problema voltou" ou "precisamos continuar", não "começar do zero" — mesmo raciocínio já usado em Projetos, que reabre direto para `active`). Reabertura é operação explícita (`reopenTicketAction`, não edição comum), auditada e com evento de timeline próprio (`ticket.status_changed`), mesma arquitetura de Projetos.

## 26. `activity_events`

Kinds propostos, mínimos e sem duplicação (ver §27 para comentários):

```
ticket.created
ticket.updated          (nome/descrição/due_at agrupados, como "updated" de Projetos)
ticket.status_changed   (cobre resolvido/cancelado/reaberto — sem kinds redundantes)
ticket.priority_changed
ticket.assignee_changed
```

**Sem `ticket.resolved`/`ticket.closed` como kinds próprios** — exatamente como Projetos não tem `project.completed` separado de `project.status_changed`. A mudança para `resolved` ou `cancelled` já é uma mudança de status; um kind extra duplicaria semântica sem necessidade, indo contra a orientação explícita do pedido (§22: "evite duplicação").

## 27. Comentários na timeline

Sim: novo comentário gera `ticket.comment_added` na timeline, com `summary` genérico **sem o conteúdo do comentário** (ex.: "Novo comentário adicionado" ou, se houver autor disponível na tradução, algo como "Comentário de {ator}" — o texto exato fica para a etapa de implementação). O conteúdo completo mora exclusivamente em `ticket_comments.content`; a timeline nunca duplica corpo de texto grande, conforme pedido explicitamente (§23).

## 28. Auditoria (`audit.log`)

Sem tabela nova — reaproveita `audit.log` existente. Ações propostas: `ticket.create`, `ticket.update`, `ticket.comment.create`. `before`/`after` como objetos de negócio serializados manualmente (mesmo padrão de Clientes/Projetos — nunca linha crua, nunca sessão/token).

**Sobre o conteúdo do comentário na auditoria:** existe precedente direto no próprio sistema — o campo `notes` de Cliente (até 10.000 caracteres) já é auditado por completo em `client.update` (`before`/`after` incluem `notes` inteiro). Seguindo essa mesma régua, **recomendo auditar o conteúdo completo de `ticket.comment.create`** (não é um padrão novo, é o padrão já aprovado de Clientes aplicado a mais um campo de texto livre) — mais simples e consistente do que inventar uma exceção "comentário não conta como os outros campos". Se preferir uma política mais restritiva especificamente para comentários (por exemplo, registrar só que um comentário foi criado, sem o texto), é uma variação possível — **aguardando sua preferência**, já que o pedido (§24) deixou a porta aberta para ambas.

## 29. RLS

Depois que houver produtor de eventos de chamado, a policy `activity_select` (já reescrita duas vezes: Clientes → Projetos) precisa de um **terceiro ramo**, seguindo exatamente o padrão estabelecido — substituição única, nunca uma policy adicional combinada por `OR`:

```sql
DROP POLICY activity_select ON public.activity_events;
CREATE POLICY activity_select ON public.activity_events FOR SELECT TO authenticated USING (
  org_id = atlaz.current_org_id() AND atlaz.is_member() AND (
    (entity_type = 'client'  AND EXISTS (SELECT 1 FROM public.clients  c WHERE c.org_id = activity_events.org_id AND c.id = activity_events.entity_id))
    OR (entity_type = 'project' AND EXISTS (SELECT 1 FROM public.projects p WHERE p.org_id = activity_events.org_id AND p.id = activity_events.entity_id))
    OR (entity_type = 'ticket'  AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.org_id = activity_events.org_id AND t.id = activity_events.entity_id))
    OR entity_type NOT IN ('client', 'project', 'ticket')
  )
);
```

O `EXISTS` contra `support_tickets` reaplica a própria RLS de `support_tickets` (que por sua vez exige `ticket:read`+`client:read`+cliente pai visível) — mesma técnica recursiva já usada para `client_contacts → clients` e para o ramo `project` desta mesma policy. `support_tickets` e `ticket_comments` recebem RLS SELECT própria, no mesmo desenho de `projects`/`client_contacts`:

- `support_tickets_select`: org da sessão + `ticket:read` + `client:read` + membership ativa/scope `org` + Cliente pai visível pela própria RLS de `clients` (**note:** a RLS do chamado **não** exige `project:read` — essa permissão só gate.ia a exibição dos detalhes do Projeto vinculado na aplicação, conforme a Opção A recomendada em §5; misturar isso na RLS do chamado reabriria a discussão da Opção B).
- `ticket_comments_select`: org da sessão + `EXISTS (SELECT 1 FROM support_tickets t WHERE t.org_id = ticket_comments.org_id AND t.id = ticket_comments.ticket_id)` — sem permissão extra além de enxergar o chamado pai (mesmo raciocínio de `client_contacts` herdando de `clients`).

`REVOKE ALL` de PUBLIC/anon/authenticated/service_role nas duas tabelas novas; `SELECT` para `authenticated`; `SELECT/INSERT/UPDATE` para `service_role` em `support_tickets` (sem DELETE); `SELECT/INSERT` para `service_role` em `ticket_comments` (sem UPDATE/DELETE, consistente com §11 — comentários imutáveis).

## 30. BYPASSRLS

Sem novidade de princípio: a conexão Drizzle do servidor continua com `BYPASSRLS`. Toda operação de Suporte precisa de `authorizeTicketSession()` **antes** de qualquer query, e todo repository precisa de `orgId` explícito em toda consulta/join/contagem — RLS é defesa em profundidade, nunca a barreira principal, exatamente como documentado em `docs/seguranca.md` §1 e revalidado nos Checkpoints D/D.1 de Projetos.

## 31. Org isolation

Nenhuma query de `support_tickets`/`ticket_comments` por UUID isolado — sempre `(orgId, id)`, joins sempre com `clients.orgId = orgId`/`projects.orgId = orgId` explícitos, mesmo padrão auditado linha a linha em Projetos (Checkpoint D §13).

## 32. Listagem

Colunas propostas: Chamado (número + título), Cliente, Projeto (quando houver, respeitando §5), Status, Prioridade, Responsável, Atualizado em — tabela no desktop, cards no mobile (mesmo breakpoint `lg` já usado). "Ações" (Ver/Editar) como nas listagens existentes. Prazo (`due_at`) pode entrar como indicador de atraso na própria célula de "Atualizado em" ou como coluna própria — detalhe de implementação para o Checkpoint de UI, não uma decisão de schema.

## 33. Busca

Server-side, por título, `ticket_number` (quando o usuário digitar algo puramente numérico, aceitar como busca por número) e nome do Cliente/Projeto — mesma técnica de `ILIKE` parametrizado com escape literal de `%`/`_` já usada em Projetos. **Sem** busca no corpo dos comentários na V1 (explicitamente fora de escopo pelo pedido, §31).

## 34. Filtros

Cliente (via busca, sem dropdown pesado — mesma decisão já registrada em Projetos), Projeto (só quando um Cliente estiver selecionado/filtrado), Status, Prioridade, Responsável (+ "Sem responsável"), Vencidos. Mesmos predicados em listagem e contagem, parâmetros na URL, reset de página ao mudar filtro — mesmo contrato de Projetos. **Nota de aprendizado do Checkpoint D de Projetos:** lá, dois filtros (`prioridade`, `vencidos`) foram implementados no backend mas esquecidos na UI até o QA final — para Suporte, pretendo desenhar o componente de filtros já com todos os campos aprovados desde a primeira entrega de UI, evitando repetir essa lacuna.

## 35. Paginação

25 por página, server-side, URL sincronizada, mesmo componente `Pagination` já existente (reaproveitado pela terceira vez, sem criar um componente equivalente).

## 36. KPIs locais

Abertos (`status='open'`), Em atendimento (`status='in_progress'`), Críticos (`priority='critical'` e status não-terminal), Vencidos (`due_at < now()` e status não-terminal) — quatro agregações reais via `count(*) filter (where ...)` numa única query, mesmo padrão de `getProjectCounts`. Nenhuma métrica inventada; se algum desses cortes não fizer sentido depois de discussão, é só remover o card correspondente.

## 37. Ficha do chamado

Rotas: `/suporte`, `/suporte/novo`, `/suporte/[id]`, `/suporte/[id]/editar`, com `loading`/`error`/`not-found` dedicados (mesmo padrão). Abas propostas (4, não 15 — conforme pedido §28):

1. **Visão Geral** — status, prioridade, responsável, prazo, descrição.
2. **Cliente** — dados básicos + link para a Ficha do Cliente (sempre visível, já que `client:read` é pré-requisito de acesso ao chamado).
3. **Projeto** — só renderizada se `project_id` existir; conteúdo condicionado a `project:read` (Opção A, §5).
4. **Interações** — comentários, em ordem cronológica **ascendente** (mais antigo primeiro, como uma conversa) — decisão deliberadamente diferente da Timeline (que é descendente, mais recente primeiro), porque interações são uma conversa a ser lida na ordem em que aconteceu, não um log de auditoria a ser varrido de trás para frente. Formulário de novo comentário (textarea simples, sem rich text — §12 do pedido) ao final.
5. **Timeline** — eventos técnicos traduzidos, mesmo componente/padrão de Clientes/Projetos.

(Cinco abas, não quatro — ajustei a contagem do pedido porque separar "Interações" de "Timeline" é necessário: uma é conversa, a outra é auditoria técnica; misturá-las voltaria a arriscar mostrar `kind`/payload técnico junto de texto humano.)

## 38. Integração com Cliente

Aba "Suporte" na Ficha Mestre do Cliente deixa de ser `EmptyState` e passa a chamar `listTickets({ clientId, page })` — só quando `authorizeTicketSession(session, "read").ok` for verdadeiro, mesmo padrão exato da aba Projetos (nunca consulta o service sem autorização prévia; sem `ticket:read`, Alert genérico, sem número/nome).

## 39. Integração com Projeto

O pedido (§36) pergunta se a Ficha do Projeto deve mostrar chamados relacionados e se isso entra na V1. **Recomendo deixar para depois da V1 de Suporte**, na mesma "integração final" já prevista no roadmap (depois dos quatro módulos da Fase 1) — motivo: é uma consolidação de leitura genuína, mas não é necessária para Suporte funcionar como central de atendimento (o chamado já mostra o Projeto vinculado na própria ficha, §37 aba 3); adicionar uma seção "Chamados" na Ficha do Projeto agora ampliaria o escopo de Suporte para dentro de Projetos sem necessidade comprovada, contrariando "não aumentar escopo sem necessidade" (§36 do pedido). **Aguardando sua confirmação** — se preferir incluir já na V1, é uma extensão pequena (mesmo padrão de `ClientProjectsTab`, adaptado).

## 40. Timeline consolidada do Cliente

**Esta, sim, entra no escopo de Suporte V1** (diferente do item anterior) — o próprio pedido (§37) trata isso como parte natural de "depois de Suporte", não como integração final adiada, e o Checkpoint D.1 de Projetos já deixou o padrão pronto para reuso: `client-timeline-repository.ts` ganha um **terceiro ramo** no `UNION ALL` (`entity_type='ticket'`, `INNER JOIN support_tickets` exigindo `org_id`+`client_id` corretos, nunca `payload.clientId`), e `client-service.ts` calcula `canReadTickets` do mesmo jeito que já calcula `canReadProjects` hoje (`can(permissions, "ticket:read")`, sem nova consulta). Sem duplicar evento como `entity_type='client'`. Risco técnico baixo — é a terceira vez que esse padrão exato é implementado.

## 41. Timeline do Projeto

O pedido (§38) pergunta se eventos de chamado devem entrar na timeline do **Projeto** (não do Cliente) quando o chamado referencia aquele projeto. **Mesma recomendação do §39: deixar para a integração final**, pela mesma razão (consolidação de leitura genuína, mas não essencial ao lançamento de Suporte, e dessa vez envolveria estender a timeline de Projetos — hoje só `entity_type='project'` — replicando o trabalho do §40 uma segunda vez no mesmo checkpoint). Fazer as duas consolidações (Cliente e Projeto) no mesmo checkpoint de Suporte dobra a superfície de RLS/policy a revisar de uma vez só; prefiro entregar a consolidação do Cliente (que o pedido já trata como parte de Suporte) e revisar a do Projeto depois, com o mesmo rigor de teste que o Checkpoint D.1 aplicou. **Aguardando sua decisão** — se preferir as duas consolidações juntas agora, é tecnicamente viável, só maior.

## 42. `assigned` scope

Confirmado: `scope='assigned'` continua **negado** em `authorizeTicketSession`, sem exceção para super admin, exatamente como Clientes e Projetos. `assigned_user_id` é só um campo de dados (quem está cuidando do chamado) — **não** implementa nem sugere semântica de `scope='assigned'`. Se no futuro fizer sentido um agente só enxergar os chamados atribuídos a ele, isso é uma decisão de autorização separada e maior (mudaria `authorizeTicketSession` para aceitar `scope='assigned'` com uma regra de filtro adicional em todo repository) — não decido isso aqui.

## 43. Escopo recomendado da V1

**Dentro:** schema `support_tickets`+`ticket_comments` (migration própria, número real a confirmar — ver §44), RLS/grants seguindo o padrão de Clientes/Projetos, authorization, validation/normalization, repository/service, version/concorrência, timeline própria do chamado + `activity_events`/`audit.log`, comentários (criação apenas, imutáveis), listagem com busca/filtros/paginação/KPIs, ficha completa (5 abas), cadastro/edição, ações de status explícitas (iniciar atendimento, aguardar cliente, resolver, cancelar, reabrir), integração permissionada na Ficha Mestre do Cliente (aba + timeline consolidada), navegação ativada com `ticket:read`+`client:read`, identificador humano (`ticket_number`, sequência global), responsividade/acessibilidade seguindo o Design System existente.

**Fora da V1** (nenhum sem necessidade comprovada, conforme §57 do pedido): anexos/upload, e-mail inbound, WhatsApp, chatbot/IA, SLA avançado (calendário útil, pausa, contratos), portal externo do cliente, automação, notificações push, WebSocket, templates de resposta, base de conhecimento, `project_members`/tasks/milestones (nem eram de Suporte), edição/exclusão de comentário (ver §11), aba de chamados na Ficha do Projeto (ver §39), timeline consolidada do Projeto (ver §41), categoria de chamado (texto do placeholder antigo, sem requisito aprovado), regras de cobrança de suporte (idem).

## 44. Migration(s) futuras

Confirmado via `_journal.json`: a última entrada é `idx: 4, tag: "0004_projects"`. **A próxima migration real será `0005`** (não presumido — conferido). Proposta (não criada neste checkpoint): `0005_support.sql`, contendo, na mesma entrega transacional: `UNIQUE(org_id, client_id, id)` aditivo em `projects`; tabelas `support_tickets`/`ticket_comments` com constraints/índices/triggers de versão e `updated_at`; RLS+grants das duas tabelas; substituição controlada de `activity_select` com o terceiro ramo (§29). Igual ao processo de Projetos: preparar e testar em Checkpoint B, aplicar ao Supabase real só depois de aprovação explícita e preflight imediatamente anterior.

## 45. Arquivos previstos (Checkpoint B em diante, não agora)

- `src/server/db/schema/support-tickets.ts`, `ticket-comments.ts`; migration `0005_support.sql` + snapshot novo.
- `src/lib/auth/ticket-access.ts`.
- `src/lib/validation/ticket.ts`, `ticket-normalize.ts`; `src/lib/support/activity.ts` (vocabulário de `kind`).
- `src/server/repositories/ticket-repository.ts`, `ticket-comment-repository.ts`, `ticket-timeline-repository.ts`.
- `src/server/services/ticket-service.ts`, `ticket-events.ts`.
- `tests/helpers/tickets.ts`; `tests/unit/ticket-validation.test.ts`; `tests/integration/ticket-foundation.test.ts`, `ticket-service.test.ts`, `ticket-concurrency.test.ts`, `ticket-migration.test.ts`, `client-ticket-timeline.test.ts` (mesmo padrão do `client-project-timeline.test.ts` do Checkpoint D.1).
- UI: `src/app/(app)/suporte/**`, `src/components/support/**` (badges, filtros, formulário, seletor de cliente/projeto, comentários, ações de status, timeline).
- Alterações pontuais: `client-timeline-repository.ts`/`client-service.ts` (terceiro ramo do UNION, §40), `clientes/[id]/page.tsx` (aba Suporte real), `navigation.ts` (ativação com duas permissões, mesmo mecanismo já genérico desde Projetos), `projects.ts` (só o novo `UNIQUE`, aditivo).

## 46. Riscos

1. **RLS de `activity_events`:** terceiro ramo precisa ser adicionado com a mesma disciplina das duas vezes anteriores — substituição única, nunca `OR` permissivo acumulado. Testar os três ramos juntos (client/project/ticket) para garantir que nenhum ficou frouxo ao ganhar um vizinho nas migrations B/C1 (mesma matriz de 28 asserções que Projetos rodou contra o banco real, adaptada).
2. **FK tripla nova (§8):** é a primeira vez que uma constraint referencia três colunas através de `UNIQUE` aditivo numa tabela já existente (`projects`) — precisa de teste explícito confirmando que a constraint nova não interage mal com nenhuma constraint/trigger de Projetos já aprovada (não deveria, é puramente aditiva, mas merece verificação direta antes de aplicar).
3. **Duas decisões (§39, §41) empurradas para depois** podem gerar expectativa de "Suporte incompleto" se não estiver claro para todos que isso é proposital — documentar explicitamente na navegação/roadmap quando Suporte for publicado.
4. **`ticket_number` sequência global (§12):** se um dia vier a ser necessário migrar para numeração por organização, isso exige uma migration de dados (renumerar) — decisão vale a pena confirmar antes de implementar, já que reverter depois é mais caro que decidir bem agora.
5. **Nenhuma falha de segurança nova foi demonstrada** nesta auditoria — os riscos acima são de desenho/processo, não vulnerabilidades encontradas.

## 47. Decisões que precisam da sua aprovação

Resumo das oito decisões explicitamente flagged ao longo deste relatório, para facilitar sua resposta:

1. **§5 — Acesso ao Projeto vinculado dentro de um chamado:** Opção A (recomendada) ou B.
2. **§11 — Comentários imutáveis na V1** (sem editar/excluir): aprovar ou pedir edição/remoção já na V1.
3. **§12 — `ticket_number` como sequência global** (recomendada) ou por organização (mais complexa).
4. **§15/§16 — Simplificar para `resolved`+`cancelled`** (recomendada, removendo `closed`) ou manter os seis estados originais com `closed` separado.
5. **§28 — Auditar o conteúdo completo do comentário** em `audit.log` (recomendada, mesmo padrão de `notes` de Cliente) ou registrar só a criação sem o texto.
6. **§39 — Aba de chamados na Ficha do Projeto:** deixar para integração final (recomendada) ou incluir já na V1 de Suporte.
7. **§41 — Timeline consolidada do Projeto** (chamados aparecendo na timeline do Projeto, não só do Cliente): deixar para depois (recomendada) ou fazer junto com a consolidação do Cliente.
8. Confirmação geral de que o **escopo da V1 (§43)** está correto antes de eu avançar para o Checkpoint B (fundação).

## 48. Plano de testes (para os checkpoints seguintes, não agora)

- **Unit:** validação/normalização de título/descrição/`due_at`; status; prioridade; UUID; versão; normalização de busca (escape de `%`/`_`).
- **Foundation:** schema, constraints/FKs (incluindo a FK tripla do §8), imutabilidade (`client_id`/`project_id`/`created_by`), org isolation, grants, RLS (os três ramos de `activity_select` juntos).
- **Service:** create/edit/status/reabertura; permissões (`ticket:read`/`write` × `client:read`, `assigned` negado); version/conflito; transações (mutação+evento+auditoria atômicos, rollback em falha).
- **Comments:** criação; permissão (`ticket:write` permite comentar — §49 do pedido, sem `comment:write` novo); org/ticket isolation; ordenação ascendente.
- **Integration:** relação Cliente/Projeto (cross-org, cliente errado, projeto de outro cliente — a FK tripla deve rejeitar antes mesmo de chegar no service); timeline consolidada do Cliente (client:read sem ticket:read, ambos, paginação/ordenação únicas, sem órfãos, sem cross-org — mesma bateria de 10 casos do Checkpoint D.1, adaptada).
- **Security:** cross-org; sem membership; `assigned`; caminho BYPASSRLS vs. `authenticated` real contra o Supabase configurado (mesma técnica das 28 asserções de Projetos C1).

## Checkpoint A encerrado

Aguardando sua aprovação — em especial das oito decisões do §47 — antes de programar a fundação (Checkpoint B). Nenhum código, schema, migration ou UI foi criado nesta sessão.
