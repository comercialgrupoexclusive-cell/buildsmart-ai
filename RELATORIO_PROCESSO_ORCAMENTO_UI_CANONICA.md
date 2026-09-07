# BuildSmart — UI Canônica do Orçamento no Processo

Branch: `processo`
Executor: Claude Code
Status: **PASS parcial** — leitura (Resumo/Etapa/Grupo/Serviço/Insumos) canônica e testada com dados reais; edição e importação **não implementadas nesta rodada** (ver Pendências).

Segue a metodologia pedida: Fase A (diagnóstico + decisão registrada antes de codar) → Fase B (implementação incremental, começando pela leitura).

---

## Fase A — Diagnóstico e decisão

### Fato confirmado antes de qualquer mudança

`app/(app)/processos/[id]/page.tsx` renderizava `<ObraOrcamento processoId=... orcamentoId=... obraName=...>` diretamente — exatamente o padrão `Processo -> ObraOrcamento -> exceções para Processo` que o contrato proíbe. O saneamento funcional anterior (P3.3B) corrigiu bugs reais (template ignorando `processo_id`, etapas perdidas ao reabrir) mas manteve essa arquitetura — a própria RELATORIO_PROCESSO_P3_3B_ORCAMENTO.md já registrava isso como pendência.

### Mapa de responsabilidades de `ObraOrcamento.tsx` (4815 linhas, ~90 funções)

| Bloco | Natureza |
|---|---|
| Carga de dados, CRUD etapa/subetapa/item, overrides de insumo, versão/reabertura, conferência (QA) | domínio, agnóstico de raiz — **reaproveitável via motor SQL, não via cópia de código** |
| `getItemTotal`/`custoPorCategoria`/`infoDoItem` | motor de cálculo **duplicado em TS** — a UI nova não reproduz isso, lê `orcamento_arvore_valores()`/`orcamento_item_valor()` direto |
| `TemplateOrcamentoModal.tsx`, `ImportarExportarOrcamentoModal.tsx` | **já agnósticos de raiz** (recebem `processoId`/`linhasAtuais`/callbacks) — reaproveitáveis sem alteração |
| `ObraAssistenteDock`/Luiza, `OrcamentoEstruturaIAModal`, `sincronizarMateriaisDoOrcamento`, tabela desktop densa, modal "Adicionar item", drag-and-drop (`@dnd-kit`) | **exclusivo Obra** — não entra na UI nova |

### Decisão registrada

**CRIAR NOVA UI DO PROCESSO SOBRE MOTOR EXISTENTE.**

Nenhum bloqueio estrutural encontrado: o motor (`orcamento_item_valor`, `orcamento_arvore_valores`, `inserirItemOrcamento`) já é agnóstico de raiz; os dois modais auxiliares já são reutilizáveis como estão. Faltavam apenas duas leituras SQL adicionais (detalhado abaixo) para a UI nova não precisar recalcular nada em TypeScript. `ObraOrcamento.tsx` não é reaproveitável como casca (domínio e UI de Obra entrelaçados), mas isso não bloqueia nada — é exatamente por isso que a UI nova é uma casca nova sobre o mesmo motor.

---

## Fase B — Implementação (leitura)

### Arquitetura antes/depois

**Antes:** `Processo -> ObraOrcamento (componente de Obra, com exceções condicionais para processo_id) -> dados`

**Depois:** `Processo -> ProcessoOrcamento (UI própria) -> orcamento_arvore_valores()/orcamento_item_insumos_detalhe() (RPC) -> dados`, com `ObraOrcamento.tsx` continuando a servir `/obras/[id]` e `/projetos/[id]` sem qualquer alteração de comportamento.

### Arquivos criados

