# Roadmap — ATLΛZ OS

Referência completa do pedido original em `docs/` (arquitetura, design-system, banco, segurança). Este arquivo rastreia fase, escopo e critério de saída.

## Fase 0 — Fundação (em andamento)

**Entrega:** projeto instalável, arquitetura definida, banco conectado, auth funcionando, design system base, shell (sidebar+topbar), login, dashboard vazio (sem dado fake).

**Critério de saída (todos obrigatórios):**
- [ ] dependências instaladas sem erro (`npm install`)
- [ ] projeto roda localmente (`npm run dev`)
- [ ] login funcionando contra Supabase Auth real
- [ ] banco conectado (`DATABASE_URL` válido)
- [ ] migrations aplicadas (0001–0004, ver `docs/banco.md`)
- [ ] seed aplicado (organização Atlaz Company + bootstrap do super admin)
- [ ] `npm run lint` verde
- [ ] `npm run typecheck` verde
- [ ] `npm run test` verde
- [ ] `npm run build` verde
- [ ] dashboard carrega (mesmo com empty states, sem dado fabricado)
- [ ] RLS validado manualmente (usuário sem membership não enxerga nada)
- [ ] super admin validado (login real acessa Equipe/Configurações)
- [ ] `.env.local` fora do git e fora do sync do OneDrive; `.env.example` sem valor real

Não se avança para a Fase 1 com algum item acima pendente.

## Fase 1 — Operação
Clientes (Ficha Mestre completa: visão geral, projetos, infraestrutura, domínios, e-mails, financeiro, contratos, chamados, documentos, timeline, acessos), Projetos, Timeline automática, Domínios, Infraestrutura, Suporte.

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

## Riscos conhecidos (Fase 0)

- **`drizzle-kit` carrega uma versão antiga de `esbuild` (moderada, GHSA-67mh-4wv8-2f99)** por uma dependência transitiva (`@esbuild-kit/*`) que ainda não foi atualizada upstream. Afeta só a CLI de migration em uso local (nunca o app publicado); `npm audit` sugere downgrade do `drizzle-kit`, o que pioraria a situação — decisão consciente de aceitar o risco e revisar quando a dependência for corrigida upstream.
- **Marca "Atlas segurando o mundo"** (`src/components/brand/atlas-mark.tsx`) é um placeholder geométrico, não o logotipo real da Atlaz Company. Trocar pelos arquivos oficiais assim que o Brand Kit (Fase 3, §42) receber os assets — ou antes, se o usuário fornecer os arquivos.
- **Projeto vive dentro do OneDrive** (`C:\Users\ponte\OneDrive\Desktop\Legado Atlaz OS`, não `F:\Legado Atlaz OS` como pedido originalmente — essa pasta não existe neste computador). Ver README.md para a exclusão recomendada de `node_modules`/`.next` da sincronização.

## Relatório de fase

Ao final de cada fase, relatório com: arquivos criados/alterados, migrations, tabelas, endpoints/actions, componentes, dependências adicionadas, testes, riscos e pendências, próximos passos — conforme item 70 do escopo original.
