# Vendoring note — OpenPlan3D (motor oficial do Planta 2D/3D)

Este diretório é uma cópia vendorizada (não submódulo) do editor paramétrico
2D/3D de planta baixa **OpenPlan3D**. Começou como PoC isolada e, após
validação (ver histórico do Git — `NOTA_POC_OPENPLAN3D.md`/
`RELATORIO_POC_OPENPLAN3D.md` da rodada de PoC), foi promovido a **motor
oficial do módulo Planta 2D/3D do Processo**, substituindo o Axonometra
(removido da HEAD; preservado no histórico do Git).

- **URL upstream:** https://github.com/laanlabs/openPlan3D (nome do pacote
  `open3dfloorplan`; há um fork/rename em `theLodgeBots/open3dFloorplan`
  referenciado no `package.json` do próprio upstream — `laanlabs/openPlan3D`
  é o repositório canônico, ativo, com 149 stars/60 forks/366 commits em
  `main` no momento da auditoria).
- **Commit pinado:** `511ff08f57526784c0bf3bc48466bfea04204bbc` (branch
  `main`, 2026-09-08).
- **Licença:** MIT (`LICENSE` neste diretório, preservado do upstream,
  copyright theLodgeStudio 2026 — sem divergência entre o `LICENSE` e o que o
  `README.md`/`package.json` anunciam).
- **Modelos 3D:** fontes documentadas em `MODEL_SOURCES.md` (majoritariamente
  Kenney.nl, licença CC0) — não usados pelo módulo oficial (biblioteca de
  mobiliário fora de escopo até hoje).
- **Stack:** SvelteKit 2 + Svelte 5 + Three.js + TypeScript + Tailwind v4 +
  Vite 7 — bem diferente do stack do app principal (Next.js/React), por isso
  vendorizado e buildado como app estático separado, servido same-origin.

## Integração com o BuildSmart

`components/processo/planta-baixa/PlantaEditor.tsx` embute a raiz do runtime
compilado (`public/labs/openplan3d-runtime/`) num iframe same-origin e fala
o protocolo `bs:*` implementado em `src/lib/services/bridge.ts`:
`bs:ready` (mount) → `bs:load` (o BuildSmart manda o projeto, lido de
`plantas.plan_json`) → ... edição ... → `bs:request-save` (BuildSmart pede) →
`bs:save` (o editor devolve o JSON do projeto atual). Supabase é a fonte
canônica: com `?embed=1` na URL, o editor nunca lê do IndexedDB/localStorage
próprio (`src/lib/stores/saveStatus.ts` neutraliza esse caminho) — só grava o
que vier explicitamente por `bs:save`.

A camada de interação (barra "Selecionar · Parede · Porta · Janela · 2D/3D ·
Mais", status de reforma Existente/Construir/Demolir como propriedade da
parede) vive em `src/lib/components/buildsmart/BuildSmartBar.svelte` e
`src/lib/utils/wallStatus.ts` — aciona as ferramentas nativas do motor, não
reimplementa geometria.

## Sem dependência do upstream em runtime

O upstream é hospedado em produção como app Firebase (SSR, Firebase Hosting +
Analytics + um endpoint de "handoff" do app iOS que lê/escreve num bucket do
Firebase Storage do projeto `openplan3d`). Nesta vendorização:

- **Analytics desligado.** `src/routes/+layout.svelte` só importa
  `$lib/firebase` (que inicializa o Firebase Analytics do projeto do
  upstream) quando `env.PUBLIC_ENABLE_ANALYTICS !== 'false'` — o próprio
  upstream já previu esse interruptor para instâncias self-hosted. O build
  vendorizado (`scripts/build-openplan3d.mjs` na raiz do repo) passa
  `PUBLIC_ENABLE_ANALYTICS=false`, então o SDK do Firebase nunca é carregado
  e nenhum evento é enviado ao projeto Firebase do upstream.
- **Adapter trocado de `adapter-node` para `adapter-static`** (SPA, com
  `fallback: 'index.html'`) — o upstream roda como servidor Node com SSR
  (Firebase App Hosting); a integração precisa de um bundle 100% estático
  para servir de `public/labs/openplan3d-runtime/` como asset do Next.js.
  Isso desativa a única rota de servidor real do projeto,
  `src/routes/api/handoffs/+server.ts` (import de scan do app iOS via
  Firebase Storage) — não usada pelo módulo oficial.
- **Um ponto residual não neutralizado:** `src/routes/editor/+page.svelte`
  monta uma URL fixa para `firebasestorage.googleapis.com/.../openplan3d...`
  para o fluxo manual de "importar por código de handoff" (usuário digita um
  código de 4 dígitos vindo do app iOS). Esse fluxo não é exposto nem testado
  pelo módulo oficial e só faria uma requisição de rede se um usuário
  manualmente digitasse um código no `?import=` da URL do runtime (não
  alcançável pela UI do BuildSmart) — risco residual aceito, registrado aqui
  para uma futura rodada que deveria removê-lo ou apontar para
  infraestrutura própria antes de qualquer uso real desse fluxo.
- Fora do bridge (app aberto standalone, sem `?embed=1`), save/load usa
  `localStorage`/IndexedDB do próprio navegador
  (`src/lib/services/datastore.ts` e `localDatabase.ts`) — só relevante para
  quem roda `vendor/openplan3d` isoladamente (dev/teste); o módulo oficial no
  Processo nunca cai nesse caminho.

## Diferenças em relação ao upstream

Extensão mínima de configuração de build, mais o bridge/interação BuildSmart
descritos acima — **nenhuma linha de lógica geométrica de domínio
(paredes/portas/janelas/ambientes/3D) foi alterada**; a barra e o status de
reforma acionam as ferramentas nativas do motor (`addWall`, `setWallStatus`,
`resizeWallLength`, etc.), não reimplementam nada:

- `svelte.config.js`: `adapter-node` → `adapter-static` com
  `fallback: 'index.html'` e `paths.base` vindo de `OPENPLAN3D_BASE_PATH`
  (`/labs/openplan3d-runtime` — ver `scripts/build-openplan3d.mjs`; nome
  legado da rodada de PoC, mantido para não recompilar o `base` sem ganho
  funcional).
- `package.json`: adicionado `@sveltejs/adapter-static` como devDependency.
- `src/lib/models/types.ts`: campo opcional `Wall.status` (estado de
  reforma) — ausente equivale a `EXISTENTE`.
- `src/lib/services/bridge.ts`, `src/lib/stores/embed.ts` (novos): protocolo
  `bs:*` descrito acima.
- `src/lib/components/buildsmart/BuildSmartBar.svelte` (novo) e ajustes
  pontuais em `PropertiesPanel.svelte`/`FloorPlanCanvas.svelte`/
  `canvasRenderer.ts`/`ThreeViewer.svelte` para expor a barra e o status de
  reforma reaproveitando os caminhos existentes de seleção/render/material.

## Não atualizar automaticamente

Se uma versão futura do upstream for necessária, repetir esta auditoria
completa (licença + modelos + dependências de runtime) antes de
re-vendorizar.