- `supabase/migrations/20260907000000_orcamento_arvore_valores_colunas.sql`:
  - Amplia `orcamento_arvore_valores()` (mesma assinatura de entrada, mais colunas de saída: `quantidade`, `unidade`, `classificacao`, `ordem`, `composicao_id`, `sinapi_composicao_id`, `subetapa_valor_manual_ativo`, `valor_total_manual_ativo`) — mudança aditiva, sem consumidor existente em produção (Fases 3/4/5 do rebuild anterior ainda não chegaram a usá-la).
  - Cria `orcamento_item_insumos_detalhe(p_item_id)` — detalhe de insumos por item, mesma prioridade materializado > composição-viva já usada em `orcamento_item_valor()`, evitando uma terceira reimplementação dessa regra em TypeScript.
- `lib/orcamento/buscar-catalogo.ts` — busca de composição própria/SINAPI/insumo, extraída (não copiada) de `ObraOrcamento.tsx` para uso futuro do fluxo de adicionar item.
- `components/processo/orcamento/`:
  - `types.ts` — tipos compartilhados + `calcularTotal`/`agruparPorEtapa` (agregação sobre valores já calculados pelo motor, não uma fórmula nova).
  - `ProcessoOrcamento.tsx` — shell: carrega orçamento + árvore de valores, navegação em pilha (Resumo → Etapa → Grupo → Serviço), sem rotas novas.
  - `OrcamentoResumo.tsx` — tela 1: total, busca, lista de etapas.
  - `OrcamentoEtapa.tsx` — tela 2: total da etapa, grupos/subetapas + itens soltos.
  - `OrcamentoGrupo.tsx` — tela 3: serviços de um grupo/subetapa.
  - `OrcamentoItemDetalhe.tsx` — telas 4+5: detalhe do serviço, composição por categoria (M/MO/E) e lista de insumos (via `orcamento_item_insumos_detalhe`).

### Arquivos alterados

- `app/(app)/processos/[id]/page.tsx` — aba Orçamento passa a renderizar `<ProcessoOrcamento orcamentoId=... processoNome=...>` no lugar de `<ObraOrcamento>`; comentário de topo atualizado para não descrever mais a arquitetura antiga. Nenhuma outra aba (`Módulos`, `Planejamento`) alterada — `ObraPlanejamento2` continua exatamente como estava.

### Lógica extraída (não duplicada)

- Preço/valor de item: sempre `orcamento_item_valor()` via `orcamento_arvore_valores()` — zero recálculo em TS.
- Detalhe de insumo: `orcamento_item_insumos_detalhe()` — nova função, mas reaproveita `preco_vigente_insumo()` já existente; não reimplementa a regra de priorização materializado/composição-viva.
- Busca de catálogo: `lib/orcamento/buscar-catalogo.ts`, extraída de `ObraOrcamento.tsx` (mesmas queries, sem duplicar a lógica de resolução de preço por UF).

### Lógica que permanece legado (não tocada)

`ObraOrcamento.tsx` inteiro continua servindo `/obras/[id]` e `/projetos/[id]` sem nenhuma alteração de comportamento, schema ou cálculo. `TemplateOrcamentoModal.tsx`/`ImportarExportarOrcamentoModal.tsx` não foram alterados (já eram reaproveitáveis) — ainda não estão plugados na UI nova porque esta rodada só implementou leitura, por instrução explícita ("Somente depois adicionar edição/importação").

---

## Testes executados

