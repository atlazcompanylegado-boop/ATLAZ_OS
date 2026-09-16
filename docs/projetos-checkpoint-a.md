# Projetos — Checkpoint A: auditoria e proposta

Data: 15/09/2026. **Aguardando aprovação. Nenhuma implementação de Projetos.**

## Base auditada e limites

- Branch `main`, HEAD `5d68be6` (`feat: implementa Clientes e Ficha Mestre`).
- `git status`: árvore limpa no início; branch alinhada à referência local `origin/main` (sem fetch remoto).
- `git log --oneline -15`: há 8 commits disponíveis; o mais recente conclui Clientes.
- `git diff --stat`: vazio no início. Avisos de normalização CRLF/LF em `src/proxy.ts` e `tsconfig.json`, sem alteração de conteúdo.
- Lidos README, roadmap, checkpoints 1–3 de Clientes, reconciliação, banco, segurança, arquitetura e Design System; conferidos schema, SQL 0000–0003, journal, auth, permissions, navigation, services/repositories, actions e infraestrutura de testes.
- Não localizado `AGENTS.md` na busca do workspace.
- Esta é uma auditoria do repositório local. Não houve conexão com produção, consulta ao catálogo remoto, execução de migrations ou QA autenticado. Os grants reais por papel e o estado atual do banco precisam de preflight somente leitura antes da futura aplicação.
- Os 152 testes verdes são o resultado histórico do Checkpoint 3; não foram reexecutados nesta auditoria documental. Nenhum resultado histórico é apresentado como validação nova.

## 1. Estado atual de Projetos

Existe apenas a página `src/app/(app)/projetos/page.tsx`, renderizando `ModulePlaceholder`. Não existem schema `projects`, service, repository, actions, validação, cadastro, detalhe ou testes funcionais de Projetos.

Referências a `entity_type='project'` em testes de fundação/reconciliação são fixtures de preservação de eventos legados, não um módulo parcial. O schema exportado em `src/server/db/schema/index.ts` termina em Clientes/Contatos; o journal termina em 0003.

## 2. Placeholders existentes

- `/projetos`: texto promete tipo, status, stack, ambientes, repositório e futura integração GitHub/Deploy. Isso é intenção antiga, não funcionalidade implementada nem requisito já validado para V1.
- `src/config/navigation.ts`: Projetos está `planned`, Fase 1, sem `permission` declarada.
- `src/app/(app)/clientes/[id]/page.tsx`: aba Projetos renderiza `EmptyState` pelo mapa `FUTURE_MODULE_COPY`.
- Dashboard não possui KPI de Projetos. Busca global pesquisa destinos da navegação, não registros de negócio.
- Domínios/Infraestrutura são abas futuras em Clientes; não há entradas próprias dessas entidades na navegação atual, apesar de redação histórica mais ampla no Checkpoint 3.

## 3. Permissões e autorização propostas

O catálogo TypeScript já contém `project:read`, `project:write`, `project:delete` e `project:deploy`. Não propor novas chaves nem novos grants para Projetos. A documentação diz que o catálogo espelha o banco; a concessão atual de cada papel não foi consultada remotamente.

Proposta para aprovação:

| Operação | Requisito no service |
|---|---|
| Listar, ficha, timeline, KPI e opções de cliente | Sessão válida, membership ativa/coerente, scope `org`, `project:read` e `client:read` |
| Criar/editar, concluir/cancelar/reabrir | Tudo da leitura + `project:write` |
| Auditoria detalhada | Mantém `audit:read`; sem nova UI de auditoria nesta V1 |
| Excluir/deploy | Nenhuma operação disponibilizada; chaves existentes preservadas |

Exigir `client:read` é uma decisão proposta porque toda ficha/listagem expõe o cliente pai. Não exige `client:write` para gerir Projetos e não concede acesso por atribuir um responsável. Se o negócio precisar de acesso a Projetos sem leitura de Clientes, será necessário aprovar uma projeção limitada do cliente antes de implementar.

