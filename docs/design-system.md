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

## 11. Sidebar e Topbar

Ver `docs/arquitetura.md` para estrutura de rotas. Especificação visual:

**Sidebar**: `.surface-elevation-1` (glass leve), 264px expandida / 72px recolhida, agrupada por seção (VISÃO, OPERAÇÃO, COMERCIAL, GESTÃO, MARKETING, INTELLIGENCE, SEGURANÇA, SISTEMA) com label pequeno (`label` token) acima de cada grupo. Item ativo (ver §13): barra `--accent` de 3px à esquerda + fundo `accent-muted` + borda `accent/20` + `shadow-glow` — três sinais, não só cor; inativo `--ink-2`. Sem emoji, ícone lucide 18px antes do texto.

**Topbar**: 56px de altura, `.surface-elevation-1` (glass leve), borda inferior fina. Da esquerda para a direita: (hambúrguer só <768px), breadcrumb, busca global (atalho `⌘K`/`Ctrl K`), notificações, seletor de contexto (organização/ambiente), avatar do usuário.

## 12. Breakpoints

```
sm 640  md 768  lg 1024  xl 1280  2xl 1536
```

Prioridade de desenho: 1440/1920 (desktop), 1366 (notebook comum), 768 (tablet). Mobile permanece funcional (stack vertical, sidebar vira drawer) mas não é o alvo principal.

## 13. Fase 1 — acabamento premium (glass, glow, elevação)

Camada aditiva sobre os tokens da Fase 0 (nenhum valor acima foi removido/renomeado). Objetivo: dar profundidade real ao shell sem recorrer a sombras pesadas ou vermelho decorativo. Tokens novos em `globals.css` `:root` + espelho em `src/design-system/tokens.ts` (`glass`, `glow`, `gradient`, `scrollbar`, `role`).

**Hierarquia de superfícies (elevação):**

```
Nível 0  background do app         surface-0 + .atlaz-ambient + silhueta do Atlas invertida (ver abaixo)
Nível 1  sidebar / topbar          .surface-elevation-1  (glass leve: --glass-bg + blur)
Nível 2  sections                  surface-2 (sem glass — só hierarquia de cor)
Nível 3  cards                     surface-2 + shadow-sm, hover eleva para shadow-md + glow
Nível 4  modal / dropdown / select /
         command palette / drawer  .surface-elevation-4  (glass forte: --glass-bg-strong + blur + shadow-lg)
```

**Regra dura do vermelho (glow/gradient-accent):** só aparece em estado de interação ou item realmente especial — hover de card, foco de input/busca, item ativo da sidebar, botão primário, badge de papel institucional. Nunca como decoração em repouso. `--glow-accent` e `--glow-accent-focus` existem exatamente para isso; não aplicar em estado `:not(:hover, :focus, [data-active])`.

**Badge — duas variantes novas, papéis diferentes:**
- `tag` — status/fase (“Fase 1”), compacta e discreta, nunca mais chamativa que o rótulo ao lado.
- `role` — cargo institucional (“SUPER ADMIN”), vermelho bem escuro/dessaturado (`--role-*`), não o accent vivo.

**Sidebar responsiva** (sem `matchMedia`, só breakpoints Tailwind — ver `sidebar.tsx`/`sidebar-nav.tsx`/`mobile-nav.tsx`):
- `<768px` (md): oculta, navegação em drawer (`MobileNav`, `Drawer` com `side="left"`).
- `768–1023px`: nasce compacta (72px) — único intervalo realmente apertado (tablet).
- `≥1024px` (lg): nasce expandida (264px) — cobre notebooks/desktops comuns sem forçar modo compacto. Toggle manual sempre sobrepõe o automático.

**Botão `loading`:** prop ortogonal à `variant` (`<Button loading>`), spinner (`Loader2`) substituindo o texto por um ícone ao lado, sem mudar largura; força `disabled` + `aria-busy`.

**Login — a imagem oficial é o plano de fundo, literalmente:** `src/components/brand/atlas-login-bg.png` é a arte original, inteira, sem recorte — ela já traz o wordmark "ATLAZ OS", então a UI não desenha um título por cima (seria duplicado). `object-contain` abaixo de `lg` (nada é cortado — como o fundo da página é o mesmo off-white da arte, a "sobra" do contain é invisível) e `object-cover` a partir de `lg` (proporção da arte ~16:9, já próxima da maioria das telas largas, corte mínimo). Formulário ancorado na metade inferior da composição, que é o espaço vazio da própria arte.

**Ambientação do shell (dashboard e demais telas dark) deriva da mesma arte, não de gradientes soltos:** `AmbientBackground` (`src/components/layout/ambient-background.tsx`) usa a própria `atlas-login-bg.png` — `filter: invert(1) grayscale(1)` + `mix-blend-mode: screen` + opacidade ~0.05 — para que a silhueta do Atlas apareça como um traço claro sangrando no canto inferior direito e o fundo claro da arte desapareça no escuro do app; `OrbitLines` reforça o mesmo motivo por cima, ainda mais apagado (~0.07). É essa combinação — não os dois radiais isolados de `.atlaz-ambient` — que faz o dashboard ler como "vindo" da mesma peça do login.

Adiado para quando o módulo que precisa existir (evita componente sem uso real): `DatePicker`, `Upload`, `ConfirmDialog` avançado (Fase 0 usa `Modal` genérico para confirmação).
