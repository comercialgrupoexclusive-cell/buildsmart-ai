# BuildSmart — P4.1 — Integração do Planejamento ao Motor de Processo

Branch: `processo`
Executor: Claude Code

## Estado encontrado

`ObraPlanejamento2.tsx` já era chamado em `/processos/[id]` (`app/(app)/processos/[id]/page.tsx:215`) recebendo `processoId` e `orcamentoId`, mas nunca tinha sido auditado a fundo para confirmar se essa integração era genuína ou só "passa a prop e torce". A auditoria (leitura completa de `ObraPlanejamento2.tsx`, `lib/planejamento-progresso.ts`, schema live via `mcp__Supabase__list_tables`, e grep de todos os consumidores) encontrou:

- `etapaContexto` (o objeto de resolução de raiz do componente) já trata `processo_id` como terceiro caso de primeira classe, simétrico a `obra_id`/`projeto_id` — não uma exceção. Todo CRUD de datas, status, progresso planejado e dependências já passa por esse contexto e já grava `processo_id` corretamente.
- `planejamento_itens` e `planejamento_dependencias` já têm coluna `processo_id` (nullable, FK própria para `processos`, índice próprio) desde a migration `20260906140000_processo_planejamento.sql`, já aplicada.
- O único ponto genuinamente não-agnóstico era a escrita de "% executado": a função "fonte única" `setItemProgresso` (`lib/planejamento-progresso.ts`) exigia `obraId: string` obrigatório e nunca gravava `processo_id`/`projeto_id` no insert. `ObraPlanejamento2.saveExecPct` contornava isso desviando para um `upsertPlan` local quando não havia `obraId` — o registro ficava correto (gravava `processo_id` via `etapaContexto.fk`), mas por um caminho diferente do usado por Medições/RDO, quebrando a promessa de "fonte única" documentada no próprio código. Essa divergência já existia hoje para a fase de Projeto (antes de "Iniciar Obra") — não foi introduzida por Processo, só herdada.
- Não existe uma tabela `atividades` — o que a tarefa chama de "atividade" é a linha-folha (`ref_tipo='item'`) de `planejamento_itens`, ancorada em `orcamento_itens` via `orcamento_item_id` (`ON DELETE CASCADE`).
- Não existe função de exclusão direta de linha de planejamento no componente — a estrutura acompanha o orçamento; "excluir atividade" só existe transitivamente via excluir o item de orçamento correspondente (cascata confirmada no schema).
- Nenhuma dependência de Contexto React de Obra, nenhuma navegação hardcoded para `/obras`/`/projetos`, nenhuma lib de Gantt/DnD pesada.
- `lib/luizia-tools.ts` (assistente de IA) também grava em `planejamento_itens` diretamente e também não contempla `processo_id` — mas a Luiza não é acionável a partir de `/processos/[id]` hoje (mesmo padrão de `ObraAssistenteDock`, desabilitado sem `obraId`), então está fora do raio de impacto desta rodada.

## Arquitetura anterior vs. resultante

**Anterior:** `Processo -> ObraPlanejamento2 (etapaContexto já suporta processo_id) -> planejamento_itens/planejamento_dependencias`, exceto a escrita de % executado, que desviava para um caminho paralelo (`upsertPlan` local) fora da "fonte única" compartilhada com Medições/RDO.

**Resultante:** `Processo -> ObraPlanejamento2 -> lib/planejamento-progresso.ts (fonte única, agora agnóstica de raiz) -> planejamento_itens/planejamento_dependencias`. Não foi criada nenhuma casca nova (`ProcessoPlanejamento`) — a auditoria confirmou que `ObraPlanejamento2.tsx` não está estruturalmente preso a `obra_id`/`projeto_id`, então a decisão foi **reaproveitar o componente como está**, só fechando a única lacuna real encontrada.

## Decisão registrada (antes de implementar)

**REAPROVEITAR `ObraPlanejamento2.tsx` sem alteração de contrato/UI**, corrigindo apenas `lib/planejamento-progresso.ts` para que a função "fonte única" de avanço físico aceite `processo_id`/`projeto_id` como alternativas a `obra_id`, eliminando o desvio de caminho que só existia por essa lacuna. Não foi criada nova arquitetura, não foi redesenhada a interface, não foi adicionada funcionalidade que o legado não possuísse — a mudança é uma generalização de assinatura, não uma feature nova.

## Arquivos alterados