Criar `authorizeProjectSession` seguindo o helper de Clientes, usando `can()` e sessão server-side; manter o tratamento de super admin centralizado em `getCurrentSession()`. `assigned` é negado, inclusive para super admin. Não implementar semântica de atribuição.

## 4. Relação com Clientes

Um Cliente tem muitos Projetos; cada Projeto tem exatamente um Cliente da mesma org. `client_id` obrigatório e FK composta `(org_id, client_id) → clients(org_id, id)`, com `ON DELETE RESTRICT`. A chave única necessária já existe em Clientes.

Proposta V1: cliente pai imutável após criação. Evita mover histórico e futuros chamados entre clientes sem fluxo próprio. Permitir selecionar qualquer cliente existente e acessível, inclusive encerrado, mostrando seu status; não inferir uma proibição comercial ausente do pedido. Encerrar Cliente não encerra Projetos automaticamente.

Nenhuma cópia de nome, documento ou contatos do cliente em `projects`; obter nome por join com filtro de organização. Alterar Projeto não avança `clients.version`: são entidades editáveis distintas.

## 5. Schema proposto — `public.projects`

| Campo | Tipo, default e regra proposta |
|---|---|
| `id` | UUID PK, gerado no banco |
| `org_id` | UUID NOT NULL, FK `orgs`, RESTRICT; somente sessão |
| `client_id` | UUID NOT NULL, FK composta para Cliente; imutável |
| `name` | Texto NOT NULL, trim, 1–160 caracteres; nomes repetidos permitidos |
| `description` | Texto opcional, até 10.000 caracteres, vazio normalizado para NULL |
| `status` | Texto NOT NULL, default `planning`, CHECK dos seis estados |
| `priority` | Texto NOT NULL, default `normal`, CHECK dos quatro níveis |
| `owner_user_id` | UUID opcional, FK composta `(org_id, owner_user_id)` para membership |
| `start_date` | DATE opcional; data de calendário, sem conversão de fuso |
| `due_date` | DATE opcional; >= início quando ambas informadas |
| `completed_at` | TIMESTAMPTZ opcional; definido pelo servidor ao concluir |
| `progress` | Inteiro opcional, CHECK 0–100; NULL = não informado; estimativa manual |
| `created_by` | UUID NOT NULL, FK composta para membership; somente sessão |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL, default now; atualização por trigger |
| `version` | Inteiro NOT NULL, default 1; >= 1; cada UPDATE avança exatamente 1 |

Constraints adicionais: `UNIQUE(org_id, id)`; identidade/org/cliente/criador/data de criação imutáveis; `completed_at` preenchido se e somente se `status='completed'`; concluído exige progresso 100. Estado diferente de concluído pode ter 100% (ex.: revisão aguardando aceite). O servidor define timestamp e 100% na conclusão; reabertura limpa `completed_at` e exige nova estimativa ou NULL. Histórico de conclusões anteriores fica nos eventos/auditoria.

Índices iniciais propostos: `(org_id, client_id, created_at DESC, id)`, `(org_id, created_at DESC, id)`, `(org_id, updated_at DESC, id)`, `(org_id, name, id)`, `(org_id, status)`, `(org_id, owner_user_id)` parcial e `(org_id, due_date, id)` parcial para datas informadas. Validar planos antes de adicionar índices de prioridade ou combinações extras.

## 6. Status propostos

| Chave | Interface | Significado |
|---|---|---|
| `planning` | Planejamento | Escopo e organização inicial |
| `active` | Em andamento | Execução em curso |
| `paused` | Pausado | Execução suspensa |
| `review` | Em revisão | Validação/aceite pendente |
| `completed` | Concluído | Entrega encerrada |
| `cancelled` | Cancelado | Encerrado sem concluir |

Não há workflow real no código para validar esses estados. São uma proposta gerencial baseada no pedido. Entre estados não finais, permitir mudança explícita; concluir/cancelar exige confirmação. Reabrir um estado final retorna a `active`, como operação explícita auditada. Não gerar mudança automática por data/progresso nem exigir passagem por todas as etapas.

