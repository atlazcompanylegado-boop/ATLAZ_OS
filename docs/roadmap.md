# Roadmap — ATLΛZ OS

Referência completa do pedido original em `docs/` (arquitetura, design-system, banco, segurança). Este arquivo rastreia fase, escopo e critério de saída.

## Fase 0 — Fundação (em andamento)

**Entrega:** projeto instalável, arquitetura definida, banco conectado, auth funcionando, design system base, shell (sidebar+topbar), login, dashboard vazio (sem dado fake).

**Critério de saída (todos obrigatórios):**
- [x] dependências instaladas sem erro (`npm install`; `npm run dev` já era usado pelos checkpoints anteriores)
- [x] projeto roda localmente (`npm run dev`; usado para o QA visual real do Checkpoint 3)
- [x] login funcionando contra Supabase Auth real (login real observado no Checkpoint 3, sessão de super admin)
- [x] banco conectado (`DATABASE_URL` válido; verificado no Checkpoint 1 de Clientes)
- [x] migrations aplicadas (0000–0003; hashes anteriores conferidos, ver `docs/banco.md`)
- [ ] seed aplicado (organização Atlaz Company + bootstrap do super admin) — já existia antes deste checkpoint, não reexecutado
- [x] lint verde (ESLint sem cache, reconfirmado no Checkpoint 3)
- [x] typecheck verde (`tsc --noEmit`, reconfirmado no Checkpoint 3)
- [x] testes verdes (152 testes no Checkpoint 3, ver `docs/clientes-checkpoint-3.md`)
- [x] `npm run build` verde (Checkpoint 3)
- [x] dashboard carrega (mesmo com empty states, sem dado fabricado; KPI de Clientes agora real, ver `docs/clientes-checkpoint-3.md`)
- [x] RLS com login real sem membership: verificado no Checkpoint 3 contra o Postgres real (não a fixture em memória) — perfil próprio visível, nenhum dado operacional; ver `docs/clientes-checkpoint-3.md` §K para o método e o limite exato do teste
- [ ] super admin validado (login real acessa Equipe/Configurações) — login e Clientes validados no Checkpoint 3; Equipe/Configurações não reexercitadas nesta sessão
- [ ] `.env.local` fora do git e fora do sync do OneDrive; `.env.example` sem valor real

O usuário aprovou o início controlado de Clientes em checkpoints. O teste de RLS real do Checkpoint 3 usa o Postgres de produção configurado (não a fixture em memória), mas simula a claim JWT em vez de um login GoTrue completo — ver `docs/clientes-checkpoint-3.md` para o escopo exato dessa verificação.

## Fase 1 — Operação
Clientes (Ficha Mestre completa: visão geral, projetos, infraestrutura, domínios, e-mails, financeiro, contratos, chamados, documentos, timeline, acessos), Projetos, Timeline automática, Domínios, Infraestrutura, Suporte.

**Clientes — concluído (Checkpoints 1–3), demais módulos da Fase 1 pendentes.**
Sessão/autorização, migrations, repository/service, validação, listagem, cadastro,
Ficha Mestre, contatos, timeline, edição/concorrência, navegação, integração com o
Dashboard e QA (segurança, responsividade, build) entregues e testados (152 testes).
Projetos, Suporte, Domínios e Infraestrutura continuam como abas placeholder
honestas na Ficha Mestre — **a Fase 1 como um todo não está concluída.**
Ver [Checkpoint 1](clientes-checkpoint-1.md), [Checkpoint 2](clientes-checkpoint-2.md)
e [Checkpoint 3](clientes-checkpoint-3.md) para o histórico completo.

Aprovado pelo usuário para fechamento (commit/push/deploy) após o Checkpoint 3.

### Continuidade — Projetos (15/09/2026)

[Checkpoint A — auditoria e proposta](projetos-checkpoint-a.md),
[B — fundação](projetos-checkpoint-b.md),
[C1 — migration 0004 aplicada e validada em produção](projetos-checkpoint-c1.md) e
[C2 — UI, integração com a Ficha Mestre do Cliente e navegação](projetos-checkpoint-c2.md)
aprovados. [Checkpoint D — QA técnico final](projetos-checkpoint-d.md) concluído:
lint/typecheck/testes/foundation/build verdes, navegação/segurança/regressão de
Clientes revalidadas, dois bugs de UI corrigidos (filtros de prioridade/vencidos
ausentes; `aria-label` da sidebar). O gap identificado em D (timeline da Ficha
Mestre do Cliente sem eventos de Projetos, frente ao Checkpoint A §21) foi
corrigido no [Checkpoint D.1](projetos-checkpoint-d1.md): consolidação por
`UNION ALL` na leitura, autorização correta (`client:read`+`project:read`),
org/cliente isolados por join explícito, sem N+1, 10 testes novos (318+1 no
total). **Publicado em produção em 16/09/2026** (commit `82539d2`, deploy
Render `dep-dakub567bikc73dn9hj0`, smoke test não destrutivo aprovado — ver
[Checkpoint D.2](projetos-checkpoint-d2.md)), com o QA visual autenticado
aceito como pendência conhecida (ambiente sem sessão disponível para testá-lo).
**Projetos está concluído e publicado.**

### Continuidade — Suporte (16/09/2026)

