# Domínios — Checkpoint A: auditoria e proposta

Data: 16/09/2026. **Só auditoria.** Nenhum código, migration, alteração de banco,
commit, push ou deploy. Aguardando aprovação.

## 0. Base auditada

- Branch `main`, HEAD `9075f5a` ("docs: marca Suporte como publicado (Checkpoint
  D.2)"), sincronizada com `origin/main`. `git status`: árvore limpa.
  `git diff --stat`: vazio. `git log --oneline -15`: Clientes (`5d68be6`),
  Projetos (`82539d2`, `b166c74`) e Suporte (`6cfc715`, `9075f5a`) publicados;
  nenhum commit de Domínios.
- Lidos: README, roadmap, banco, segurança; checkpoints finais de Clientes (3),
  Projetos (D, D.2) e Suporte (A–D.2); schema Drizzle (`projects`,
  `support-tickets`, demais tabelas via índice); journal; `0005_support.sql`
  completa; `config/permissions.ts`; `config/navigation.ts`;
  `lib/auth/session.ts`, `client-access.ts`, `project-access.ts`,
  `ticket-access.ts`; `client-service.ts`, `ticket-service.ts`;
  `ticket-repository.ts`, `ticket-comment-repository.ts`,
  `ticket-timeline-repository.ts`, `client-timeline-repository.ts`,
  `project-repository.ts` (regra de "hoje"); `lib/projects/format.ts`;
  `lib/validation/normalize.ts`; componentes de Suporte (formulário, filtros,
  seletores); `docs/projetos-preflight.json` (snapshot somente leitura de
  15/09, já versionado).
- **Verificação no Supabase real: não executada.** A consulta somente leitura
  de grants/eventos/policy (mesmo padrão aprovado no Checkpoint A de Suporte)
  foi **bloqueada pela política de permissões do ambiente** ("Production
  Reads"). Não contornei o bloqueio. Ver §5 e decisão D16.

## 1. Estado atual de Domínios

Não existe nada implementado: nenhuma rota `/dominios`, nenhuma tabela
`domains` (nem em schema, nem em migrations — `grep` sem resultados em
`src/server/db`), nenhum service, repository, validação, componente ou teste.
Nenhum código parcial.

## 2. Placeholders existentes

- **Ficha Mestre do Cliente** (`clientes/[id]/page.tsx`): aba `dominios` com
  `EmptyState` e o texto "Os domínios associados a este cliente aparecerão aqui
  quando o módulo Domínios for habilitado." — honesto, sem número.
- **Sidebar**: **não há** item Domínios (nem Infraestrutura). Não existe
  `src/app/(app)/dominios/`.
- **Dashboard**: o card de alertas diz que o "motor de alertas (domínio/contrato
  vencendo…)" entra na Fase 2 — coerente com não automatizar nada agora.
- **Roadmap**: Fase 1 lista "Domínios"; Fase 2 lista "motor de Alertas
  (vencimento de domínio…)". Intenção histórica, não requisito detalhado.
- **Cofre** (`/cofre`, placeholder) e `docs/seguranca.md §5`: credenciais de
  cliente/projeto pertencem ao futuro Cofre (Supabase Vault); tabelas de
  negócio só guardariam uma referência (`vault_secret_id`). Isso fundamenta o
  §23 abaixo.

## 3. Posição na sidebar

A sidebar real tem também os grupos **Segurança** (Cofre) e **Sistema**
(Configurações), além dos listados no pedido.

**Recomendação: OPERAÇÃO**, depois de Suporte:
`Clientes → Projetos → Suporte → Domínios → (Infraestrutura, futuro)`.
Domínios é ativo operacional do cliente (mesma natureza de Projetos/Suporte),
não comercial nem de gestão. Infraestrutura deve entrar no mesmo grupo, logo
abaixo, com `permission: ["infra:read","client:read"]` — mantendo o padrão
"módulo operacional por cliente". Domínios: `status: "available"` e
`permission: ["domain:read","client:read"]` somente quando a UI estiver pronta
(mecanismo multi-permissão já existe).

## 4. Permissions existentes

`src/config/permissions.ts` (espelho do banco) já contém **`domain:read`** e
**`domain:write`**. Confirmado também no snapshot somente leitura de 15/09
(`docs/projetos-preflight.json`, catálogo com 41 chaves). Não existe
`domains:*`, `dominio:*`, `domain:delete` nem `domain:manage`. A convenção é
por entidade no singular (`client`, `project`, `ticket`, `domain`, `infra`,
`vault`). **Nenhuma chave nova é necessária.**

## 5. Grants por papel

**Não verificáveis nesta sessão.** Os snapshots locais só cobrem `project:*`
(15/09) e o Checkpoint A de Suporte cobriu `ticket:*`; nenhum documento registra
`domain:*` por papel. A leitura direta foi bloqueada (§0). Único fato certo:
`super_admin` recebe o catálogo inteiro via `getCurrentSession()`, então terá
`domain:*` efetivamente.

Referência útil (snapshot de 15/09, `project:*`): comercial `read`; designer
`read`; dev `read/write/deploy`; financeiro `read`; socio `read/write`;
ceo e social_media nenhum.