## 7. Prioridade

`low` → Baixa; `normal` → Normal; `high` → Alta; `urgent` → Urgente. Vocabulário próprio de Projetos, sem assumir SLA de Suporte. Usar texto e variantes semânticas do Badge; vermelho pontual, sem decorar todos os cards.

## 8. Responsável

Um responsável principal opcional. Reutilizar as consultas `findActiveOwner`/`listAvailableOwners` do repository de Clientes quando adequadas, sem chamar o service de Clientes para exigir permissões de escrita desnecessárias. Toda chamada recebe org derivada da sessão.

Validar usuário e membership ativos na atribuição/troca; repetir integridade em trigger com bloqueio, como em 0002. Se desativado depois, preservar a referência histórica e permitir editar outros campos sem obrigar nova atribuição. Atenção: o service atual de Clientes revalida o owner em toda edição; não copiar esse detalhe para Projetos, pois diverge da preservação histórica descrita na fundação. Clientes não será alterado neste checkpoint.

## 9. Equipe do projeto

Não criar `project_members` na V1: não há evidência de necessidade de múltiplos participantes ou funções no repositório. A seção Equipe mostra o responsável principal real e sua condição, sem lista fictícia.

Se aprovada futuramente, a tabela precisará também de `org_id`, FKs compostas de projeto e membership, unicidade por projeto/usuário e regras de inativação. Uma tabela de equipe, por si só, não define `scope='assigned'`.

## 10. Milestones/tasks

Não criar `project_tasks` nem `project_milestones` na V1. Progresso será estimativa manual opcional, claramente rotulada. A seção Etapas apresenta estado gerencial e datas reais, sem sugerir que existe checklist ou fluxo sequencial obrigatório. Se o usuário precisar de entregáveis com aceite, milestones devem ser uma extensão aprovada antes de modelar tabela.

## 11. Timeline

Reutilizar `activity_events`, com **um evento canônico** `entity_type='project'`, `entity_id=project.id`; guardar `clientId` no payload gerado pelo servidor apenas como contexto, nunca como autoridade de autorização.

Kinds: `project.created`, `project.updated`, `project.status_changed`, `project.priority_changed`, `project.owner_changed`, `project.progress_changed`. Conclusão, cancelamento e reabertura são mudanças de status; não duplicar evento de status com outro evento equivalente. Datas/descrição/nome integram `updated` com diff real. UI em português, sem JSON ou nomes técnicos.

Timeline do projeto: org + projeto existente/acessível, ordenação `occurred_at DESC, id DESC`, páginas fixas de 20; sem multiplicar limite por página indefinidamente.

**Pré-requisito de segurança:** 0003 permite `entity_type <> 'client'` sob regra organizacional. Antes do primeiro produtor de Projetos, uma nova migration deve substituir essa policy para exigir projeto existente/acessível para `entity_type='project'`, preservando a regra de Clientes e a escrita restrita. Não simplesmente somar outra policy permissiva. Eventos legados órfãos de Projeto serão preservados, mas invisíveis para leitura operacional; verificar seu volume e impacto no preflight. Não há produtor de Projetos no código atual; não foi comprovado vazamento de dados reais em produção nesta auditoria.

## 12. Auditoria

Reutilizar `audit.log`: `entity_type='project'`, ID do projeto; `project.create`/`project.update`; contexto com `clientId`, versão anterior/nova quando aplicável. Ator e org derivados da sessão. Serializar explicitamente campos de negócio autorizados; sem sessão, tokens ou credenciais e sem comentários de chamado dentro da auditoria.

Mutação + eventos + auditoria na mesma transação. Falha de qualquer inserção reverte tudo. Edição sem mudança não grava evento/auditoria nem incrementa versão.

## 13. Version e concorrência

UPDATE condicionado a `(org_id, id, version)` e incremento atômico. Ler o estado necessário ao diff de forma consistente na transação; conflito não pode produzir audit com before incorreto. Validar versão também antes de aceitar um no-op com formulário obsoleto.

