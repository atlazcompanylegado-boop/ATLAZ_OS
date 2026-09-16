# Projetos — Checkpoint B: fundação

Data: 15/09/2026. Escopo autorizado: fundação, migration preparada e testes isolados.
**0004 NÃO aplicada ao Supabase real. Sem UI, navegação ou integração da Ficha Mestre.**

## 1–5. Estado inicial e preflight somente leitura

HEAD inicial `5d68be6`, branch `main`. As únicas alterações pendentes eram README,
banco, segurança, roadmap e o relatório A, todas produzidas pela auditoria anterior.
Não havia alteração inesperada. Relatório A aprovado pelo usuário nesta sessão;
contratos de Clientes e SQL 0000–0003 relidos antes da implementação.

Preflight executado no ambiente de `.env.local` com `postgres`, uma conexão,
`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` e timeout por statement.
Sem migrator, DDL, DML ou exportação de linhas de negócio. Evidências sanitizadas:
[projetos-preflight.json](projetos-preflight.json). O script imprime apenas resumo;
não registra URL, senha, sessão ou valores de clientes.

- Ledger Drizzle: quatro entradas, timestamps e SHA-256 de 0000–0003 coincidentes com arquivos locais.
- `public.projects`: ausente.
- Eventos `entity_type='project'`: **0**.
- Eventos de Projeto órfãos: **0** (não existe tabela Projects).
- Catálogo possui as quatro chaves `project:read/write/delete/deploy`.
- Dez tabelas gerenciadas comparadas ao snapshot 0003: nenhuma divergência em
  nomes/tipos/nullability/presença de defaults, nomes de FKs/checks/uniques/índices e
  RLS. Definições de constraints, índices, policies, triggers e grants registradas
  para revisão manual; isso não é um diff textual completo de todo o Supabase.
- `activity_select` real corresponde a 0003. Clients/Contatos têm SELECT para
  authenticated; eventos e auditoria não têm escrita direta por anon/authenticated.
- Grants amplos herdados de `service_role` em tabelas anteriores foram observados e
  preservados. Para Projects, 0004 revoga também os default privileges desse papel
  e concede somente SELECT/INSERT/UPDATE. A conexão privilegiada do servidor
  continua exigindo autorização explícita na aplicação.

### Grants reais de Projetos na organização `atlaz`

| Papel | Grants explícitos `project:*` |
|---|---|
| ceo | Nenhum |
| comercial | read |
| designer | read |
| dev | read, write, deploy |
| financeiro | read |
| social_media | Nenhum |
| socio | read, write |
| super_admin | Nenhum grant explícito; catálogo efetivo resolvido pelo comportamento central existente |

Nenhum grant foi criado, removido ou promovido. Possuir `project:read` sozinho não
é suficiente: `client:read` também é obrigatório, sem concessão automática.

## 6–7. Arquivos

Novos:

- `src/server/db/schema/projects.ts`, `migrations/0004_projects.sql` e `migrations/meta/0004_snapshot.json`.
- `src/lib/auth/project-access.ts`.
- `src/lib/validation/project.ts`, `project-normalize.ts`, `src/lib/projects/activity.ts`.
- `src/server/repositories/project-repository.ts`, `project-timeline-repository.ts`.
- `src/server/services/project-service.ts`, `project-events.ts`.
- `tests/helpers/projects.ts`, `tests/unit/project-validation.test.ts`.
- `tests/integration/project-foundation.test.ts`, `project-service.test.ts`, `project-migration.test.ts`.
- Scripts reproduzíveis `scripts/projects-preflight.mjs`, `projects-preflight-compare.mjs`, `projects-snapshot.ts`.
- Este relatório e a evidência de preflight.

Modificados: schema index, journal, `service-error.ts` (dois códigos aditivos),
teste de reconciliação e script `test:foundation` no package.json. README, roadmap,
banco e segurança recebem o estado do checkpoint. Nenhum arquivo de UI ou contrato
de Clientes foi alterado; nenhuma dependência adicionada.

## 8–13. Schema, constraints, índices, triggers, RLS e grants

