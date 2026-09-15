# Fase 1 — Clientes / Ficha Mestre — Checkpoint 1

## Entrega e limite

Etapas A–D implementadas. As migrations `0002_clients` e
`0003_client_event_security` foram aplicadas ao Supabase configurado após os testes
isolados. O preflight conferiu os hashes e timestamps de 0000/0001 e a ausência
das novas tabelas. Nenhum dado de teste foi inserido no Supabase.

A verificação posterior, somente leitura, comparou as 10 tabelas gerenciadas ao
Drizzle (colunas, FKs, checks, índices e RLS): nenhuma divergência encontrada.
Clientes e Contatos possuem zero registros. Os grants confirmam INSERT de
auditoria/eventos, UPDATE de Clientes e auto-reativação negados a authenticated;
UPDATE do próprio nome continua permitido.

Não foram implementados repository, service de Clientes, formulário, páginas,
Server Actions, dashboard ou navegação. `/clientes` continua sendo placeholder
até o Checkpoint 2. Sem commit, push, PR ou deploy.

## A — sessão/autorização

- Perfil interno inativo resulta em sessão nula para os consumidores de
  `getCurrentSession()`, ainda que o Supabase Auth tenha sessão válida.
- Memberships inativas não são selecionadas. Seleção ordenada por `created_at, id`.
- Papel deve pertencer à mesma organização da membership; vínculo incoerente é
  rejeitado sem trocar silenciosamente para outra organização.
- `scope` passa a integrar a sessão. `authorizeClientSession()` nega qualquer
  escopo diferente de `org`, inclusive `assigned` e inclusive para super admin.
- `super_admin`, lido do banco, recebe o catálogo de permissões. Demais papéis
  recebem exclusivamente seus grants. Nenhum grant de CEO foi criado.
- Leitura exige `client:read`; escrita exige `client:read` e `client:write`.
- O helper retorna contexto com org/usuário/membership/ator derivados da sessão.
  No Checkpoint 2, o service deve obter a sessão e usar esse contexto antes de
  qualquer repository; nenhuma informação de organização do formulário é autoridade.

## B — eventos e perfil

- Removidas as policies de INSERT público de `audit.log` e `activity_events`.
- Revogados INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER de PUBLIC, anon e
  authenticated nessas tabelas; a conexão confiável do servidor mantém acesso.
- Timeline `entity_type='client'` verifica a existência e a RLS do cliente pai.
  Eventos de contato também deverão usar o ID do cliente pai. Eventos órfãos de
  Clientes ficam invisíveis; os demais tipos mantêm a regra organizacional herdada.
- `audit_select` permanece exigindo `audit:read`; nenhuma aba de auditoria foi criada.
- Brecha adicional comprovada: `users_update_self` tinha UPDATE irrestrito na
  tabela, permitindo auto-reativação de `is_active`. A migration restringe UPDATE
  direto a `full_name`/`avatar_url`; a policy de perfil próprio foi preservada.
  Alterações de identidade, email e atividade passam apenas por servidor autorizado.

A correção foi preparada antes do schema de Clientes. Sua execução é numerada
depois de 0002 porque a policy consulta a nova tabela. As duas migrations são
aplicadas pelo migrator em uma transação; não existe etapa de UI entre elas.

## C — reconciliação

Ver [matriz A/B/C](clientes-reconciliacao.md). Colunas, defaults, ações/nomes de FKs,
índices, CHECK de scope e flags RLS foram reconciliados. FKs que não existiam no
banco foram removidas somente da representação. O schema `auth` saiu dos exports
gerenciados. Nenhuma migration ou snapshot aplicado foi reescrito.

Novos snapshots 0002/0003 registram a representação correta. Policies, funções,
grants e triggers continuam sob controle explícito das migrations SQL; não se
deve gerar/aplicar DDL automático contra o estado antigo sem revisão.

## D — schema final

### `public.clients`

| Campo | Tipo / regra |
|---|---|
| `id` | UUID PK, gerado pelo banco |
| `org_id` | UUID obrigatório, FK para org, remoção restrita |
| `name` | Texto obrigatório, 1–160 caracteres após trim |
| `trade_name`, `legal_name` | Opcionais, limites 160/200 |
| `person_type` | Opcional: `individual` ou `company` |
| `document` | Opcional, sem máscara, único por organização quando informado; exige person_type |
| `status` | Obrigatório, default `lead`; CHECK `lead/onboarding/active/paused/closed` |
| `source` | Texto opcional, até 120 caracteres após trim |
| `owner_user_id` | Opcional, FK composta para membership da mesma org |
| `website` | Opcional, HTTP(S), até 2048 caracteres |
| `notes` | Opcional, até 10.000 caracteres |
| `created_by` | Obrigatório, FK composta para membership da mesma org |
| `created_at`, `updated_at` | Timestamptz obrigatório, default now; updated_at por trigger |
| `version` | Inteiro obrigatório, inicia em 1; UPDATE deve avançar exatamente 1 |