Retornar conflito tratável com recarga explícita; nenhuma sobrescrita silenciosa. `version`, IDs e campos ocultos do formulário são entradas não confiáveis, validadas no servidor. UUID inválido deve ser tratado antes da query; não assumir que o repository de referência já o faz.

## 14. Encerramento e exclusão

Sem DELETE de Projeto, sem ação baseada em `project:delete`, sem `deleted_at` nem estado adicional de arquivo nesta V1. `completed` e `cancelled` preservam o histórico, continuam consultáveis e podem ser reabertos explicitamente com escrita autorizada. FKs RESTRICT protegem vínculos.

## 15. Rotas

`/projetos`, `/projetos/novo`, `/projetos/[id]`, `/projetos/[id]/editar`, com loading/error/not-found. Leitura por Server Components; formulários interativos por Client Components e Server Actions pequenas. Actions extraem allowlist de campos, chamam service, traduzem `ServiceError`, revalidam caminhos afetados e redirecionam. Sem nova API REST.

## 16. Listagem

Nome, cliente, status, prioridade, responsável, prazo e progresso informado; tabela no desktop e cards no mobile. KPI local real de ativos, em revisão e atrasados pode usar agregação única autorizada. Ativos = `status='active'`; atrasados = prazo anterior ao dia atual em America/Sao_Paulo e status fora de `completed/cancelled`. Pausados com prazo vencido continuam atrasados. Estado sem dados diferente de erro/sem acesso.

## 17. Filtros

Cliente, status, prioridade, responsável (incluindo sem responsável) e prazo vencido. Parâmetros na URL, valores validados/normalizados, reset de página ao mudar filtros. Ordenação: recentes, atualizados, nome e prazo (NULL por último), sempre com desempate por ID. Mesmos predicados em listagem e contagem.

## 18. Busca

Busca server-side por nome do projeto e nome do cliente, com limite de tamanho do termo, parâmetros SQL e tratamento literal de `%`/`_`. Não incluir descrição extensa ou busca de conteúdo global na V1. Busca parcial não é acelerada automaticamente por B-tree; medir antes de propor extensão/índice de texto.

Seletor de Cliente também precisa de pesquisa/paginação server-side (25 opções por consulta), mais opção selecionada recuperada por ID autorizado. Não carregar todos os clientes para montar Select.

## 19. Paginação

25 projetos por página, tanto na listagem geral quanto na aba do Cliente. Página normalizada, inteira e limitada à faixa real após contagem. Timeline em janelas fixas de 20. Reutilizar `Pagination` existente, que aceita `buildHref`, sem criar um segundo componente equivalente. KPIs devem declarar seu recorte (org; aba recortada por cliente) para não confundir total filtrado.

## 20. Ficha e componentes

`PageHeader` único, Breadcrumb, status e CTA autorizado. Seções/abas Visão Geral, Cliente, Equipe (responsável), Etapas (status e datas), Timeline. Sem apresentar controles de equipe/tarefas inexistentes. Reutilizar Button, Input, Label, Textarea, Select, Badge, Card, KpiCard, Table, EmptyState, Skeleton, Tabs, Tooltip, Modal, Drawer, Alert e Toaster conforme uso real. Datas com Input nativo; não há DatePicker existente.

Manter tokens, dark glass, grafite, hairlines e ícones Lucide. Validar 1440, 1280×720, 1024, 768 e 375; teclado, foco, labels/erros, tabs e diálogos. Evitar dados de módulos sem permissão no HTML/RSC, mesmo em aba escondida.

## 21. Integração com Ficha Mestre

Substituir somente o placeholder Projetos por leitura do project-service filtrada por cliente. CTA Novo Projeto com cliente pré-selecionado, revalidado no servidor; links para ficha e listagem. Não alterar cadastro, contatos ou schema de Clientes.