`projects`: UUID `id` com default do banco; org e cliente obrigatórios; nome trim
1–160; descrição opcional até 10.000; status default planning; prioridade default
normal; owner opcional; início/prazo DATE opcionais; conclusão TIMESTAMPTZ opcional;
progresso inteiro NULL/0–100; criador obrigatório; timestamps e versão inicial 1.

- PK `id`; unique `(org_id,id)`.
- FKs RESTRICT para org, `(org_id,client_id)` em Clientes e `(org_id,user_id)` em
  memberships para owner/criador. Sem unique tripla preventiva de Suporte.
- CHECKs para nome, descrição, seis status, quatro prioridades, progresso, ordem
  das datas, versão e conclusão. CHECK de conclusão exige **explicitamente progresso
  NOT NULL**, evitando aceitação por SQL UNKNOWN; exige 100 e timestamp presente.
  Qualquer outro status exige timestamp NULL.
- Sete índices: org+cliente+criação+ID; org+criação+ID; org+atualização+ID;
  org+nome+ID; org+status; org+owner parcial; org+prazo+ID parcial.
- `validate_project_write`: identidade, org, cliente, criador e criação imutáveis;
  versão inicial 1 e avanço exatamente 1; owner validado apenas na atribuição/troca,
  com `FOR SHARE` da membership e do usuário.
- `projects_updated_at` reutiliza `atlaz.set_updated_at()`.
- RLS SELECT exige org atual, usuário ativo, membership ativa, papel coerente,
  scope org, project:read, client:read e Cliente pai visível pela própria RLS.
- `REVOKE ALL` de PUBLIC/anon/authenticated/service_role na nova tabela; SELECT
  para authenticated; SELECT/INSERT/UPDATE para service_role. Sem DELETE.
- Função de trigger sem EXECUTE público. Sem nova função SECURITY DEFINER.

## 14–15. Policy de eventos e preservação de Clientes

`DROP POLICY activity_select` seguido por **uma única** policy com o mesmo nome;
não há policy permissiva adicional combinada via OR.

Mantém a condição externa `org_id=current_org_id()` e `is_member()`. Ramos:

1. `client`: mesmo EXISTS no Cliente, com org+ID e RLS do pai, como em 0003.
2. `project`: EXISTS em Projects com org+ID, aplicando a RLS nova e o Cliente pai.
3. Outros tipos: mesma leitura organizacional herdada, sem permissões novas.

Órfãos ficam invisíveis no ramo project; registros não são apagados nem migrados.
Payload não participa da decisão. Grants de escrita de eventos/audit permanecem
intocados. Policies de Clients, Contatos e audit.log não são alteradas.

## 16–18. Authorization, validation e normalization

`authorizeProjectSession` usa sessão resolvida no servidor + `can()`. Leitura exige
project:read + client:read; escrita soma project:write. Não exige client:write,
project:delete nem project:deploy. `assigned` é negado inclusive para super admin;
atividade e coerência de papel vêm do resolver consolidado, exercitado pelos testes
com queries reais e somente a resposta de Auth simulada.

Schemas Zod: criação, edição, filtros, mudança de status, reabertura, paginação,
seletor de Cliente, UUID e versão. Normalizadores puros separados: trim, vazio para
NULL, UUID minúsculo, números decimais inteiros de formulário e escape literal de
curingas. Não confunde NULL/0/100; não aceita progress decimal, booleano ou notação
exponencial como string. Versão não aceita sufixos, decimal ou zero.

Datas: formato YYYY-MM-DD e calendário real com regra de ano bissexto, sem Date
parsing/timezone. Prazo >= início. UUID inválido é rejeitado antes do repository;
rota malformada, inexistente e cross-org têm not_found seguro. Payloads de edição
não aceitam clientId; campos de autoridade não são passados à persistência.

## 19–20. Repository e service

Repositories recebem orgId em todas as operações de dados. Joins com Clientes,
membership do owner e ator de timeline mantêm escopo explícito. Persistência:
list/count/detail/create/update/lock, Cliente do projeto, owner ativo/lista de owners,
seletor paginado de Cliente, counts por Cliente e timeline.

