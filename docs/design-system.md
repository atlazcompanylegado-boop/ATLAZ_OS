# Design System — ATLΛZ OS

Tradução da identidade visual da Atlaz Company (Atlas sustentando o mundo, dissolução em partículas, composição editorial, espaço negativo, monocromia + vermelho de assinatura) em tokens e componentes reutilizáveis. Fonte de verdade em código: `src/design-system/tokens.ts` e `src/app/globals.css` (CSS variables). Este documento explica as decisões; os valores exatos vivem no código.

## 1. Tema

Modo principal: **Dark Premium**. Áreas institucionais (ex.: tela de login, splash) podem usar a variante off-white. Ambas as paletas são tokens — nunca cor "hardcoded" em componente.

## 2. Cor

```
--surface-0   #0A0A0B   fundo mais profundo (app shell)
--surface-1   #131315   fundo de painel/sidebar
--surface-2   #1B1B1E   card
--surface-3   #242427   card elevado / hover
--border      #2A2A2E   linha fina padrão
--border-strong #38383D borda em foco/ativo

--ink-1       #F5F5F4   texto primário (off-white, não branco puro)
--ink-2       #A8A8AC   texto secundário
--ink-3       #6E6E73   texto terciário / placeholder

--accent      #8A1522   vermelho Atlaz (carmim/vinho — assinatura, não decoração)
--accent-strong #A31D2C  hover/active do accent
--accent-muted rgba(138,21,34,.14)  fundo sutil (badge, seleção)

--success #2E7D5B   --warning #B8862E   --danger #C23B3B
```

Regra de uso do vermelho: **um ponto de ênfase por composição** — item ativo da sidebar, CTA primário, alerta crítico, marca. Nunca vermelho em área grande de fundo nem em mais de ~10% da tela.

Variante institucional (off-white): inverte `surface`/`ink`, mantém `accent` idêntico.

## 3. Tipografia

Duas famílias, papéis distintos — nunca misturadas na mesma densidade de informação:

- **Inter** — interface: menus, tabelas, inputs, dashboards, dados. Pesos 400/500/600.
- **Fraunces** — branding editorial: tela de login, títulos hero, frases institucionais, splash. Peso 400/500, sempre em blocos curtos (título, não parágrafo).

Escala (`text-*` no Tailwind mapeado para estes tokens):

```
display   Fraunces  40–56px   uso: hero/login
h1        Inter 600 28px
h2        Inter 600 22px
h3        Inter 600 17px
body      Inter 400 14px
small     Inter 400 12.5px
label     Inter 500 12px, tracking +0.02em, uppercase opcional (seções da sidebar)
```

## 4. Espaço, grid, radius

- Unidade base: `4px`. Escala: 4/8/12/16/24/32/48/64.
- Espaço negativo é deliberado: padding de card mínimo `24px`; nunca "grudar" cards.
- Radius: `--radius-sm 6px` (inputs, badges), `--radius-md 10px` (cards), `--radius-lg 16px` (modais, painéis grandes). Sem cantos totalmente retos nem excesso de arredondamento (nada de pill em botão padrão).
- Grid de conteúdo: max-width 1440px, colunas 12, gutter 24px.

## 5. Linhas finas e bordas

`--border` (1px, `border-color: var(--border)`) é o divisor padrão — nunca `box-shadow` pesado para separar seções. Títulos de seção podem ganhar uma linha fina abaixo (`border-bottom: 1px solid var(--border)`). Tabelas usam linha horizontal fina entre linhas, sem grade vertical.

## 6. Sombra e elevação

Sombras discretas, quase imperceptíveis (não "material design" flutuante):

```
--shadow-sm  0 1px 2px rgba(0,0,0,.4)
--shadow-md  0 4px 16px rgba(0,0,0,.45)
--shadow-lg  0 12px 40px rgba(0,0,0,.55)   (modal/drawer)
```

## 7. Motion

- Duração padrão `160ms`, easing `cubic-bezier(.4,0,.2,1)`.
- Hover: opacidade/cor, nunca escala agressiva.
- Loading: skeleton (shimmer sutil) — não spinner piscante.
- Sem parallax pesado, sem partículas animadas em telas operacionais densas (tabelas, formulários).

## 8. Motivo gráfico: Atlas e partículas

Elemento de marca, não decoração onipresente. Implementado como componentes SVG/canvas leves em `src/components/brand/`:

- `AtlasMark` — símbolo/wordmark, usado em login, splash, sidebar (colapsada).
- `ParticleField` — campo de partículas discreto (baixa densidade, opacidade ≤ 0.15, estático ou com deriva muito lenta), usado em: fundo do login, empty states, header do módulo de Marketing/Atlas Social/Atlas Studio/Atlas Intelligence, tela de loading inicial.
- `OrbitLines` — arcos/linhas orbitais finas para divisores especiais, cabeçalho de gráfico, cards de IA.

Regra dura: em telas operacionais (tabelas, formulários, listas densas) esses elementos **não aparecem** ou aparecem em opacidade mínima só como textura de fundo, nunca sobre texto.

## 9. Iconografia

`lucide-react`, traço fino (`strokeWidth={1.5}`), tamanho padrão 18/20px no menu, 16px em contexto denso. Nunca emoji como ícone funcional.

## 10. Componentes (inventário Fase 0)

Construídos em `src/components/ui/`, cada um com variantes via CVA e tokens acima — nenhum CSS ad-hoc por página.

Fase 0 entrega: `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Card`, `KpiCard`, `Badge`, `Avatar`, `Tabs`, `Table`, `Tooltip`, `Dropdown (Menu)`, `Modal (Dialog)`, `Drawer`, `Toast`, `Alert`, `EmptyState`, `Skeleton`, `Breadcrumb`, `Search`.

Adiado para quando o módulo que precisa existir (evita componente sem uso real): `DatePicker`, `Upload`, `ConfirmDialog` avançado (Fase 0 usa `Modal` genérico para confirmação).

## 11. Sidebar e Topbar

Ver `docs/arquitetura.md` para estrutura de rotas. Especificação visual:

**Sidebar**: fundo `--surface-1`, 264px expandida / 72px recolhida, agrupada por seção (VISÃO, OPERAÇÃO, COMERCIAL, GESTÃO, MARKETING, INTELLIGENCE, SEGURANÇA, SISTEMA) com label pequeno (`label` token) acima de cada grupo. Item ativo: barra vertical `--accent` de 2px à esquerda + texto `--ink-1`; inativo `--ink-2`. Sem emoji, ícone lucide 18px antes do texto.

**Topbar**: 56px de altura, `--surface-0`, borda inferior fina. Da esquerda para a direita: breadcrumb, busca global (atalho `⌘K`/`Ctrl K`), notificações, seletor de contexto (organização/ambiente), avatar do usuário.

## 12. Breakpoints

```
sm 640  md 768  lg 1024  xl 1280  2xl 1536
```

Prioridade de desenho: 1440/1920 (desktop), 1366 (notebook comum), 768 (tablet). Mobile permanece funcional (stack vertical, sidebar vira drawer) mas não é o alvo principal.