Timeline do Cliente combina eventos próprios com eventos de Projetos via join `projects.org_id + client_id + id`, com autorização de Projetos. Não duplicar eventos como `entity_type='client'`: isso exporia detalhes de Projetos a quem tem apenas `client:read`. Sem `project:read`, não retornar eventos, nomes, contagens ou registros de Projetos. Consultas e totais devem usar exatamente a mesma regra. Preservar produtores/eventos de Cliente e Contato.

Mudança mínima necessária: repository/service da timeline do Cliente recebem internamente o resultado da autorização do servidor para incluir o novo tipo; a página da Ficha Mestre delega a aba a componente de Projetos. A futura consolidação de todos os módulos amplia essa mesma consulta, sem sistema paralelo.

## 22. Integração futura com Suporte

Somente preparar a relação conceitual: chamado terá Cliente obrigatório e Projeto opcional; se informado, projeto precisa pertencer ao mesmo cliente e org. Na auditoria de Suporte, avaliar FK tripla `(org_id, client_id, project_id)` e unique correspondente em Projetos. Não criar tabelas/colunas de chamado agora. Catálogo existente usa `ticket:read/write`, não `support:read/write`; Infraestrutura usa `infra:read/write`.

## 23. Migrations necessárias

Proposta: nova `0004_projects.sql` com tabela, índices, constraints, triggers, RLS, grants e substituição controlada da policy de eventos, na mesma entrega transacional. Snapshot novo e append no journal; 0000–0003 e snapshots antigos imutáveis.

RLS de Projetos deve reproduzir requisitos de sessão/membership/scope/org e permissões de leitura, incluindo acesso ao Cliente pai. Revogar default privileges de PUBLIC/anon/authenticated; somente SELECT autenticado pela policy. Escrita exclusivamente por servidor confiável, sem DELETE operacional. Nenhum grant de papel novo.

Antes da aplicação: consultar catálogo remoto/ledger/hashes, permissões e eventos legados em modo somente leitura; comparar ao último snapshot; revisar SQL manualmente; exercitar baseline sanitizada + migrations em banco isolado; conferir regressão de Clientes e efeitos da policy. **Aprovar Checkpoint A não autoriza aplicar migration.** No B, preparar e testar; apresentar SQL revisado e parar antes de aplicar até aprovação explícita.

## 24. Arquivos previstos

Novos no B:

- `src/server/db/schema/projects.ts`; migration 0004 e snapshot novo.
- `src/lib/auth/project-access.ts`.
- `src/lib/validation/project.ts` e normalização específica separada, reutilizando helpers puros existentes.
- `src/lib/projects/activity.ts`.
- `src/server/repositories/project-repository.ts`, `project-timeline-repository.ts`.
- `src/server/services/project-service.ts`, `project-events.ts`.
- `tests/unit/project-validation.test.ts`, `project-access.test.ts`; `tests/integration/project-foundation.test.ts`, `project-service.test.ts`.

Novos/substituídos no C:

- `src/app/(app)/projetos/page.tsx`, `actions.ts`, `loading.tsx`, `error.tsx`, `novo/page.tsx`, `[id]/page.tsx`, `[id]/not-found.tsx`, `[id]/editar/page.tsx`.
- `src/components/projects/`: formulário, filtros, badges, timeline, seletor de cliente e lista vinculada ao cliente.

Alterações pontuais previstas: schema index/journal; teste de reconciliação para incluir nova tabela; timeline repository/service de Clientes e sua ficha; navigation no D. Se duas permissões forem necessárias para visibilidade, ampliar aditivamente o contrato de navegação para exigir ambas, preservando os itens atuais. Atualizar README/roadmap/banco/segurança e relatórios B/C/D conforme resultados reais.

Dashboard: revisar navegação e ausência de regressão no D; a expansão do Dashboard operacional fica para depois dos quatro módulos, conforme ordem solicitada. Não acrescentar KPIs prematuros agora.

## 25. Riscos e decisões pendentes