O CPF possui 11 dígitos. CNPJ possui 14 posições em maiúsculas, com as duas últimas
numéricas; formatos numérico e alfanumérico são aceitos. Isso evita bloquear
inscrições novas: a Receita informou a primeira emissão alfanumérica em julho de
2026 ([fonte oficial](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico)).
O CHECK atual protege formato/normalização; a validação de dígitos verificadores,
normalização amigável e mensagens Zod pertencem à etapa E, ainda não implementada.

Na atribuição/troca de responsável, uma trigger verifica usuário e membership
ativos da mesma org, com bloqueio compartilhado durante a operação. Um responsável
desativado posteriormente permanece como referência histórica; editar outro campo
não apaga nem reativa esse vínculo. O service ainda deverá validar a seleção.

Identidade, organização, criador e data de criação não podem ser alterados. FKs
RESTRICT preservam os vínculos; desligamento de membros deverá usar inativação,
sem apagar memberships que sustentam o histórico.

### `public.client_contacts`

| Campo | Tipo / regra |
|---|---|
| `id` | UUID PK, gerado pelo banco |
| `org_id`, `client_id` | Obrigatórios; FK composta para o cliente da mesma org |
| `name` | Obrigatório, 1–160 caracteres após trim |
| `job_title`, `type` | Opcionais, limites 120/60 |
| `email` | Opcional, formato básico de email, até 254 caracteres |
| `phone`, `whatsapp` | Opcionais, 8–15 dígitos sem máscara |
| `is_primary` | Obrigatório, default false; no máximo um por cliente |
| `notes` | Opcional, até 5.000 caracteres |
| `created_by` | Obrigatório, FK composta para membership da mesma org |
| `created_at`, `updated_at` | Timestamptz obrigatório; updated_at por trigger |

Regra aprovada para a próxima implementação: cliente pode ficar sem contato
principal, inclusive após remover o principal. Nenhum contato será promovido
automaticamente. Troca de principal desmarca o anterior e marca o novo na mesma
transação. Não há cópia de email/telefone na tabela clients.

Índices cobrem documento por org, nome, status, responsável, criação, atualização,
contatos por cliente e unicidade do principal. Os índices de datas/nome incluem ID
para desempate. Não foi adicionada extensão de busca ou biblioteca de máscara.

### Escrita e isolamento

As novas tabelas têm RLS e somente SELECT público autenticado, condicionado a
client:read, usuário/membership ativos, scope org e papel coerente com a org.
Contatos herdam a restrição do cliente. Sem grants/policies de escrita para
authenticated/anon: todas as mutations futuras passarão pelo servidor para garantir
ator, versão e evento/auditoria na mesma transação.

A conexão Drizzle possui BYPASSRLS. Isso permanece explícito: os futuros services
precisam autorizar cada chamada; os repositories precisam filtrar org_id, inclusive
nas relações. RLS não é uma proteção automática desse caminho privilegiado.

A trigger de versão é uma proteção estrutural. O UPDATE com `WHERE org_id + id +
version`, tratamento de conflito e a transação de negócio serão responsabilidade
da etapa E/I. Contatos deverão avançar a versão do pai na mesma transação; não há
trigger de evento nem logs duplicados.

## Testes e limites

Executados após as alterações de código e SQL:

- ESLint sem cache: aprovado.
- TypeScript `--noEmit --incremental false`: aprovado.
- Vitest: **81 testes, 6 arquivos, todos aprovados** (7 existentes + 74 novos).
- Sessão: 15 casos com queries Drizzle reais, simulando apenas a resposta do Auth.
- Fundação Clientes: 56 casos de defaults, validações estruturais, duplicidade,
  FK por organização, responsável, contatos, principal, versão, RLS, grants,
  auto-reativação negada e rollback por falha de evento/auditoria.
- Reconciliação: 3 testes de preservação de dados anteriores, equivalência do
  schema ao catálogo migrado e correspondência dos snapshots.

Comando reproduzível: `npm run test:foundation`. A dependência de desenvolvimento
`@electric-sql/pglite` executa PostgreSQL em memória. A fixture não lê `.env.local`,
não aceita DATABASE_URL e não conecta à produção. Não se adicionou dependência ao
runtime do app.

RLS foi exercitado com role authenticated e claims simuladas, incluindo um perfil
existente na fixture sem membership (somente o perfil próprio fica visível).
**Isso não é login real no Supabase.** O teste com usuário autenticado sem membership
em ambiente apropriado segue pendente para o Checkpoint 3; não foi criado usuário
nem fixture no Supabase configurado.

Build, UI, QA visual e testes de service não fazem parte deste checkpoint e não
foram declarados concluídos. O aviso já existente do Vitest/Vite sobre futuro
configLoader nativo permanece; não interfere no resultado atual dos testes.

## Próximo passo

Parar no Checkpoint 1. Somente após aprovação: etapas E–I (domínio, listagem,
cadastro, ficha, contatos, timeline e edição), preservando estes contratos.
