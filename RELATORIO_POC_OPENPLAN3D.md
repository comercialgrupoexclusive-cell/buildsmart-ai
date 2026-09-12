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
  (novo, roda 3x consecutivas sem flake) — seleção de parede por role
  (`getByRole('spinbutton', { name: 'Length (cm)' })`), edição numérica,
  seleção/edição de porta e janela por role, toggle 2D→3D, save, reload,
  reconfirmação de todos os valores.
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
URL PREVIEW: ver commit abaixo — Preview da Vercel para o branch `processo`
COMMIT BUILDSMART: (preenchido após o commit, ver mensagem de commit)
```