- `npx tsc --noEmit` — limpo.
- `npx eslint` nos arquivos novos/alterados — limpo (2 erros de `react-hooks/set-state-in-effect` corrigidos usando o mesmo padrão (`setTimeout(0)`) já convencionado em `page.tsx`/`ObraOrcamento.tsx` para esse propósito).
- `npx vitest run` — 230/230, sem regressão.
- `npm run build` — produção OK.
- **Teste SQL ao vivo** (`jwezrjyatfjvvsugtugo`):
  - `orcamento_arvore_valores` ampliada: testada contra o Processo real "Teste 1" (único Processo com orçamento hoje — ver nota sobre Allegra abaixo), 18 itens/10 subetapas/6 etapas, soma dos itens = R$ 51.342,00, consistente linha a linha.
  - `orcamento_item_insumos_detalhe`: testada contra 2 itens reais da Obra "Resid. Jardim Allegra" (somente leitura) — um com composição própria "ao vivo" (soma dos insumos = R$ 1.286,68, idêntico a `orcamento_item_valor` para o mesmo item) e um materializado (`orcamento_item_insumos`, valor R$ 0,00, idêntico a `orcamento_item_valor`) — as duas ramificações da função batem exatamente com o motor canônico já validado na Fase 1 anterior.
  - Fórmula de total com subetapa de valor manual (`calcularTotal`/`agruparPorEtapa` em `types.ts`, a única lógica de agregação não-passthrough desta rodada): inseridos temporariamente 1 cabeçalho de subetapa (`subetapa_valor_manual_ativo=true`, valor 999) + 2 itens (100 e 150) no Processo "Teste 1"; SQL equivalente à fórmula confirmou total esperado R$ 52.341,00 (= 51.342 + 999, substituindo os 250 calculados dos itens pelo valor manual) — bate exatamente com a lógica implementada. Limpeza completa por IDs específicos ao final, confirmada por contagem pós-limpeza (18 itens, igual ao estado original).

## Resultado "Allegra" — nota importante

**Não existe um Processo chamado "Allegra"** — "Resid. Jardim Allegra" é uma `Obra` legada (`obras.id = 5d4f844a-...`), não um `Processo`. O único Processo com orçamento real hoje é **"Teste 1"** (criado por Luiz testando a P3.2), usado como caso real para o teste de ponta a ponta da árvore/total acima. Os testes de `orcamento_item_insumos_detalhe` usaram dados reais da Obra Allegra em modo **somente leitura** (nenhuma escrita), para exercitar as duas ramificações (composição-viva e materializado) contra dados de produção de verdade, já que "Teste 1" só tem itens livres sem composição.

Se o critério do gate exige especificamente um Processo chamado Allegra, ele ainda não existe e precisa ser criado — não decidi criar um por conta própria porque isso está fora do escopo desta rodada (UI de leitura) e envolveria uma decisão sobre se/como popular esse Processo com dados reais.

## Resultado desktop / mobile

**Não validado visualmente.** Este ambiente não tem navegador — build/tsc/vitest passando não é validação visual, conforme a própria instrução da rodada. A UI foi desenhada mobile-first (navegação em pilha de telas simples, sem tabela, sem scroll horizontal, listas curtas por nível — nunca mais que etapas ou serviços de um grupo de uma vez) e usa componentes de `components/ui/` já usados em outras telas responsivas do projeto, mas isso é inferência de código, não confirmação visual em 360/390/412px/desktop. **Recomendo teste humano real no preview antes de considerar a Fase B de leitura definitivamente fechada.**

Link do preview: https://buildsmart-ai-git-ba68ab-comercialgrupoexclusive-7249s-projects.vercel.app

## Pendências reais

1. **Validação visual humana** (360/390/412px + desktop) — não feita, sem navegador neste ambiente.
2. **Edição** (quantidade, preço, descrição, override de insumo) — não implementada nesta rodada; a UI de leitura está pronta para receber isso via tela própria ou bottom sheet, conforme pedido, mas não foi codada.
3. **Importação** — `ImportarExportarOrcamentoModal.tsx` não foi plugado na UI nova ainda (só a leitura foi feita).
4. **Processo Allegra real** — não existe; o gate usou "Teste 1" (Processo real disponível) + leitura da Obra Allegra. Decisão sobre criar um Processo Allegra de verdade fica para o usuário.
5. Nada do Planejamento, Materiais, Medições, Compras, Financeiro, SINAPI ou cálculo financeiro foi tocado — consistente com as restrições da rodada.