[Checkpoint A — auditoria e proposta](suporte-checkpoint-a.md),
[B — fundação](suporte-checkpoint-b.md),
[C1 — migration 0005 aplicada e validada em produção](suporte-checkpoint-c1.md) e
[C2 — UI, integração com a Ficha Mestre do Cliente e navegação](suporte-checkpoint-c2.md)
aprovados. [Checkpoint C2.1 — correção visual da Timeline consolidada do
Cliente](suporte-checkpoint-c2-1.md) fechou a lacuna de tradução dos eventos
de Suporte nessa timeline (reutilizando o tradutor já existente de Suporte,
sem tocar fundação). [Checkpoint D — QA final](suporte-checkpoint-d.md)
concluído: regressão completa de Clientes/Projetos, segurança (cross-org,
project masking, BYPASSRLS, N+1), acessibilidade/responsividade estruturais,
1 bug visual isolado corrigido (formatação de data/hora inconsistente na aba
Suporte da Ficha do Cliente). Lint/typecheck/testes (500+2)/foundation
(343)/build verdes. **Suporte está tecnicamente pronto — implementação
concluída localmente, aguardando publicação** (QA visual autenticado
permanece pendente por falta de sessão disponível nesta sessão, mesma
ressalva já registrada para Clientes/Projetos).

Ordem de trabalho: Suporte (aguardando decisão de publicação) → Domínios →
Infraestrutura → integração final/timeline → Dashboard operacional → QA da
Fase 1. Parada obrigatória após cada etapa. Clientes e Projetos permanecem
concluídos, sem regressão. **A Fase 1 como um todo continua em aberto** —
Domínios e Infraestrutura ainda não foram implementados.

## Fase 2 — Comercial / Gestão
CRM (lead → fechado/perdido), Propostas (com conversão proposta aprovada → cliente/projeto), Contratos, Financeiro (contas a pagar/receber, MRR, recorrência), motor de Alertas (vencimento de domínio/contrato, inadimplência, chamado parado).

## Fase 3 — Marketing
Marketing (dashboard, campanhas), Atlas Social (ideia → roteiro → produção → edição → revisão → programado → publicado), Calendário Editorial, Banco de Ideias, Brand Kit, Biblioteca de Mídia.

## Fase 4 — Studio
Atlas Studio: editor de imagem (upload, crop, resize, texto, marca d'água, presets 1080×1350/1080×1920/1080×1080/16:9). Arquitetura preparada (sem implementar worker) para editor de vídeo — fila de jobs e FFmpeg entram só quando esta fase for aberta.

## Fase 5 — Intelligence
Atlas Intelligence: geração assistida de tema/hook/roteiro/legenda/CTA a partir do histórico de conteúdo; recomendações estendendo para CRM, projetos, suporte, financeiro e alertas.

## Fase 6 — Integrações
GitHub (commits/PRs/issues via adapter), Vercel/Render/Cloudflare (status de deploy), Instagram (analytics + conexão com CRM/leads), WhatsApp, Google Workspace.

## Dependências entre fases

- Fase 2 (Propostas → Cliente) depende do modelo de Cliente da Fase 1.
- Fase 3 (Analytics ligando Reels → Leads) depende do CRM da Fase 2.
- Fase 5 (Intelligence) depende de volume real de conteúdo/dados das Fases 1–3 para ser útil — não adianta adiantar.
- Fase 6 (GitHub/Deploy) pode começar a estrutura de dados (campos de repositório/branch em Projetos) já na Fase 1, mas a integração viva (webhooks, chamadas reais) só entra na Fase 6.

## Decisão: adoção do schema herdado

O projeto Supabase configurado para o ATLΛZ OS já continha um schema RBAC completo de uma sessão anterior de trabalho na "F:\atlaz company" (org, papéis, 41 permissões granulares, RLS, funções `atlaz.*`) — avaliado e adotado como base em vez de recriado do zero, por ser mais alinhado ao pedido de "permissões granulares" (item 36 do escopo) do que a versão simplificada com enum fixo construída inicialmente. Ver docs/banco.md §1 para o inventário completo do que foi herdado.

## Riscos conhecidos (Fase 0)

- **`drizzle-kit` carrega uma versão antiga de `esbuild` (moderada, GHSA-67mh-4wv8-2f99)** por uma dependência transitiva (`@esbuild-kit/*`) que ainda não foi atualizada upstream. Afeta só a CLI de migration em uso local (nunca o app publicado); `npm audit` sugere downgrade do `drizzle-kit`, o que pioraria a situação — decisão consciente de aceitar o risco e revisar quando a dependência for corrigida upstream.
- **Marca "Atlas segurando o mundo"** (`src/components/brand/atlas-mark.tsx`) é um placeholder geométrico, não o logotipo real da Atlaz Company. Trocar pelos arquivos oficiais assim que o Brand Kit (Fase 3, §42) receber os assets — ou antes, se o usuário fornecer os arquivos.
- **Projeto vive dentro do OneDrive** (`C:\Users\ponte\OneDrive\Desktop\Legado Atlaz OS`, não `F:\Legado Atlaz OS` como pedido originalmente — essa pasta não existe neste computador). Ver README.md para a exclusão recomendada de `node_modules`/`.next` da sincronização.

## Relatório de fase

Ao final de cada fase, relatório com: arquivos criados/alterados, migrations, tabelas, endpoints/actions, componentes, dependências adicionadas, testes, riscos e pendências, próximos passos — conforme item 70 do escopo original.