1. **BYPASSRLS:** toda operação autorizada no service, org explícita em cada query/join/contagem/opção/timeline; RLS não substitui isso.
2. **Eventos:** policy atual é insuficiente para futuros eventos reais de Projeto; a revisão descrita no §11 bloqueia a ativação até estar testada.
3. **Permissões entre módulos:** aprovar `client:read` como requisito adicional; não promover grants silenciosamente.
4. **Negócio ainda não modelado:** aprovar seis estados, progresso manual opcional, cliente imutável, reabertura e V1 sem equipe múltipla/tasks.
5. **Estado remoto:** a documentação não prova ausência de drift hoje; preflight pendente, sem afirmar que produção está reconciliada nesta data.
6. **Referência não deve ser copiada cegamente:** timeline atual cresce com `page * pageSize`; owner é revalidado em toda edição; UUID inválido chega ao repository. Projetos precisa tratar esses limites nos seus próprios contratos, sem reabrir Clientes.
7. **Documentação histórica:** contém comentários de “sem produtor” e intenções de cofre/integrações já ultrapassadas pelo pedido atual. Não usar esses textos como autorização para ampliar escopo.
8. **QA anterior tem limites explícitos:** login completo sem membership e leitor de tela não foram comprovados no Checkpoint 3. Incluir cenários no QA seguro futuro, sem anunciar execução inexistente.

Nenhuma falha crítica nova com exploração em produção foi demonstrada. O risco da policy de eventos é evidência estática concreta e pré-condição para o novo módulo; não foi corrigido silenciosamente.

## 26. Plano de testes e checkpoints

**B — Fundação:** unit de trim/NULL, UUID, datas válidas/invertidas, status, prioridade, progresso e version; matriz de autorização; CRUD sem DELETE; FK cross-org/cliente obrigatório; imutabilidade; owner ativo/inativo e desativação concorrente; versões conflitantes/no-op obsoleto; rollback de evento e auditoria; diff consistente; conclusão/cancelamento/reabertura; SELECT RLS e negação de escrita direta; reconciliação de snapshot e preservação de Clientes.

Matriz de segurança: sem sessão, perfil inativo, sem membership, membership inativa, papel de outra org, sem read, somente write, read-only, read+write, sem client:read, org A/B, assigned, super admin. Exercitar caminho privilegiado da aplicação e caminho authenticated/RLS separadamente. Dados de org/ator injetados no payload não podem influenciar persistência.

**C — UI:** criar/editar/ficha; erros por campo; loading/empty/forbidden/not-found; busca, filtros, ordenação e limites; selecionar cliente fora da primeira página; aba/timeline do Cliente sem vazamento por permissão; eventos ordenados e sem duplicação; conflito de duas edições. Contagem e paginação corretas com datas/nomes iguais e páginas inválidas.

**D — Final:** integração/navegação permissionada, regressão Dashboard/Clientes, análise de queries sem N+1, renderização responsiva nas cinco resoluções, teclado/foco/ARIA e leitor de tela quando disponível; `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:foundation`, `npm run build`.

Usar PGlite existente para SQL isolado; concorrência real e login ponta a ponta em ambiente seguro separado. Não confundir claims simuladas com login real. Produção sem testes destrutivos; qualquer verificação futura exige método sem resíduos conforme pedido. Parar após B, C e D. Sem commit/push/PR/deploy antes da aprovação final do módulo.

## 27. Escopo exato recomendado para V1

Cadastro e edição gerencial de Projetos por Cliente; seis estados; quatro prioridades; responsável único opcional; descrição, início, prazo e estimativa manual de progresso; conclusão/reabertura; listagem com busca/filtros/paginação; ficha; timeline/auditoria transacionais; concorrência; segurança por org/permissão; aba real e eventos permissionados na Ficha Mestre; navegação ativa ao concluir QA.

Ficam fora: equipe múltipla, tarefas/milestones, kanban, comentários, anexos, apontamento de horas, automações, GitHub/deploy, stack/ambientes técnicos, secrets, Suporte/Domínios/Infraestrutura, financeiro e expansão do Dashboard operacional. Esses itens não ganham tabelas ou campos preventivos sem necessidade aprovada.

**Checkpoint A encerrado. Aguardar aprovação desta proposta antes de programar a fundação (B).**