- `lib/planejamento-progresso.ts`: `setItemProgresso` e `setItemProximaMedicao` passam a aceitar `obraId?`, `projetoId?`, `processoId?` (antes só `obraId: string` obrigatório); guarda de runtime exige que pelo menos um esteja presente; o insert de `planejamento_itens` agora grava os três campos (`obra_id`/`projeto_id`/`processo_id`) explicitamente, cada um `?? null`, em vez de só `obra_id`.
- `components/obra/ObraPlanejamento2.tsx`: `saveExecPct` deixou de ter dois caminhos (`if (obraId) ... else upsertPlan local`) — agora sempre chama `setItemProgresso`, passando `obraId`/`projetoId`/`processoId` (o não aplicável fica `undefined`). Simplifica o código (remove um branch) e fecha a divergência.

Nenhuma migration nesta rodada — o schema já tinha `processo_id` em ambas as tabelas desde `20260906140000_processo_planejamento.sql`.

## Tabelas/FKs envolvidas (schema live, confirmado via `mcp__Supabase__list_tables`)

- `planejamento_itens`: `obra_id` (FK `obras`, nullable), `projeto_id` (FK `projetos`, nullable), `processo_id` (FK `processos`, nullable), `orcamento_id` (FK `orcamentos`, not null), `orcamento_item_id` (FK `orcamento_itens` ON DELETE CASCADE) — é essa cascata que faz "excluir atividade" funcionar transitivamente.
- `planejamento_dependencias`: mesmo trio `obra_id`/`projeto_id`/`processo_id`, `item_id`/`predecessor_id` (FK `planejamento_itens` ON DELETE CASCADE), `UNIQUE(item_id, predecessor_id)`.
- `planejamento_itens_baseline`/`planejamento_dependencias_baseline`: **não têm coluna `processo_id`** — a captura de baseline (`iniciar_obra_por_orcamento`) só existe para o ciclo de vida de Obra. Fora do escopo desta rodada (P4.1 não pede baseline de Processo).

## Dependências obra_id/projeto_id encontradas e decisão (A-E)

| Dependência | Decisão | Nota |
|---|---|---|
| `etapaContexto` em `ObraPlanejamento2.tsx` | **A — já suporta processo_id** | Nenhuma mudança necessária. |
| `planejamento_itens`/`planejamento_dependencias` (schema) | **A — já suporta processo_id** | Migration já aplicada antes desta rodada. |
| `setItemProgresso`/`setItemProximaMedicao` (`lib/planejamento-progresso.ts`) | **B — generalizado nesta rodada** | Único ponto que exigia `obra_id`; corrigido. |
| `lib/luizia-tools.ts` (`upsertPlanningDates`, `setItemProgresso` chamadas) | **E — mantido, fora do escopo** | Luiza não é acionável em Processo hoje; ajustar quando a Luiza for habilitada em Processo, não antes. |
| `planejamento_itens_baseline`/`_dependencias_baseline` | **E — mantido, fora do escopo** | Baseline é evento do ciclo de vida de Obra (`iniciar_obra_por_orcamento`), não de Processo; P4.1 não pede baseline de Processo. |
| `ObraPrevisoes`/`ObraCurvaS` (filhos condicionais de `ObraPlanejamento2`) | **E — mantido, já gated** | Só renderizam quando `obraId` é truthy; nunca acionados em Processo. |

Nenhuma migration destrutiva. Nenhum `obra_id`/`projeto_id` removido — ambos continuam sendo consumidos por `/obras` e `/projetos`.

## Como processo_id passou a ser usado

Antes desta rodada, `processo_id` já era gravado corretamente em `planejamento_itens`/`planejamento_dependencias` para datas, status, progresso planejado e dependências (via `etapaContexto.fk`). Depois desta rodada, também é gravado corretamente na escrita de "% executado" — pelo mesmo caminho único (`setItemProgresso`) usado por Medições e RDO quando há Obra, eliminando o desvio que existia só para Projeto/Processo.

## O que foi reaproveitado

100% da UI (`ObraPlanejamento2.tsx`: árvore Etapa→Subetapa→Item, edição de datas/duração/status/progresso planejado, Gantt simples, modal de predecessoras) e 100% do schema (`planejamento_itens`, `planejamento_dependencias`) — nenhuma linha de UI nova, nenhuma tabela nova, nenhuma casca `ProcessoPlanejamento` criada.

## Adaptadores temporários restantes

Nenhum criado nesta rodada. Os únicos "adaptadores" pré-existentes que permanecem são os já documentados na tabela de decisões acima (Luiza, baseline) — nenhum é uma gambiarra introduzida por esta integração, são lacunas de escopo já conhecidas e explicitamente fora do pedido desta rodada.

## Testes executados

