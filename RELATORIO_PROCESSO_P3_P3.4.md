# BuildSmart — Processo P3.4 — Planejamento + Evolução Física

Branch: `processo`
Executor: Claude Code
Status: **PASS**

## Objetivo executado

Implementar a Rodada P3.4 de `PROCESSO_P3_PLANO_ACAO_CLAUDE.md`: trazer Planejamento (cronograma/dependências) e evolução física para dentro do Processo, seguindo a mesma metodologia cirúrgica da P3.3 — achar o único ponto de bifurcação obra/projeto e generalizar, sem duplicar o módulo.

## Mapeamento

- `components/obra/ObraPlanejamento2.tsx` já tinha, desde a Estabilização V1 (task "Make ObraPlanejamento2 work in Projeto phase"), o **mesmo padrão** de `etapaContexto` já generalizado em `ObraOrcamento.tsx` na P3.3 — só que como uma cópia local independente dentro deste componente, usada em 4 pontos: carregar etapas, criar item de planejamento (`upsertPlan`), garantir item existente (`ensurePlanId`) e gravar dependências (`saveDependencies`).
- `planejamento_itens`/`planejamento_dependencias` já tinham o mesmo padrão dual-root nullable (`obra_id`/`projeto_id`) que `etapas`/`orcamentos`.
- `saveExecPct` (edição de % executado) já bifurca: se existe `obraId`, usa a fonte única `lib/planejamento-progresso.ts` (compartilhada com Medições/RDO); senão, cai num upsert local direto em `planejamento_itens.progresso_executado` — esse "senão" já é o comportamento de hoje em fase de Projeto (sem Obra), e passa a ser também o comportamento em um Processo sem Obra. Nenhuma mudança necessária aqui.
- Recursos exclusivos de Obra (Previsões, Curva S) já são condicionados a `obraId` existir — continuam ausentes em Processo, exatamente como já ficam ausentes em fase de Projeto hoje. Não é uma lacuna nova.

## Arquivos alterados

- `supabase/migrations/20260906140000_processo_planejamento.sql` *(novo)* — `planejamento_itens.processo_id` e `planejamento_dependencias.processo_id` (ambos nullable, `ON DELETE CASCADE`, mesmo padrão de `obra_id`/`projeto_id`). `etapas.processo_id` já existia desde a P3.3. Aditiva.
- `lib/types.ts` — `processo_id?: string | null` em `PlanejamentoItem` e `PlanejamentoDependencia`.
- `components/obra/ObraPlanejamento2.tsx` — mesmas 2 categorias de edição cirúrgica da P3.3:
  1. novo prop opcional `processoId`;
  2. `etapaContexto` ganha o terceiro ramo `processo_id` — cobre sozinho os 4 pontos de uso já centralizados nesse objeto;
  3. mensagens de erro ("Obra ou projeto não identificado...") atualizadas para "Obra, projeto ou processo..." (cosmético, mas evita mensagem enganosa se o caso realmente ocorrer).
- `app/(app)/processos/[id]/page.tsx` — nova aba "Planejamento" (só aparece quando o módulo `planejamento` está habilitado), reaproveitando o mesmo `orcamentoId` já resolvido para a aba Orçamento e renderizando `<ObraPlanejamento2 processoId orcamentoId>` — o componente de produção, sem cópia. Também corrigido, de passagem, um erro de lint (`react-hooks/set-state-in-effect`) que já existia desde a P3.3 no efeito que resolve o orçamento — passou despercebido na validação daquela rodada; achado e corrigido agora com o mesmo padrão `window.setTimeout` já usado no resto do arquivo.

## Testes executados e resultados

- `npx tsc --noEmit` — limpo.
- `npx eslint` nos arquivos tocados — limpo. `ObraPlanejamento2.tsx` mantém os mesmos 13 erros pré-existentes de antes desta rodada (confirmado via `git stash`, contagem idêntica antes/depois — meu diff não adiciona nenhum).
- `npx vitest run` — 230/230, sem regressão.
- `npm run build` — produção OK.
- **Teste SQL ao vivo** (Supabase): Processo de teste com 2 etapas, 2 itens de planejamento (`planejamento_itens`, um por etapa) e 1 dependência entre eles (`planejamento_dependencias`) — todos gravados com `processo_id`; confirmado que aparecem corretamente filtrando por `processo_id`; limpeza completa ao final (confirmado por consulta pós-limpeza: zero linhas órfãs). Um ajuste no teste no meio do caminho: a constraint de status de `planejamento_itens` usa um vocabulário diferente do de `etapas` (`nao_iniciado/em_andamento/concluido/atrasado/suspenso`, não `planejada/...`) — descoberto pelo próprio teste, sem impacto no código do app (que já usa os valores corretos).

## Comportamento observado

- A aba "Planejamento" de um Processo reaproveita o mesmo orçamento resolvido pela aba Orçamento (mesma `orcamentoId`) — não cria um segundo orçamento.
- Dentro dela, o componente é literalmente o mesmo `ObraPlanejamento2` usado por Obras e por Projetos em fase de projeto: estrutura (árvore etapa/subetapa/item), dependências (predecessoras), % executado editável — tudo funciona pelo mesmo `etapaContexto` generalizado.
- Previsões e Curva S continuam indisponíveis sob um Processo (mesmo comportamento que já existe hoje em fase de Projeto sem Obra) — esperado, não é lacuna desta rodada.

## Dívida / pendência encontrada

- Nenhuma nova além das já registradas nas rodadas anteriores (Materiais/Compras sem feedback quando não há Obra — P3.6; validação humana real na UI ainda pendente).

## Riscos

- Baixo: mesmo raciocínio da P3.3 — edição cirúrgica de um componente crítico de produção, só ativa quando `obraId` e `projetoId` estão ambos ausentes (nunca acontece nas telas de Obra/Projeto hoje).

## Próximo passo recomendado

Pedir para Luiz testar Orçamento + Planejamento juntos dentro de um Processo no preview (criar etapa no Orçamento, ver aparecer no Planejamento, criar dependência, editar % executado). Depois, seguir para **P3.5 — Financeiro + Financiamento separados** (garantir os três eixos independentes: físico, financeiro, financiamento — conforme a seção 2 do plano).
