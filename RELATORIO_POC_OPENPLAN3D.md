# Relatório — PoC OpenPlan3D (`/labs/openplan3d`)

Ver `NOTA_POC_OPENPLAN3D.md` para proveniência, estratégia de embed e achados
de formato de dados. Este arquivo registra os testes executados e o
resultado PASS/FAIL exigido pela tarefa.

## O que foi testado e como

Sem handle de debug exposto pelo app (diferente do Axonometra), toda a
validação foi feita via UI real (Playwright), sempre carregando o template
nativo "Studio Apartment" (3 cômodos, 30 m², 8 paredes, 3 portas, 2 janelas)
como ambiente de teste, em vez de desenho livre por coordenada de pixel
(ver justificativa em `NOTA_POC_OPENPLAN3D.md`).

- **Desktop** (1440×900): `vendor/openplan3d/tests/browser/buildsmart-poc.spec.ts`
  (novo) — seleção de parede, porta e janela no canvas, edição numérica de
  comprimento e de largura pelos campos do painel, toggle 2D→3D, save,
  reload, reconfirmação de todos os valores.
- **Verificação ao vivo adicional** (fora do spec, via scripts Playwright
  descartáveis): leitura direta do IndexedDB para documentar o formato
  serializado; edição de uma parede que hospeda uma janela confirmando que
  `position` (fração 0–1) preserva a posição relativa após a parede mudar de
  600cm→800cm (janela foi de 360cm→480cm de distância absoluta — 60% nos
  dois casos).
- **Mobile** (675×1500, touch real via `hasTouch`/`isMobile`/`touchscreen.tap`):
  seleção de parede por toque abre painel em bottom-sheet, edição de
  comprimento, inserção de porta e janela pelo menu de ferramentas (FAB),
  toggle 2D→3D, orbit por arraste, volta a 2D — zero erros de console em
  toda a sequência.
- **Suíte própria do OpenPlan3D** (upstream, não modificada): `npm test`
  (vitest, 647/647), `npm run check` (svelte-check, 0 erros/7 avisos
  pré-existentes de a11y não relacionados), `npm run build` (adapter-node
  original, só para rodar a suíte própria) + `test:browser` (Playwright,
  92/93 — a única falha é `editor.spec.ts:247` "floor elevations... at
  1440px", confirmada flaky por reexecução isolada 3x consecutivas passando;
  falha idêntica, mesmo teste, já visto antes de qualquer mudança desta
  PoC — não é regressão).
- **Gates da raiz do BuildSmart:** `tsc --noEmit` limpo, `eslint` limpo nos
  arquivos tocados, `vitest run` 238/238, `npm run build` gera as 60+ rotas
  existentes + `/labs/openplan3d` sem erro. `git status` confirma
  `vendor/axonometra/` e `public/axonometra/` **intocados**.

## PASS/FAIL

```
UPSTREAM: https://github.com/laanlabs/openPlan3D
COMMIT UPSTREAM: 511ff08f57526784c0bf3bc48466bfea04204bbc
LICENÇA: MIT (copyright theLodgeStudio 2026, LICENSE preservado)
ESTRATÉGIA DE EMBED: microfrontend vendorizado same-origin (adapter-static
  + iframe), mesmo padrão do vendor/axonometra

PAREDE RETANGULAR: PASS
COTA NUMÉRICA: PASS
CONEXÕES: PASS
PORTA: PASS
JANELA: PASS
AMBIENTE/ÁREA: PASS
2D/3D: PASS
SINCRONIZAÇÃO: PASS
MOBILE: PASS
SAVE/LOAD: PASS
BUILD BUILDSMART: PASS

RESULTADO FINAL: POC APROVADA

PRINCIPAL LIMITAÇÃO: nenhum bloqueador automático da lista da tarefa foi
  encontrado. Limitações menores, nenhuma estrutural: (1) desenho livre de
  parede por coordenada de pixel é sensível ao snap/ângulo do próprio motor
  — não testado diretamente por automação, contornado usando o gerador de
  template nativo do próprio app, que exercita a mesma malha de paredes
  conectadas; (2) o formato serializado não carrega versão de schema
  explícita no nível raiz — precisaria ser adicionada na camada de
  persistência do BuildSmart antes de qualquer gravação real no Supabase;
  (3) um ponto residual não neutralizado (URL fixa do Firebase Storage do
  upstream no fluxo manual, não exposto, de "importar por código de
  handoff" do app iOS) documentado em vendor/openplan3d/VENDOR.md.
ESFORÇO ESTIMADO PARA PRODUTO: médio. O motor 2D/3D em si já entrega tudo
  que a PoC pediu sem extensão de código; o trabalho real de uma futura
  integração de produto seria (a) escrever o adaptador de persistência
  Supabase (`processo_id` + `plan_json` jsonb, mesmo padrão já usado para
  Axonometra — baixo esforço, formato já é limpo e compacto), (b) decidir
  como/se popular `rooms[]` explicitamente para outros módulos do BuildSmart
  lerem área sem reimplementar a detecção de polígono, e (c) uma rodada de
  tradução PT-BR completa da interface (esta PoC deliberadamente não
  traduziu nada, por instrução explícita da tarefa).
URL PREVIEW: https://buildsmart-ai-git-ba68ab-comercialgrupoexclusive-7249s-projects.vercel.app/labs/openplan3d
  (build READY confirmado via API da Vercel para este commit exato — ver
  nota abaixo sobre por que não testei interativamente essa URL ao vivo)
COMMIT BUILDSMART: 0bfbdb445217aa27e63d22d25d8b258d8aae8f0d
```