**Pendência antes do Checkpoint B:** confirmar `domain:*` e `client:read` por
papel (decisão D16). Se só `super_admin` tiver `domain:read`, o módulo ficará
invisível para os demais — pode ser intencional, mas precisa ser consciente. Não
proponho criar/alterar grants.

## 6. Autorização proposta

`authorizeDomainSession(session, access)`, idêntico a
`authorizeTicketSession`:

- nega sem sessão, sem membership, `scope !== "org"` (`assigned` negado, inclusive
  `super_admin` com scope `assigned`);
- **leitura:** `domain:read` + `client:read`;
- **escrita:** `domain:read` + `domain:write` + `client:read`;
- **nunca** exige `client:write`;
- `project:read` **não** entra na função (não bloqueia o domínio).

`project:read` controla, na camada de serviço:

| Ação | Sem `project:read` | Com `project:read` |
|---|---|---|
| Ver que existe Projeto vinculado | sim (`hasProject`) | sim |
| Ver nome/ID/status/link do Projeto | **não** | sim |
| Listar projetos no seletor | **não** (ação negada) | sim, só do Cliente |
| Vincular/trocar/remover Projeto | **não** (rejeitado) | sim, mesmo Cliente |
| Editar outros campos de domínio com projeto vinculado | sim, **`project_id` preservado** | sim |
| Buscar por nome de Projeto | **não** (termo não casa com projeto) | sim |
| Filtrar por Projeto | **não** | sim |

Esse desenho é deliberadamente mais estrito que o Suporte publicado — ver §47,
risco R1.

## 7. Relação com Cliente

`client_id` obrigatório, mesma org, FK composta `(org_id, client_id) →
clients(org_id, id)`, `ON DELETE RESTRICT`. **Imutável na V1** (trigger), mesmo
contrato de Projetos/Suporte. Nome/documento do Cliente nunca copiados — sempre
via join com filtro de org. Troca de dono = fluxo explícito futuro (§31).

## 8. Relação com Projeto

`project_id` opcional. Quando informado: existe, mesma org, **mesmo Cliente**.
Reaproveita a proteção estrutural do Suporte **sem nova constraint em
`projects`**: `projects_org_client_id_key UNIQUE (org_id, client_id, id)` já
existe desde a 0005, então basta
`FOREIGN KEY (org_id, client_id, project_id) REFERENCES projects(org_id,
client_id, id) ON DELETE RESTRICT` (MATCH SIMPLE — `NULL` passa livre).
Mutável (vincular/trocar/remover), sempre revalidado no serviço e na FK. Nome do
Projeto nunca copiado.

## 9. Schema proposto — `domains` (não implementado)

| Campo | Tipo / regra | Veredito |
|---|---|---|
| `id` | UUID PK, default no banco | necessário |
| `org_id` | UUID NOT NULL, FK `orgs`, RESTRICT; só da sessão | necessário |
| `client_id` | UUID NOT NULL, FK composta; **imutável** | necessário |
| `project_id` | UUID NULL, FK tripla; mutável | necessário |
| `domain_name` | TEXT NOT NULL, forma canônica ASCII (§10); **imutável** (D7) | necessário |
| `registrar` | TEXT NULL, trim, 1–100 | útil (§14) |
| `registration_date` | DATE NULL | opcional, barato (§15, D14) |
| `expiration_date` | DATE NOT NULL (D8) | central (§16) |
| `auto_renew` | BOOLEAN **NULL** (tri-estado, D9) | útil (§17) |
| `status` | TEXT NOT NULL default `active`, CHECK `active/transferring/inactive` | necessário (§18) |
| `owner_user_id` | UUID NULL, FK composta p/ membership (D10) | recomendado (§24) |
| `notes` | TEXT NULL, trim, 1–2000 | útil (§22) |
| `created_by` | UUID NOT NULL, FK composta p/ membership; imutável | necessário |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL; `updated_at` por trigger | necessário |
| `version` | INTEGER NOT NULL default 1; +1 por UPDATE | necessário (§25) |

**Não incluídos** (e por quê): `renewal_state`/`days_remaining` (derivados, §19);
`inactivated_at`/`deleted_at` (histórico fica em `updated_at` + timeline, mesmo
padrão de `cancelled` em Projetos); qualquer campo de credencial/EPP/DNS/SSL/
hospedagem (§23–26, §65); número humano sequencial (o próprio nome do domínio é
o identificador humano).

Constraints propostas: `UNIQUE(org_id, id)`; unicidade de nome (§13); FKs
org/cliente/projeto/responsável/criador; CHECKs de formato do nome (§10),
status, `registrar`/`notes` com trim e limites, `expiration_date >=
registration_date` quando ambos existem, `version >= 1`.

Índices propostos: `(org_id, expiration_date, id)` (buckets, KPIs, ordenação
padrão); `(org_id, client_id, domain_name)`; `(org_id, updated_at desc, id)`;
`(org_id, status)`; parciais em `project_id` e `owner_user_id`; o índice único
parcial do §13.

## 10. Normalização de `domain_name`

Evidência obtida nesta sessão (Node local, sem banco): `url.domainToASCII()`
**trunca silenciosamente** caminho e query (`example.com/path` →
`example.com`) e aceita `-bad.com`, `a..b.com`, `localhost`, IPs e rótulo único;
`new URL()` **descarta silenciosamente** credenciais (`user:pass@example.com` →
`example.com`). Por isso nenhuma das duas pode ser usada sozinha — a regra
precisa ser explícita.

