# PoC isolada — OpenPlan3D (`/labs/openplan3d`)

Prova de conceito **isolada**, não conectada ao módulo Planta Baixa (Axonometra)
nem a nenhum dado do Processo. Objetivo único: responder se o OpenPlan3D
consegue entregar, dentro do BuildSmart, um fluxo básico e utilizável de
planta paramétrica 2D + visualização 3D sincronizada, inclusive em celular.
Nada aqui substitui o Axonometra, altera o banco, ou cria arquitetura
definitiva — ver `vendor/openplan3d/VENDOR.md` para a proveniência completa.

## Auditoria de proveniência

- **Upstream:** https://github.com/laanlabs/openPlan3D (pacote `open3dfloorplan`;
  há um fork/rename em `theLodgeBots/open3dFloorplan` referenciado no próprio
  `package.json` do upstream — `laanlabs/openPlan3D` é o repositório canônico
  ativo: 149 stars, 60 forks, 366 commits em `main`).
- **Commit pinado:** `511ff08f57526784c0bf3bc48466bfea04204bbc` (branch `main`,
  2026-09-08).
- **Licença:** MIT, copyright theLodgeStudio 2026 — `LICENSE` preservado em
  `vendor/openplan3d/LICENSE`, sem divergência entre o arquivo e o que
  `README.md`/`package.json` anunciam.
- **Modelos 3D** (não usados por esta PoC — biblioteca de mobiliário fora de
  escopo): fontes documentadas em `vendor/openplan3d/MODEL_SOURCES.md`,
  majoritariamente Kenney.nl (CC0). Não auditado item a item nesta rodada.
- Detalhe completo de "sem dependência do upstream em runtime" (Analytics
  desligado via `PUBLIC_ENABLE_ANALYTICS=false`, endpoint de handoff iOS
  desativado, um ponto residual aceito) em `vendor/openplan3d/VENDOR.md`.

## Estratégia de embed

Microfrontend vendorizado same-origin, no mesmo padrão já usado para o
Axonometra (`vendor/axonometra/`):

- App é SvelteKit + Three.js — stack totalmente diferente do host (Next.js) —
  então **não** é importado como módulo; é buildado separadamente e servido
  como asset estático.
- `svelte.config.js` trocado de `adapter-node` (como o upstream roda em
  produção, com SSR) para `adapter-static` (SPA, `fallback: 'index.html'`) —
  única mudança de configuração; **nenhuma linha de lógica de domínio foi
  tocada**.