**Nota sobre o teste na URL do Preview:** por dois motivos independentes já
registrados na rodada anterior (Planta Baixa), não foi possível abrir esse
Preview interativamente a partir deste sandbox: (1) a política de rede do
ambiente bloqueia (403) tráfego de saída para `*.vercel.app`; (2) o projeto
tem Vercel Authentication (SSO) habilitado para qualquer deploy que não seja
domínio customizado. Como substituto, todo o teste funcional documentado
acima (desktop, mobile, save/load, 2D/3D) rodou contra o **mesmo commit,
mesmo `vite build`** localmente, via um servidor estático próprio que
replica o comportamento de fallback de SPA do Next.js — a mesma verificação
que teria sido feita na URL ao vivo, só que fora do sandbox de rede.

## Correção de acesso (pós-teste humano no celular)

O teste real no celular mostrou o wrapper abrindo normalmente, mas o iframe
renderizando "Page not found". Causa: a SPA era compilada com
`base = /labs/openplan3d`, exatamente o mesmo caminho da rota wrapper do
Next.js, e o iframe apontava para `/labs/openplan3d/index.html` — o router
do SvelteKit removia a `base` e lia `/index.html` como rota interna
inexistente, caindo no `+error.svelte`. O erro não apareceu na validação
anterior porque ela foi feita contra um servidor estático próprio (a SPA
servida na raiz, sem a rota wrapper existindo), cenário em que a colisão não
acontece.

Correção: a SPA ganhou raiz pública própria (`/labs/openplan3d-runtime`,
publicada em `public/labs/openplan3d-runtime/`), o iframe passou a abrir
essa raiz (nunca `/index.html`), e o `rewrites().fallback` cobre a raiz e as
sub-rotas internas dela. Nenhuma funcionalidade da PoC foi alterada.

Revalidado contra o **servidor Next.js real** (produção, com os rewrites de
verdade), em iframe same-origin, desktop 1440×900 e mobile 675×1500 com
toque: home da SPA carrega sem "Page not found", navegação para `/editor`
funciona, reload direto em rota interna funciona, assets (`_app/**`,
`models/**`) continuam servidos direto (não capturados pelo fallback), 3D
renderiza, zero erros de console.

## Camada de interação BuildSmart mobile (rodada seguinte)

Motor mantido; o que mudou foi a camada de interação principal. Detalhe
arquitetural em `NOTA_POC_OPENPLAN3D.md` (seção "Camada de interação
BuildSmart (mobile)").

Teste: `vendor/openplan3d/tests/browser/buildsmart-bar.spec.ts` (novo) roda o
script obrigatório de 20 passos ponto a ponto, **duas vezes** — desktop
1440×900 e mobile **675×1500 com toque real** (`hasTouch`/`isMobile`/
`touchscreen.tap`, sem teclado e sem atalho em nenhum passo do fluxo mobile).
A cor do status é conferida lendo os pixels do canvas (amarelo DEMOLIR
aparece de fato depois da troca), e o save/reload é conferido no JSON
exportado (`status` por parede + geometria preservadas).

```
BARRA CANÔNICA ACIMA DA LUIZA: PASS — barra é o último filho do flex-col do
  editor (reserva a própria altura, não flutua); o wrapper reserva a Luiza
  com o mesmo `pb-24 sm:pb-28` do AppLayout. Luiza intocada: posição, altura
  e comportamento canônicos preservados, nada essencial atrás dela.
SELECIONAR: PASS — estado padrão ao abrir; toca parede/porta/janela →
  seleciona; toca vazio → desmarca; selecionar não inicia nenhuma outra ação;
  toda inserção volta sozinha para Selecionar.
PAREDE + CONCLUIR/CANCELAR: PASS — tocar o ícone já inicia o desenho; durante
  a cadeia aparecem Concluir e Cancelar por toque, os dois voltando para
  Selecionar sem inventar geometria; trocar de ferramenta encerra o modo;
  Esc segue funcionando no desktop; nenhum duplo-clique exigido no mobile.
COTA NUMÉRICA: PASS — campo Comprimento (cm) altera a geometria real
  (`resizeWallLength`, só move extremidade; cantos ligados acompanham), não
  o texto da cota. Espessura e status no mesmo painel.
STATUS EXISTENTE/CONSTRUIR/DEMOLIR: PASS — propriedade da mesma parede
  (`Wall.status`), sem segundo tipo de parede nem geometria paralela;
  escolhido na criação, alterado na seleção com recolorização imediata em
  2D e em 3D (cinza/vermelho/amarelo), 3D reaproveitando a atribuição de
  material existente (sem duplicar malha).
PORTA: PASS — ícone → toca a parede → insere UMA → volta para Selecionar;
  na seleção expõe largura, distância de A/B e altura.
JANELA: PASS — mesmo fluxo; na seleção expõe largura, distância de A/B,
  altura e peitoril.
2D/3D: PASS — toggle direto na barra principal (nunca dentro de "Mais");
  3D enquadra o modelo, toque orbita, e voltar para 2D preserva modelo e
  seleção.
MOBILE TOUCH: PASS — script de 20 passos verde em 675×1500 só com toque.
SAVE/LOAD COM STATUS: PASS — `status` sobrevive a save/reload (validado no
  JSON exportado após recarregar); valor inválido é descartado na validação
  em vez de aceito.
BUILD: PASS — OpenPlan3D: svelte-check 0 erros (7 avisos de a11y
  pré-existentes), vitest 647/647, Playwright 95/95 (inclui o
  `editor.spec.ts:247` que estava flaky nas rodadas anteriores).
  BuildSmart: `tsc --noEmit` limpo, eslint limpo, vitest 238/238,
  `npm run build` com `/labs/openplan3d` entre as rotas.
```

Fora de escopo por instrução e **não feito**: Supabase, `processo_id`,
substituição do módulo Planta Baixa, Board, Luiza, Axonometra, refatoração
do OpenPlan3D inteiro.