Busca de projetos: nome do Projeto/Cliente. Seletor: nome, fantasia, razão social e
documento. SQL parametrizado com escape de %, _ e barra. Paginação fixa 25, clamp ao
total, desempate por ID; timeline 20 por janela (sem limite cumulativo). Filtros de
cliente/status/prioridade/owner/sem owner/atrasado; sorts criação/atualização/nome/prazo
com NULL por último. Counts filtrados por org/cliente; atrasado usa dia civil em
America/Sao_Paulo e exclui estados finais. Nenhuma query por linha de listagem.

Service público: listProjects, getProjectDetail, listProjectTimeline,
listProjectClients, getProjectClient, listAvailableProjectOwners, getProjectCounts,
createProject, updateProject, changeProjectStatus e reopenProject. Cada entrada
obtém e autoriza sessão; erros de banco encapsulados pelo Drizzle são traduzidos
sem expor SQL. Novos códigos aditivos: invalid_client e invalid_transition.

## 21–25. Owner e ciclo de vida

- Atribuição exige usuário e membership ativos na mesma org, validada no service
  e trigger. Owner desativado depois permanece; outra edição não o revalida.
- Cliente encerrado é permitido; cliente pai não pode ser trocado.
- Status não final pode mudar entre planning/active/paused/review. Concluir ou
  cancelar uma entidade existente usa `changeProjectStatus`, não edição comum.
- Concluir: status completed, progresso 100, timestamp definido pelo servidor.
  Criação já concluída também recebe esses valores no servidor e evento created.
- Cancelar: status cancelled, timestamp NULL; progresso anterior preservado.
- Estado final não muda por edição/status genérico; exige `reopenProject`.
- Reabrir completed **ou cancelled**: active, completedAt NULL, progress NULL.
  É a regra simples escolhida; nova estimativa pode ser informada depois.
- Editar outros campos de concluído preserva timestamp e exige progresso 100.
  Sem DELETE, tasks, equipe múltipla ou campos de integração preventiva.

## 26–30. Version, no-op, eventos, auditoria e transações

UPDATE lê e bloqueia a linha (`FOR UPDATE`) dentro da transação; confere versão
antes de qualquer no-op; calcula diff normalizado; atualiza por org+ID+version com
incremento atômico. Uma versão obsoleta sempre retorna conflict. Sem mudanças:
nenhum UPDATE/event/audit e nenhuma versão incrementada.

Eventos canônicos na própria entidade Project: created, updated, status_changed,
priority_changed, owner_changed, progress_changed. Cada campo específico gera seu
evento apenas quando mudou; nome/descrição/datas são agrupados em updated.
Conclusão não produz project.completed redundante. O avanço automático de progresso
gera progress_changed quando efetivamente mudou.

Audit usa project.create/update e allowlist explícita de before/after; contexto com
cliente e versões; ator/org derivados da sessão. Nada de objeto de request/sessão,
permissions ou campos de credencial. CREATE/UPDATE + todos os eventos + audit são
atômicos. Falha de evento ou audit reverte inclusive versão e dados do projeto.

## 31–37. Validação executada

Suítes novas (arquivos): `tests/unit/project-validation.test.ts`,
`tests/integration/project-foundation.test.ts`, `project-service.test.ts`,
`project-concurrency.test.ts`, `project-migration.test.ts`, mais a extensão de
`tests/integration/schema-reconciliation.test.ts` para encadear 0001→0004 e
comparar o snapshot novo contra o anterior tabela a tabela.

- `npm run lint`: sem erros nem avisos.
- `npm run typecheck`: sem erros (`tsc --noEmit`).
- `npm run test`: **285 testes aprovados, 1 pulado, de 286 (13 arquivos: 12
  aprovados, 1 com o teste pulado)**.
- `npm run test:foundation` (inclui as suítes de Clientes e as novas de
  Projetos): **207 testes aprovados em 7 arquivos, nenhuma falha**.
- `npm run build`: primeira execução falhou com `UNKNOWN: unknown error, read`
  durante "Collecting page data" e a repetição imediata falhou com
  `EPERM: operation not permitted, rmdir '.next/static/...'`; ambos os sintomas
  são de bloqueio de arquivo pelo sincronizador do OneDrive sobre `.next` (o
  repositório vive em `C:\Users\ponte\OneDrive\...`), não erro de compilação —
  `Compiled successfully` e `Finished TypeScript` já haviam terminado sem erro
  nas tentativas anteriores. Após `rm -rf .next` e nova execução, o build
  **concluiu com sucesso**: rotas geradas incluem `/projetos` como dinâmica
  (ainda o placeholder existente; nenhuma rota nova de Projetos foi criada
  neste checkpoint, conforme exigido). Registrado como risco operacional do
  ambiente local, não do código, no item 42.