**Pipeline proposto (servidor é a autoridade; a UI só pré-visualiza):**

1. `trim`; vazio → erro "Informe o domínio".
2. Rejeitar se contiver espaço interno, `@`, `*` ou caractere de controle.
3. Remover **um** prefixo `http://` ou `https://` (sem diferenciar maiúsculas).
   Qualquer outro esquema (`ftp://`, `mailto:`) → rejeitar.
4. Remover **uma** barra final isolada.
5. Rejeitar se ainda houver `/`, `?`, `#` ou `:` (caminho, query, fragmento,
   porta). Mensagem sugere o domínio extraído: "Informe só o domínio. Você quis
   dizer `empresa.com.br`?" — **nunca corrigido silenciosamente**.
6. Remover **um** ponto final (`example.com.` → `example.com`).
7. Converter com UTS-46 (`domainToASCII`, ou `new URL("http://"+x).hostname`,
   que é isomórfico navegador/Node); resultado vazio → rejeitar (ex.:
   `xn--zz.com`, punycode inválido).
8. Minúsculas.
9. Validação estrutural (sem lista de TLD): 2+ rótulos; total ≤ 253; cada rótulo
   1–63, `[a-z0-9-]`, sem hífen no início/fim; TLD começa com letra (aceita
   `xn--…`) e não é numérico; rejeitar IPv4/IPv6.
10. Rejeitar prefixo `www.` com sugestão (D5) — ver §11.
11. Persistir a forma ASCII; exibir com `domainToUnicode`.

Defesa em profundidade: CHECK no banco garantindo minúsculas ASCII, ausência de
ponto final e o formato LDH por rótulo (o punycode é ASCII puro, então o CHECK
funciona também para IDN).

| Entrada | Resultado proposto |
|---|---|
| `https://example.com` | aceita → `example.com` |
| `http://example.com/` | aceita → `example.com` |
| `www.example.com` | **rejeita**, sugere `example.com` (D5) |
| `EXAMPLE.COM` | aceita → `example.com` |
| `example.com/path` | **rejeita** (caminho), sugere `example.com` |
| `example.com?x=1` | **rejeita** (query), sugere `example.com` |
| `sub.example.com` | aceita estruturalmente — ver §11 |
| `empresa.com.br` | aceita |
| `example.com.` | aceita → `example.com` |
| `münchen.de` | aceita → `xn--mnchen-3ya.de`, exibido `münchen.de` (D4) |
| `user:pass@example.com` | **rejeita** (credencial embutida — nunca descartada em silêncio) |
| `example.com:8080` | **rejeita** (porta) |
| `localhost`, `example`, `192.168.0.1` | **rejeita** (rótulo único / IP) |
| `-bad.com`, `a..b.com`, `exa mple.com`, `*.example.com` | **rejeita** |

## 11. Subdomínios

Ponto técnico decisivo: **sem a Public Suffix List (PSL) não existe forma
estrutural de distinguir** `empresa.com.br` (registrável) de `app.example.com`
(subdomínio) — os dois têm três rótulos. Validação por lista de TLD foi
descartada pelo próprio pedido (§61).