- **Duas URLs distintas, deliberadamente separadas:**
  - `/labs/openplan3d` — rota wrapper do Next.js (só embute o iframe);
  - `/labs/openplan3d-runtime` — raiz pública da SPA vendorizada.

  As duas não podem ocupar o mesmo caminho: o SvelteKit é compilado com
  `base` igual à raiz do runtime e trata tudo além dessa base como rota
  interna. Com os dois no mesmo caminho, o iframe abria
  `/labs/openplan3d/index.html`, o router do Svelte lia `/index.html` como
  rota interna inexistente e renderizava o `+error.svelte` ("Page not
  found").
- `npm run build:openplan3d` (novo script, espelha `build:axonometra`)
  builda `vendor/openplan3d/` com `OPENPLAN3D_BASE_PATH=/labs/openplan3d-runtime`
  e copia o resultado para `public/labs/openplan3d-runtime/`.
- `app/(app)/labs/openplan3d/page.tsx`: rota autenticada (mesmo grupo
  `(app)` de todas as outras telas — não abre um buraco novo na autenticação)
  que embute `<iframe src="/labs/openplan3d-runtime">` em tela cheia —
  a **raiz** da SPA, nunca um `/index.html`. Sem contrato `postMessage` — o
  app vendorizado é autocontido (salva/carrega no IndexedDB do próprio
  navegador).
- `next.config.ts`: duas regras `rewrites().fallback` (`/labs/openplan3d-runtime`
  e `/labs/openplan3d-runtime/:path*`) fazem a raiz da SPA e qualquer
  sub-rota não estática dela (ex.: `/labs/openplan3d-runtime/editor?id=...`,
  que só existe client-side) caírem no `index.html` da própria SPA —
  necessário para que a raiz e um reload direto em `/editor` não deem 404.
  Só entram em jogo quando nenhum arquivo estático real (`_app/**`,
  `models/**`, `textures/**`) nem rota do Next.js casou primeiro, então não
  interferem com o resto do app.
- Teste de build confirmado: `npm run build` do BuildSmart gera a rota
  `/labs/openplan3d` normalmente, junto com todas as outras 60+ rotas
  existentes, sem erro.

## Escopo testado

Usado o gerador de templates nativo do próprio OpenPlan3D ("Use a Template" →
"Studio Apartment": 3 cômodos, 30 m², 8 paredes, 3 portas, 2 janelas, já
conectados) em vez de desenho livre de parede por clique — desenho livre por
coordenadas de pixel se mostrou frágil a ajuste de ângulo/snap do próprio
motor (esperado; o objetivo da PoC é testar edição/sincronização, não a
precisão de um script de clique). Isso valida igualmente bem o requisito
"ambiente retangular com 4 paredes conectadas" (múltiplos retângulos entre os
8 segmentos do template) sem depender de um fluxo de desenho ainda não
exercitado por nenhuma automação.

## Camada de interação BuildSmart (mobile)

O motor do OpenPlan3D foi **mantido**; o que mudou foi a camada de interação
principal, substituída por uma barra explícita de toque para o uso mobile da
PoC. Nenhuma geometria, cálculo ou estrutura de dados do motor foi
reimplementada — os botões acionam as ferramentas que já existiam.

- `src/lib/components/buildsmart/BuildSmartBar.svelte` (novo): barra canônica
  com **Selecionar · Parede · Porta · Janela · 2D/3D · Mais**, alvos de 56px,
  sem teclado, sem hover, sem atalho. O toggle 2D/3D fica na barra principal,
  nunca dentro de "Mais"; "Mais" só abre o que é secundário (pavimentos,
  escada, mobiliário, importações, configurações — o painel upstream, que
  segue intacto).
- A barra é o último filho do flex-col do editor: ela **reserva a própria
  altura** em vez de flutuar sobre o canvas. No wrapper Next.js, o iframe usa
  o mesmo `pb-24 sm:pb-28` que o `AppLayout` já aplica para reservar a Luiza,
  então a barra da Planta fica **imediatamente acima** da barra de digitação
  da Luiza, sem sobrepor nem esconder nada dela (a Luiza não foi tocada).
- **Parede:** tocar no ícone já começa o desenho. Enquanto a cadeia está
  aberta aparecem **Concluir** e **Cancelar** (`wallChainCommand`), os dois
  voltando para Selecionar — nenhum dos dois inventa geometria, então não
  existe estado do qual o usuário não consiga sair por toque. Trocar de
  ferramenta também encerra o modo parede; o `Esc` do upstream continua
  funcionando no desktop.
- **Status de reforma** (`EXISTENTE` cinza / `CONSTRUIR` vermelho / `DEMOLIR`
  amarelo): é uma **propriedade da mesma parede** (`Wall.status`, opcional —
  ausente = `EXISTENTE`), não um segundo tipo de parede nem geometria
  paralela. `src/lib/utils/wallStatus.ts` é a fonte única de rótulo/cor,
  consumida pelo 2D (`canvasRenderer`), pelo 3D (`ThreeViewer`, reaproveitando
  a atribuição de material que já existia — sem duplicar malha) e pela UI. É
  escolhido na criação (linha contextual da barra) e alterado na seleção
  (bloco "Estado de reforma" no painel de propriedades), com recolorização
  imediata, e sobrevive a save/load (`projectValidation` descarta valor
  inválido em vez de aceitar lixo).
- **Porta/Janela:** ícone → toca a parede → insere **uma** → volta sozinho
  para Selecionar (comportamento que já era do motor). Na seleção, o painel
  expõe largura, distância das extremidades e altura/peitoril.
- Tradução PT-BR apenas dos controles desta rodada (parede, porta, janela e a
  barra). **IDs, enums e chaves internas não foram traduzidos** — inclusive os
  valores de `status`, que são o contrato serializado.
- Desktop: sem redesenho: a barra lateral upstream continua ali, "Mais" a
  recolhe, e os botões flutuantes do upstream subiram o suficiente para não
  ficarem atrás da barra nova.


## Achados sobre o formato de save/load (item 5 da tarefa)

Mecanismo nativo: **IndexedDB** (`openplan3d-local`, stores `projects`,
`history`, `meta`, `thumbnails`) — não usa Firebase/cloud para persistência,
só para analytics (desligado nesta PoC). Cada projeto é uma **string JSON**
(não binário/comprimido), formato limpo e plano:

```json
{
  "id": "6xilddcl",
  "name": "Studio Apartment",
  "floors": [{
    "id": "7rzx73hl", "name": "Ground Floor", "level": 0,
    "walls": [{ "id": "...", "start": {"x":0,"y":0}, "end": {"x":600,"y":0},
                "thickness": 15, "height": 280, "startHeight": 280, "endHeight": 280,
                "color": "#444444", "status": "CONSTRUIR" }],
    "rooms": [],
    "doors":   [{ "id": "...", "wallId": "...", "position": 0.65, "width": 90,
                  "height": 210, "type": "single", "swingDirection": "left", "flipSide": false }],
    "windows": [{ "id": "...", "wallId": "...", "position": 0.6, "width": 150,
                  "height": 120, "sillHeight": 90, "type": "standard" }]
  }],
  "activeFloorId": "...", "createdAt": "...", "updatedAt": "..."
}
```

Confirmado ao vivo: `position` é uma **fração 0–1 ao longo da parede** (não
cm absoluto) — por isso alterar o comprimento da parede hospedeira preserva a
posição relativa da porta/janela automaticamente (testado: parede de 600cm
→800cm, janela em `position: 0.6` foi de 360cm→480cm de distância absoluta,
exatamente 60% em ambos os casos, sem nenhum código extra). `rooms: []` fica
vazio no template testado — a área exibida na UI é computada ao vivo a partir
da topologia das paredes, não persistida como polígono explícito (registrado
como diferença de modelagem a confirmar numa rodada futura, se o cômodo for
usado como referência canônica de área em algum outro módulo do BuildSmart).

**Onde entraria `processo_id`:** o BuildSmart já tem exatamente este padrão
para o Axonometra — tabela `plantas` (`supabase/migrations/20260911110000_p4_6_planta_baixa_axonometra.sql`):
`processo_id uuid references processos(id)`, `plan_json jsonb`,
`plan_schema_version integer`. Uma futura tabela para o OpenPlan3D seguiria a
mesma forma: `processo_id` como FK, o objeto acima inteiro em `plan_json`
(jsonb aceita esse JSON sem transformação). Diferença a resolver antes de
produção: o objeto não carrega um campo `version` de schema no nível raiz
(ao contrário do formato do Axonometra) — seria preciso adicionar isso na
camada de persistência do BuildSmart (não no upstream) antes de confiar nele
para migração de dados no banco.

**Esforço estimado para persistir no Supabase:** baixo. O JSON já é
compacto (2.7 KB para o template de 30 m² testado, 8 paredes/3 portas/2
janelas/5 móveis) e plano o bastante para armazenar direto em uma coluna
`jsonb`, replicando o mesmo `PlantaEditor.tsx`/`salvarPlanoPlanta` já
existente para o Axonometra (troca o `postMessage` por leitura direta do
IndexedDB via um pequeno adaptador, já que este app não implementa esse
contrato — não foi criado nesta PoC, por instrução explícita da tarefa).

## Resultado

Ver `RELATORIO_POC_OPENPLAN3D.md` para o relatório PASS/FAIL completo,
comandos de teste executados e link do Preview.