## 38–39. SQL revisado e aplicação

SQL integral para revisão: [0004_projects.sql](../src/server/db/migrations/0004_projects.sql).
Ordem: tabela/constraints/índices → triggers → RLS/grants → substituição da policy.
Sem UPDATE/DELETE de dados, sem alteração de RBAC, Clientes, Auth ou audit.log.
O snapshot novo preserva as dez tabelas anteriores e encadeia prevId de 0003;
journal recebe somente entrada 4. Migrations e snapshots antigos permanecem intactos.

**0004 NÃO foi aplicada ao Supabase configurado.** Apenas leitura de catálogo e
contagens no ambiente real; toda execução de migration ocorreu em PGlite efêmero.

## 40–42. Git, limites e pendências

`git status`: árvore igual à do início deste checkpoint — mesmos arquivos
modificados (README, banco, roadmap, segurança, `package.json`, journal,
schema index, `service-error.ts`, teste de reconciliação) e os mesmos arquivos
novos de Projetos (schema, migration 0004 e snapshot, `project-access.ts`,
validação/normalização, `activity.ts`, repositories, services, scripts de
preflight, relatórios e testes). Nada foi adicionado ao stage; nenhum commit
foi criado.

`git diff --stat` (arquivos rastreados): 9 arquivos, 40 inserções, 3 remoções —
README (+4), `docs/banco.md` (+6), `docs/roadmap.md` (+9), `docs/seguranca.md`
(+5), `package.json` (+1/-1), journal (+7), schema index (+1), `service-error.ts`
(+2), teste de reconciliação (+5/-2). Nenhum arquivo de Clientes, auth, RBAC ou
UI foi alterado.

- PGlite executa PostgreSQL real embutido, mas serializa transações em uma conexão.
  O teste com Promise.allSettled verifica duas submissões da mesma versão e uma
  única vencedora; não comprova contenção entre duas conexões PostgreSQL remotas.
- Auth dos testes simula apenas a resposta de getUser; não é login GoTrue real.
- Nenhum QA de UI/build pode autorizar uma migration real.
- Antes de aplicar: revisar este SQL e resultados, reconfirmar preflight/hashes e
  obter aprovação explícita. Se surgirem eventos Project entre preflight e aplicação,
  reavaliar a contagem e a invisibilidade de órfãos.
- Não avançar para C, não ativar navegação e não integrar Ficha Mestre neste checkpoint.
- Sem commit, push, PR ou deploy. Aguardar aprovação explícita.
- Build local é sensível a bloqueios de arquivo do OneDrive em `.next`; se
  reaparecer, `rm -rf .next` antes de nova tentativa resolve (não é um bug do
  código dos módulos).

## 43. Recomendação para Checkpoint C

Fundação completa, testada e verde (lint, typecheck, test, test:foundation e
build). Nenhuma decisão do Checkpoint A foi revista; nenhuma alteração em
Clientes, RBAC, Auth ou migrations 0000–0003. `0004_projects.sql` está pronta,
revisada e **não aplicada** ao Supabase real — só em PGlite efêmero.

Antes de avançar ao Checkpoint C (UI), recomenda-se:

1. Revisão humana explícita deste relatório e do SQL de `0004_projects.sql`.
2. Reconfirmar preflight/hashes do catálogo remoto imediatamente antes de
   aplicar 0004 (o preflight deste checkpoint tem timestamp fixo e pode ter
   ficado desatualizado pelo tempo decorrido).
3. Aplicar 0004 ao Supabase real **somente** após essa aprovação — fora do
   escopo deste checkpoint.
4. Só então iniciar C: rotas `/projetos`, formulários, ficha, listagem,
   filtros, timeline e a integração mínima com a aba Projetos da Ficha Mestre
   de Clientes — sem tocar em cadastro/contatos de Clientes.

Nenhum código, navegação ou integração de UI foi criado nesta sessão, conforme
o escopo autorizado. Parando aqui, aguardando aprovação para C.