- **Opção 1 (recomendada):** validação estrutural + convenção de uso. O módulo é
  documentado e rotulado como "domínios registrados" ("Informe o domínio
  registrado, ex.: `empresa.com.br`"); `www.` é rejeitado explicitamente;
  outros subdomínios **não são bloqueados tecnicamente** (limitação
  documentada).
- **Opção 2:** adicionar dependência com PSL embutida (ex.: `tldts`) e rejeitar
  tudo que não for domínio registrável. Correto, mas adiciona dependência e uma
  lista que envelhece (exige atualização periódica do pacote) — parcialmente em
  conflito com o §61.

Decisão D3.

## 12. IDN / punycode

Viável na V1 sem dependência nova: o UTS-46 nativo do Node/navegador converteu
`münchen.de` ↔ `xn--mnchen-3ya.de` corretamente e rejeitou punycode inválido.
Proposta: aceitar IDN, **armazenar a forma ASCII** (base da unicidade e da
busca), **exibir Unicode**, e na ficha mostrar também a forma ASCII quando
diferirem — reduz confusão com homógrafos (ex.: `а` cirílico vs `a` latino).
Busca normaliza o termo pelo mesmo caminho quando parecer domínio. Alternativa:
rejeitar qualquer caractere não ASCII na V1 com mensagem explícita. Decisão D4.

## 13. Unicidade

Recomendo **índice único parcial** `UNIQUE (org_id, domain_name) WHERE status <>
'inactive'`: no máximo um registro "vivo" por domínio na org, mas um domínio
inativado (Atlaz deixou de gerir) pode ser recadastrado depois — inclusive para
outro Cliente — preservando o histórico do registro antigo, sem precisar tornar
`client_id` mutável. Reativar um inativo quando já existe outro vivo com o mesmo
nome falha na constraint e vira erro humano ("Já existe um domínio ativo com
este nome").

Alternativa mais simples: `UNIQUE (org_id, domain_name)` total — um nome nunca
se repete na org, mesmo inativo; mudança de Cliente passa a exigir o fluxo
futuro de transferência. Decisão D6.

## 14. `registrar`

Texto simples, opcional, trim, 1–100, casing preservado. Sem tabela de
provedores. Busca cobre o campo. Não proponho filtro dedicado de registrador na
V1 (a busca resolve); um `datalist` com os valores já usados na org é um
refinamento opcional de UI.

## 15. `registration_date`

`DATE` opcional, sem lógica associada; CHECK `expiration_date >=
registration_date`. Vale manter como histórico barato. Decisão D14 (manter ou
cortar).

## 16. `expiration_date`

`DATE` (sem timezone, `mode: "string"` no Drizzle, mesmo padrão de
`projects.due_date` — nunca passa por `Date`). **Recomendo NOT NULL sempre.**
Motivos: é o dado que justifica o módulo; é público (RDAP/WHOIS/painel do
registrador); um domínio "sem data" é exatamente o risco invisível que o módulo
existe para eliminar; e evita um quinto estado ("não informado") em todo KPI,
filtro e ordenação. Alternativa: nullable com situação explícita "Vencimento
não informado" contada em KPI próprio. Decisão D8.

## 17. `auto_renew`

Estado **declarado** pelo usuário, nunca verificado externamente. Recomendo
`auto_renew BOOLEAN NULL` (tri-estado): `NULL` = não informado, `true` =
configurada, `false` = desativada. Um `NOT NULL DEFAULT false` afirmaria
"desativada" quando ninguém verificou. Rótulos de UI: "Renovação automática:
configurada (informado)" / "desativada" / "não informada". Nunca "será
renovado" ou "renovação garantida". Nome da coluna `auto_renew` é suficiente;
a semântica "declarada" fica no comentário da coluna e na UI. Decisão D9.

## 18. Status persistido

`active` (Ativo — gerido pela Atlaz), `transferring` (Em transferência — entre
registradores/contas, sem workflow), `inactive` (Inativo — não é mais gerido;
substitui exclusão). Transições por ações explícitas:

| De | Para |
|---|---|
| `active` | `transferring`, `inactive` |
| `transferring` | `active`, `inactive` |
| `inactive` | `active` (reativar; sujeito ao §13) |

Edição comum não muda status (mesmo desenho do Suporte). Sem `expiring`/
`expired` persistidos. Decisão D11.

## 19. Situação de vencimento (derivada)

Nunca armazenada. Calculada no SQL como `days_remaining = expiration_date -
hoje_SP` (data − data = inteiro no Postgres), devolvida pelo repository, usada
igualmente por listagem, filtros, KPIs e ficha — uma única fonte, sem relógio do
navegador. Para `status = inactive` a situação é "não se aplica" (não alarma).
`transferring` continua sendo classificado (transferência perto do vencimento é
risco real).

Status e situação são **ortogonais e exibidos separadamente**: um domínio pode
estar `Ativo` e `Vencido` ao mesmo tempo (ex.: renovação esquecida) — isso é
informação, não contradição. Contraditório seria a UI dizer "Ativo" com
`status = inactive`, o que o desenho impede (o badge de status lê só a coluna).

## 20. Buckets 60/30/15/7/vencido

Decisão explícita proposta (D12):

**Filtros e KPIs = janelas cumulativas** ("vence em até X dias", `0 ≤ dias ≤
X`, sem incluir vencidos, que têm opção própria). Motivo operacional: com faixas
exclusivas, "Vence em 30 dias" (16–30) **esconderia** um domínio que vence em 5
dias — perigoso numa lista de renovação.

| Opção de filtro | Regra |
|---|---|
| Todos | sem filtro |
| Vence em até 60 dias | `0 ≤ dias ≤ 60` |
| Vence em até 30 dias | `0 ≤ dias ≤ 30` |
| Vence em até 15 dias | `0 ≤ dias ≤ 15` |
| Vence em até 7 dias | `0 ≤ dias ≤ 7` |
| Vencidos | `dias < 0` |

Todos aplicados só a `status <> 'inactive'`.

**Tom visual = faixas exclusivas** (cada domínio em exatamente um tom):

| Dias | Tom | Texto |
|---|---|---|
| > 30 | neutro | "Vence em 45 dias" |
| 8–30 | atenção (`warning`) | "Vence em 12 dias" |
| 0–7 | crítico (`danger`) | "Vence em 3 dias" / "Vence hoje" |
| < 0 | vencido (`danger`) | "Vencido há 4 dias" |

## 21. Data de referência

"Hoje" = dia civil em **America/Sao_Paulo**: no SQL,
`(now() at time zone 'America/Sao_Paulo')::date` (mesma regra já em produção em
`project-repository.ts`); no cliente, só para exibição,
`Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })` (mesma de
`isProjectOverdue`). Regra de negócio: o domínio é válido **até o fim do dia de
vencimento** em São Paulo — `dias = 0` é "Vence hoje" (crítico), vencido só a
partir do dia seguinte. Registradores podem expirar em horário UTC específico;
isso fica documentado como limitação. Teste obrigatório de fronteira (ex.:
02:00 UTC = 23:00 do dia anterior em SP).

## 22. `notes`

Texto opcional, trim, até 2000 caracteres (notas operacionais, não documentos).
Aviso fixo no formulário: "Não registre senhas, códigos de transferência (EPP),
tokens ou chaves aqui." **Recomendo não copiar o conteúdo de `notes` para
`audit.log` nem para `activity_events`** — só registrar que o campo mudou. Se
alguém colar um segredo por engano, ele fica apenas na linha do domínio (onde
pode ser apagado), e não perpetuado na trilha de auditoria. Diferente da regra
de `clients.notes`, justificado pela proximidade do módulo com credenciais.
Sem heurística de bloqueio automático (falsos positivos). Decisão D13.

## 23. Segurança de credenciais

O módulo **não armazena**: senhas (registrador/e-mail), EPP/Auth Code, API
keys, tokens, secrets, chaves privadas, recovery codes, cookies ou credenciais
de qualquer tipo — em nenhuma coluna, evento ou auditoria. **Não proponho
`credential_reference` na V1**: `docs/seguranca.md §5` já reserva a
arquitetura correta (Cofre com Supabase Vault e `vault_secret_id`, revelação
auditada). Quando o Cofre existir, a ligação domínio ↔ credencial deve ser feita
por ele — não por texto livre, que convidaria a colar o próprio segredo.

## 24. Responsável (`owner_user_id`)

**Recomendo incluir, opcional** ("Responsável pela renovação"). O risco central
do módulo é "ninguém renovou"; saber quem responde por isso é o dado operacional
mais valioso depois do vencimento. Reaproveita exatamente o padrão existente:
FK composta `(org_id, owner_user_id) → memberships(org_id, user_id)`, validação
de membership/usuário ativos só na atribuição/troca (trigger com `FOR SHARE`),
responsável desativado depois permanece como histórico. Adiciona filtro
"Responsável / Sem responsável" e o evento `domain.owner_changed`. Não cria
nenhuma semântica de `scope = assigned` (§56). Decisão D10.

## 25. Version

Sim — mesmo contrato de Clientes/Projetos/Suporte: default 1, trigger exige
avanço exato de +1, versão inicial 1.

## 26. Concorrência

`UPDATE ... WHERE org_id = ? AND id = ? AND version = ?`, lock da linha na
transação, zero linhas → `conflict` com "Este domínio foi atualizado por outro
usuário. Atualize a página antes de salvar novamente." Versão desatualizada
sempre é conflito, mesmo em no-op. No-op real não escreve, não gera evento nem
auditoria.

## 27. Exclusão / inativação

Sem `DELETE` (nenhum grant de DELETE, nem para `service_role`), sem soft-delete.
`inactive` preserva o histórico e pode ser revertido (§18, §13). Confirmação
obrigatória na UI para inativar.

## 28. Transferência

`transferring` é útil como marcador operacional barato (evita que um domínio em
transferência pareça esquecido). **Sem workflow**, sem EPP, sem integração com
registrador, sem prazos automáticos. Se não fizer sentido operacional para a
Atlaz, pode ser cortado sem impacto no restante (D11).

## 29. Project masking

Mesmo princípio aprovado no Suporte (Opção A), com as correções do §6: o
domínio continua acessível sem `project:read`; `projectId`/`projectName` são
nulados no serviço, `hasProject` sinaliza o vínculo; UI mostra "Projeto
vinculado" sem nome/ID/link. **Além disso** (não coberto no Suporte): seletor,
busca e filtro de Projeto indisponíveis e negados no serviço sem
`project:read`, e o `project_id` existente é preservado quando esse usuário edita
outros campos. Teste de payload/HTML serializado obrigatório.

## 30. `activity_events`

Kinds propostos (mutações reais apenas):

```
domain.created
domain.updated              (registrador, data de registro, observações — sem conteúdo)
domain.status_changed       (ativo/transferência/inativo, inclusive reativação)
domain.project_changed      (payload só com IDs antes/depois)
domain.expiration_changed   (registro de renovação = nova data; before/after DATE)
domain.auto_renew_changed   (tri-estado before/after)
domain.owner_changed        (se D10 for aprovada)
```

Nenhum evento diário/temporal ("faltam 30 dias"). `entity_type = 'domain'`,
`payload.clientId` só como contexto (nunca autoridade). Evento + auditoria na
mesma transação da mutação.

## 31. Audit

`audit.log` existente, sem tabela nova: `domain.create`, `domain.update`.
`before`/`after` por allowlist (nunca linha crua), **sem o texto de `notes`**
(só `notesChanged`, D13) e sem nenhum segredo. `context` com `clientId` e
versões.

## 32. RLS

`domains_select` (SELECT para `authenticated`): org da sessão +
`domain:read` + `client:read` + usuário ativo + membership ativa com `scope =
'org'` + Cliente pai existente — **sem** `project:read` (mesmo desenho de
`support_tickets_select`). Grants: `REVOKE ALL` de PUBLIC/anon/authenticated/
service_role; `SELECT` para `authenticated`; `SELECT, INSERT, UPDATE` para
`service_role`; **sem DELETE**.

`activity_select` recebe o **quarto ramo** por substituição única (DROP +
CREATE, nunca policy adicional):

```sql
OR (entity_type = 'domain' AND EXISTS (
  SELECT 1 FROM public.domains d
  WHERE d.org_id = activity_events.org_id AND d.id = activity_events.entity_id
))
OR entity_type NOT IN ('client', 'project', 'ticket', 'domain')
```

Ramos `client`/`project`/`ticket` copiados byte a byte. **Atenção:** enquanto a
0006 não existir, a cláusula de fallback atual deixa qualquer evento
`entity_type='domain'` visível para qualquer membro da org via REST — produtores
só podem ir a produção depois da migration (mesma disciplina das etapas
anteriores).

## 33. BYPASSRLS

Sem mudança de princípio: conexão Drizzle com BYPASSRLS; autorização
(`authorizeDomainSession`) **antes** de qualquer query; `orgId` explícito em
toda query, join e contagem; nenhuma função `getDomain(id)` sem org; joins de
cliente/projeto/responsável sempre com `org_id` explícito.

## 34. Listagem `/dominios`

Server Component; tabela ≥ `lg`, cards abaixo. Colunas: **Domínio** (Unicode),
**Cliente**, **Projeto** (mascarado), **Registrador**, **Status**,
**Vencimento** (data + badge de situação), **Renovação automática**,
**Responsável** (se D10), **Atualizado em**, Ações (Ver/Editar). Ordenação
padrão: **vencimento mais próximo primeiro** (é a pergunta operacional do
módulo); alternativas: nome A–Z, atualizados, criados; desempate sempre por
`id`.

## 35. KPIs locais

Quatro, numa única query agregada, todos excluindo `inactive`:

- **Ativos** — `status = 'active'`
- **Vencem em até 30 dias** — `0 ≤ dias ≤ 30`
- **Vencem em até 7 dias** — `0 ≤ dias ≤ 7` (subconjunto do anterior; rótulo
  "até" deixa isso claro)
- **Vencidos** — `dias < 0`

"Renovação automática desativada/não informada" fica como filtro, não KPI.

## 36. Busca

Server-side, `ILIKE` parametrizado com escape de `%`/`_` (padrão existente):
`domain_name` (termo que parece domínio passa pela mesma normalização/punycode),
nome do Cliente, `registrador`, e nome do Projeto **somente quando o usuário tem
`project:read`** — caso contrário a busca por nome de projeto funcionaria como
oráculo (ver R1).

## 37. Filtros

Seis, sem excessos: Cliente (seletor paginado); Projeto (só com Cliente
escolhido **e** `project:read`); Status (padrão: Ativos + Em transferência);
Vencimento (§20); Renovação automática (configurada / desativada / não
informada); Responsável + "Sem responsável" (se D10). Mesmos predicados em
listagem, contagem e KPIs; URL sincronizada; página resetada a cada mudança.

## 38. Paginação

25 por página, server-side, `?page=` normalizado (`0`, `-1`, `abc` → 1; acima
do total → última), componente `Pagination` existente.

## 39. Ficha do domínio

`/dominios/[id]`: cabeçalho com domínio (Unicode; ASCII ao lado se IDN), badge
de **status** e badge de **situação de vencimento** separados, ações (Editar,
Marcar em transferência / Concluir transferência, Inativar / Reativar). **Duas
abas** (mesmo critério de enxugamento do Suporte): **Visão geral** — cartões
"Renovação", "Vínculos" (Cliente/Projeto mascarado), "Registro" (registrador,
data de registro), "Observações" — e **Timeline**.

## 40. Renovação

Cartão com: data de vencimento, dias restantes ("Vence em 12 dias" / "Vence
hoje" / "Vencido há 4 dias"), situação (tom do §20), renovação automática
declarada, registrador e responsável. **Sem botão "Renovar"** — não há
integração. Registrar uma renovação = editar a data de vencimento (gera
`domain.expiration_changed`).

## 41. Integração com a Ficha Mestre do Cliente

A aba `dominios` deixa de ser placeholder: `listDomains({ clientId, page })`
chamado **somente** se `authorizeDomainSession(session, "read").ok` (checagem
antes do `await`); sem permissão → `Alert` genérico sem número/nome. CTA "Novo
domínio" (só com `domain:write`) → `/dominios/novo?cliente=<id>`, revalidado no
servidor. Cliente sem domínios → `EmptyState`.

## 42. Timeline consolidada do Cliente

Quarto ramo em `listClientTimeline`: `entity_type='domain'`, `INNER JOIN
domains` com `org_id` + `client_id` corretos, gated por `client:read +
domain:read` (`canReadDomains` via `can()`, sem consulta extra). Nova coluna
`domainName` na entrada; título na UI "Domínio example.com — Vencimento
alterado", reutilizando o tradutor do próprio módulo.

**Risco técnico (R3):** o repository hoje escolhe a combinação de fontes com
ternários (3 fontes = 4 combinações). Uma quarta fonte levaria a 8 combinações
nesse estilo. Recomendo, no Checkpoint B, montar a lista de fontes
dinamicamente e chamar `unionAll(...fontes)` — refatoração pequena, coberta
pelos 11 testes existentes de timeline consolidada, estendidos para as 16
combinações de permissão relevantes.

## 43. Integração futura com Projeto

**Adiar** para a integração final (mesma decisão do Suporte): aba de domínios na
Ficha do Projeto e eventos de domínio na timeline do Projeto ficam fora da V1.

## 44. Rotas

`/dominios`, `/dominios/novo` (`?cliente=` opcional, nunca autoridade),
`/dominios/[id]`, `/dominios/[id]/editar`, com `loading.tsx`/`error.tsx` no
segmento e `not-found.tsx` na ficha (404 idêntico para UUID inválido,
inexistente ou de outra org). Leitura via Server Components; Client Components
só para formulário, filtros, seletores e ações.

## 45. Migration futura

Journal confirmado: última entrada `idx 5`, `0005_support`. Próxima:
**`0006_domains.sql`** (não criada). Conteúdo proposto, numa entrega:
tabela `domains` com constraints/índices; `atlaz.validate_domain_write()`
(identidade imutável — `id`, `org_id`, `client_id`, `domain_name`,
`created_by`, `created_at` —, versão, validação do responsável); trigger de
`updated_at` reaproveitando `atlaz.set_updated_at()`; RLS/grants; substituição
de `activity_select` com o quarto ramo. **Nenhuma alteração em `projects`**
(a UNIQUE necessária já existe). Mesmo processo: preparar e testar em PGlite no
B; aplicar só no C1 após aprovação e preflight.

## 46. Arquivos previstos (a partir do B)

- `src/server/db/schema/domains.ts`; `0006_domains.sql` + snapshot.
- `src/lib/auth/domain-access.ts`.
- `src/lib/validation/domain.ts`, `domain-normalize.ts` (pipeline do §10);
  `src/lib/domains/activity.ts`, `format.ts` (situação/buckets/datas).
- `src/server/repositories/domain-repository.ts`,
  `domain-timeline-repository.ts`.
- `src/server/services/domain-service.ts`, `domain-events.ts`.
- `tests/helpers/domains.ts`; testes do §49.
- UI: `src/app/(app)/dominios/**`, `src/components/domains/**`.
- Alterações pontuais: `navigation.ts`, `client-timeline-repository.ts`
  (refatoração do §42), `client-service.ts`, `clientes/[id]/page.tsx`,
  `client-timeline.tsx`, `service-error.ts` (ex.: `invalid_domain`,
  `duplicate_domain`), `package.json` (`test:foundation`).

## 47. Riscos

- **R1 — Falha latente de mascaramento no Suporte publicado (achado desta
  auditoria).** Por leitura de código:
  1. `listTicketProjects`/`searchTicketProjectsAction` e `getTicketProject`
     (`ticket-service.ts:142–155`) exigem só `ticket:read`+`client:read` e
     devolvem **nome e status** de projetos — o seletor de Projeto aparece nos
     filtros de `/suporte` e no formulário para qualquer usuário de Suporte, e
     `/suporte?clientId=…&projectId=…` exibe o nome no filtro.
  2. A busca de `/suporte` compara `projects.name` sempre
     (`ticket-repository.ts:41`), permitindo inferir nomes de projeto por
     tentativa.
  3. **Desvínculo silencioso:** para quem não tem `project:read`, o formulário
     de edição nasce sem projeto selecionado (`ticket-form.tsx:57`), envia
     `projectId=""` e o serviço grava `project_id = NULL` ao salvar qualquer
     outra alteração, com o evento "Projeto desvinculado".
  4. Sem `project:read`, o usuário também consegue vincular um projeto na
     criação/edição.

  **Exposição real hoje: nenhuma conhecida.** Pelo snapshot de 15/09, todos os
  papéis com `ticket:read` (designer, dev, financeiro, socio) também têm
  `project:read`, e `super_admin` tem tudo. A falha fica ativa no instante em
  que um papel ganhar `ticket:read` sem `project:read` — justamente o cenário
  para o qual a Opção A foi aprovada. Os testes existentes cobrem só o payload
  de detalhe/listagem, não o seletor, a busca nem a edição. **Não corrigido
  (Checkpoint A não altera código).** Domínios não deve copiar esse padrão
  (§6/§29). Decisão D1.
- **R2 — Fallback de `activity_select`** expõe eventos `domain` a qualquer
  membro até a 0006 existir (§32): ordem obrigatória migration → produtores.
- **R3 — Refatoração da timeline consolidada** do Cliente (§42): toca um
  repository de Clientes em produção; mitigado por testes de todas as
  combinações.
- **R4 — Subdomínios** não são bloqueáveis estruturalmente sem PSL (§11).
- **R5 — Homógrafos IDN** (§12): mitigado exibindo a forma ASCII.
- **R6 — Grants `domain:*` desconhecidos** (§5): pode resultar em módulo
  invisível para papéis operacionais.
- **R7 — Datas declaradas:** vencimento e renovação automática são informados
  por pessoas, sem verificação RDAP; a UI precisa dizer isso.
- **R8 — Segredo colado em `notes`:** mitigado por aviso e por não replicar o
  conteúdo em auditoria/eventos (§22).
- **R9 — Fronteira de fuso** no dia do vencimento (§21): coberta por testes.
- Nenhuma vulnerabilidade de Domínios existe (não há código); R1 é o único
  achado sobre código publicado.

## 48. Decisões que precisam da sua aprovação

1. **D1 — R1 (Suporte):** abrir um "Suporte — Checkpoint D.3" de correção antes
   do Checkpoint B de Domínios (recomendado: o padrão corrigido vira a base dos
   dois módulos), ou depois, ou aceitar como risco latente documentado.
2. **D2 — Matriz de autorização do §6**, incluindo `project:read` como
   requisito para ver, escolher, trocar, buscar e filtrar Projeto.
3. **D3 — Subdomínios:** Opção 1 (estrutural + convenção + `www.` rejeitado,
   recomendada) ou Opção 2 (dependência PSL).
4. **D4 — IDN:** aceitar e armazenar punycode, exibindo Unicode + ASCII
   (recomendado), ou rejeitar não-ASCII na V1.
5. **D5 — Rigor da normalização (§10):** rejeitar caminho/query/porta/
   credenciais/`www.` com sugestão (recomendado) em vez de corrigir em silêncio.
6. **D6 — Unicidade:** única parcial excluindo `inactive` (recomendada) ou
   única total.
7. **D7 — `domain_name` imutável** após criação (erro de digitação → inativar
   e recadastrar).
8. **D8 — `expiration_date` NOT NULL** (recomendado) ou opcional com situação
   "não informado".
9. **D9 — `auto_renew` tri-estado** (`NULL`/true/false) e rótulos
   "configurada (informado)".
10. **D10 — `owner_user_id`** (responsável pela renovação) na V1.
11. **D11 — Status** `active`/`transferring`/`inactive` e as transições do §18
    (ou cortar `transferring`).
12. **D12 — Buckets:** filtros/KPIs cumulativos ("até X dias") e tons visuais
    em faixas exclusivas do §20.
13. **D13 — `notes`:** até 2000 caracteres, sem conteúdo em auditoria/eventos.
14. **D14 — `registration_date`** opcional: manter ou cortar.
15. **D15 — Escopo de telas:** ficha com duas abas; Ficha do Projeto e KPI no
    Dashboard adiados; ordenação padrão por vencimento.
16. **D16 — Preflight real:** autorizar a consulta somente leitura ao Supabase
    (grants `domain:*`/`client:read` por papel, eventos/auditoria `domain`,
    policy atual, ledger) — foi bloqueada nesta sessão; pode ser liberada nas
    permissões do Claude Code ou executada por você.

## 49. Plano de testes (para o B em diante)

- **Unit:** tabela completa do §10 (cada linha vira caso), UTS-46/punycode
  válido e inválido, limites de rótulo/total, `www.`; validação de datas e
  `registration ≤ expiration`; status e transições; buckets nas fronteiras
  (`-1, 0, 7, 8, 15, 16, 30, 31, 60, 61`); "hoje" em SP na virada UTC;
  `auto_renew` tri-estado; rótulos de UI.
- **Foundation:** schema e reconciliação Drizzle; CHECK de formato (inclusive
  rejeição de maiúsculas/ponto final direto no SQL); unicidade parcial
  (duplicado vivo rejeitado, recadastro após inativar aceito, reativação em
  conflito rejeitada); FK cliente, FK tripla (projeto de outro cliente/outra
  org rejeitado, `NULL` aceito); FK/trigger do responsável; imutabilidade
  (`client_id`, `domain_name`, `created_by`, `created_at`, `org_id`); versão;
  grants (sem DELETE para ninguém); RLS de `domains` e matriz dos **quatro**
  ramos de `activity_select` (preservação exata de client/project/ticket).
- **Service:** criar; editar; no-op; conflito de versão (inclusive no-op
  desatualizado); status e reativação; renovação (`expiration_changed`);
  vínculo/troca/remoção de projeto; transações com falha injetada em evento e
  auditoria; `notes` ausente de auditoria/eventos.
- **Security:** cross-org em todas as operações; sem `domain:read`; sem
  `client:read`; `assigned`; **sem `project:read`**: payload/HTML sem nome/ID,
  seletor negado, filtro/busca por projeto sem efeito, tentativa de
  vincular/trocar rejeitada, **edição de outros campos preserva `project_id`**;
  404 idêntico para inválido/inexistente/outra org.
- **Timeline:** eventos do domínio; consolidada do Cliente com todas as
  combinações de `project:read`/`ticket:read`/`domain:read`, paginação única de
  20, ordenação estável, sem órfãos/cross-org.
- **UI:** badges de status e situação, formulário (aviso de segredos,
  pré-visualização da normalização), aba do Cliente, masking visual,
  acessibilidade.

## 50. Escopo recomendado da V1

**Dentro:** tabela `domains` + migration 0006 (RLS, grants, quarto ramo de
eventos); authorization/validation/normalization (§10); repository/service com
version, transações, eventos e auditoria; listagem com 4 KPIs, busca, 6 filtros,
paginação e ordenação por vencimento; cadastro, edição, ficha (2 abas), ações de
status; situação de vencimento derivada; project masking completo (§6);
responsável (se D10); aba Domínios real e timeline consolidada na Ficha do
Cliente; navegação em OPERAÇÃO com `domain:read + client:read`; testes do §49.

**Fora da V1:** DNS, SSL, hospedagem/servidores (Infraestrutura), credenciais,
EPP/Auth Code, `credential_reference`, integração com registradores, RDAP/WHOIS
automático, botão "Renovar", workflow de transferência, notificações (e-mail,
Slack, push, cron, webhook), KPI no Dashboard, aba/timeline na Ficha do Projeto,
exclusão definitiva, tabela de registradores, PSL (salvo D3 = Opção 2).

---

**Checkpoint A encerrado.** Nenhum código, migration, alteração de banco,
commit, push ou deploy. Único arquivo criado: este relatório. Aguardando sua
aprovação — em especial das decisões D1–D16 do §48.
