# Vendoring note — PoC OpenPlan3D (`/labs/openplan3d`)

Este diretório é uma cópia vendorizada (não submódulo) do editor paramétrico
2D/3D de planta baixa **OpenPlan3D**, incorporada ao BuildSmart **apenas como
prova de conceito isolada** — ver `NOTA_POC_OPENPLAN3D.md` na raiz do repo
para o objetivo, escopo e critérios de PASS/FAIL desta rodada.

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
  Kenney.nl, licença CC0) — não auditado item a item nesta rodada porque a
  PoC não usa a biblioteca de mobiliário (fora de escopo, ver item 7 da nota
  de tarefa).
- **Stack:** SvelteKit 2 + Svelte 5 + Three.js + TypeScript + Tailwind v4 +
  Vite 7 — bem diferente do stack do app principal (Next.js/React), por isso
  vendorizado e buildado como app estático separado, no mesmo padrão já usado
  para `vendor/axonometra/` (ver `vendor/axonometra/VENDOR.md`).

## Sem dependência do upstream em runtime

O upstream é hospedado em produção como app Firebase (SSR, Firebase Hosting +
Analytics + um endpoint de "handoff" do app iOS que lê/escreve num bucket do
Firebase Storage do projeto `openplan3d`). Para a PoC:

- **Analytics desligado.** `src/routes/+layout.svelte` só importa
  `$lib/firebase` (que inicializa o Firebase Analytics do projeto do
  upstream) quando `env.PUBLIC_ENABLE_ANALYTICS !== 'false'` — o próprio
  upstream já previu esse interruptor para instâncias self-hosted. O build
  vendorizado (`scripts/build-openplan3d.mjs` na raiz do repo) passa
  `PUBLIC_ENABLE_ANALYTICS=false`, então o SDK do Firebase nunca é carregado
  e nenhum evento é enviado ao projeto Firebase do upstream.
- **Adapter trocado de `adapter-node` para `adapter-static`** (SPA, com
  `fallback: 'index.html'`) — o upstream roda como servidor Node com SSR
  (Firebase App Hosting); a PoC precisa de um bundle 100% estático para
  servir de `public/labs/openplan3d/` como asset do Next.js, igual ao padrão
  do Axonometra. Isso desativa a única rota de servidor real do projeto,
  `src/routes/api/handoffs/+server.ts` (import de scan do app iOS via
  Firebase Storage) — não usada por esta PoC.
- **Um ponto residual não neutralizado:** `src/routes/editor/+page.svelte`
  monta uma URL fixa para `firebasestorage.googleapis.com/.../openplan3d...`
  para o fluxo manual de "importar por código de handoff" (usuário digita um
  código de 4 dígitos vindo do app iOS). Esse fluxo não é exposto nem testado
  nesta PoC (não faz parte do escopo funcional pedido) e só faria uma
  requisição de rede se um usuário manualmente digitasse um código — é
  tratado como risco residual aceito para uma PoC isolada, não como
  dependência de runtime do fluxo principal. Registrado aqui para uma futura
  rodada de produção, que deveria removê-lo ou apontar para infraestrutura
  própria antes de qualquer uso real.
- Save/load usa `localStorage`/IndexedDB do próprio navegador
  (`src/lib/services/datastore.ts` e `localDatabase.ts`) — não depende de
  nenhum backend, nem do upstream nem do Supabase do BuildSmart.

## Diferenças em relação ao upstream (PoC)

Extensão mínima, só de configuração de build — **nenhuma linha de lógica de
domínio (paredes/portas/janelas/ambientes/3D) foi alterada**:

- `svelte.config.js`: `adapter-node` → `adapter-static` com
  `fallback: 'index.html'` e `paths.base = '/labs/openplan3d'` (para servir
  sob um subcaminho do Next.js).
- `package.json`: adicionado `@sveltejs/adapter-static` como devDependency.

## Não atualizar automaticamente

Se uma versão futura for necessária (fora do escopo desta PoC — ela não vira
produto sem uma rodada própria de decisão), repetir esta auditoria completa
(licença + modelos + dependências de runtime) antes de re-vendorizar.
