# Clientes — reconciliação da fundação (Checkpoint 1)

O catálogo do Supabase configurado foi consultado novamente em transação somente
leitura antes das alterações. Nenhuma linha de negócio foi exportada. As diferenças
abaixo foram classificadas antes de preparar DDL. A representação da fundação foi
corrigida em TypeScript; migrations 0000/0001 e seus snapshots permanecem intactos.

| Diferença comprovada | Classe | Decisão |
|---|---|---|
| `audit.log.org_id`, `actor_label`, `context` são NOT NULL | A — banco correto | Refletir `.notNull()`; `context` possui default `{}` |
| `audit.log` não possui FKs para org/ator | A | Remover apenas as FKs fictícias do Drizzle; preservar histórico desacoplado |
| `activity_events.source` tem default `app` | A | Refletir default no Drizzle |
| FK do ator de eventos usa ON DELETE SET NULL | A | Refletir ação e nome da FK |
| `users.auth_user_id` é único mas não tem FK para `auth.users` | A | Remover somente a declaração de FK; não modificar Supabase Auth |
| Índice único `users_email_key` em `lower(email)` | A | Representar índice funcional |
| Índices de memberships, timeline e auditoria omitidos | A | Representar nomes, colunas e ordenação existentes |
| CHECK `memberships.scope` aceita `org`/`assigned` | A | Representar CHECK; não criar novo tipo nem mudar valores |
| Nomes de FKs e constraints únicos divergentes dos nomes gerados | A | Usar os nomes reais explicitamente |
| RLS habilitado nas oito tabelas, omitido no modelo | A | Representar `.enableRLS()`; policies/triggers continuam em SQL versionado |
| Escrita direta em audit/eventos permite falsificação | B — alteração deliberada | Nova migration 0003 revoga DML de papéis públicos e remove INSERT policies |
| `users_update_self` + UPDATE na tabela permite auto-reativação e alteração de identidade | B | Confirmados grants de `is_active`/`auth_user_id`; migration 0003 limita UPDATE direto a `full_name`/`avatar_url`, preservando a policy |
| Timeline não verifica acesso ao cliente | B | Nova policy consulta o cliente com RLS; outros tipos mantêm acesso organizacional |
| Desempate de memberships por data inexistente no helper SQL | B | Migration 0002 adicionará `id` ao ORDER BY, alinhando SQL e sessão |
| Tabelas Clientes/Contatos inexistentes | B | Migration 0002 criará tabelas, constraints, índices, triggers e RLS |
| Eventual FK de Auth, concessões de CEO, semântica de `assigned` | C — regra não definida | Não adicionar FK/grants nem inventar atribuição; Clientes nega `assigned` |

Não foi feita geração automática de DDL contra os snapshots antigos. Os novos
snapshots registrarão a representação reconciliada junto das novas tabelas; não
significam que o DDL da fundação foi reaplicado. Funções, grants e policies são
mantidos nas migrations SQL, não inferidos pelo Drizzle.

A fixture `tests/fixtures/foundation.sql` reproduz a estrutura relevante herdada,
incluindo policies anteriores, sem dados reais. O helper Auth dessa fixture é uma
simulação SQL e não substitui o teste com login real previsto no Checkpoint 3.