- `npx tsc --noEmit` — limpo.
- `npx eslint lib/planejamento-progresso.ts components/obra/ObraPlanejamento2.tsx` — mesmos 12 problemas (9 erros `no-explicit-any`, 3 avisos) do baseline antes da mudança (confirmado via `git stash`), zero novos.
- `npx vitest run` — 230/230, sem regressão.
- `npm run build` — produção OK.
- **Teste real no banco** (Processo "Teste 1", `8d251932-346d-4c33-a7d5-8bf3cb3aa0cc`, orçamento `e1394712-bf0b-4c4d-8156-4cdfb3d63d9d` — não Allegra, conforme pedido): criados 2 itens de orçamento temporários (`TESTE-P4.1-ATIV-A/B`); simulado exatamente o fluxo do componente com `processoId` como raiz (sem `obraId`/`projetoId`): `upsertPlan` (datas/status/progresso planejado) no item A; `setItemProgresso` — ramo de insert (item B, sem registro prévio) e ramo de update (mesmo item, segunda chamada) — confirmando as duas ramificações da função corrigida; `saveDependencies` (dependência FS entre A e B); leitura de volta via o mesmo padrão de `loadPlanejamentoProgresso` (join `orcamento_itens`/`planejamento_itens` por `orcamento_id`); exclusão do item B via `orcamento_itens` (simulando "excluir atividade") — confirmada cascata automática removendo a linha de `planejamento_itens` e a dependência, sem afetar o item A; limpeza final do item A por ID específico; confirmado zero linhas remanescentes de teste.

## Resultado do teste real (PASS/FAIL por item)

| Item do gate | Resultado |
|---|---|
| Criar/abrir Processo com Orçamento+Planejamento habilitados | PASS (Processo "Teste 1" já tinha ambos habilitados) |
| Abrir Planejamento | PASS (nenhuma mudança na tela; gate de `processo_modulos` inalterado) |
| Criar atividade (datas/status/progresso planejado) | PASS |
| Editar atividade | PASS |
| Criar dependência | PASS (`tipo='FS'`, `processo_id` gravado) |
| Vincular ao orçamento | PASS (`orcamento_item_id`, já era o mecanismo nativo) |
| Alterar progresso (% executado) | PASS — agora pelo caminho canônico, não mais pelo desvio |
| Fechar/reabrir (persistência) | PASS (leitura pós-escrita confirmada via query equivalente a `loadPlanejamentoProgresso`) |
| Excluir registro de teste | PASS (via exclusão do item de orçamento; cascata confirmada) |
| Ausência de órfãos | PASS (contagem pós-limpeza = 0) |

## Regressões verificadas

- `/obras/[id]/page.tsx:429` continua chamando `<ObraPlanejamento2 obraId={id} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />` sem alteração — comportamento idêntico (o insert de `setItemProgresso` grava `obra_id` exatamente como antes; `projeto_id`/`processo_id` ficam `null`, mesmo resultado de antes quando essas colunas simplesmente não eram mencionadas no insert).
- `components/projeto/ProjetoOrcamentosPanel.tsx:272` continua chamando com `obraId`/`projetoId` condicionais, sem alteração.
- `ObraMedicoes.tsx`, `ObraRdo.tsx`, `lib/luizia-tools.ts` continuam passando `obraId` diretamente — compatível com a assinatura agora opcional (nenhuma mudança de comportamento, `tsc` confirma compatibilidade).
- Nenhum cálculo de avanço físico foi alterado — `loadPlanejamentoProgresso` (leitura) não foi tocada.
- Nenhuma migration executada, nenhum dado de produção apagado, nenhum segredo adicionado.

## Pendências reais

1. `lib/luizia-tools.ts` ainda grava `planejamento_itens` sem `processo_id` em `upsertPlanningDates` e chama `setItemProgresso` só com `obraId` — sem efeito prático hoje (Luiza não é acionável em Processo), mas precisa de ajuste quando a Luiza for habilitada nesse contexto.
2. Não existe baseline de Planejamento para o ciclo de vida de Processo (`planejamento_itens_baseline` sem `processo_id`) — relevante só quando o fluxo de "iniciar obra a partir do Processo" for desenhado, fora do escopo de P4.1.
3. RLS de `planejamento_itens`/`planejamento_dependencias` é `USING(true)` (sem isolamento por tenant/raiz) — pré-existente, não introduzido nem agravado por esta rodada, mas vale registrar para uma futura rodada de segurança.

## Recomendação para o próximo módulo

Seguir a mesma disciplina desta rodada antes de qualquer outra migração: auditar a fundo (não assumir que "receber a prop já é suficiente"), separar o que já é agnóstico de raiz do que não é, e corrigir só a lacuna real em vez de reconstruir. Não iniciar Tarefas, Medições, Compras ou qualquer outro módulo nesta rodada, conforme pedido.
