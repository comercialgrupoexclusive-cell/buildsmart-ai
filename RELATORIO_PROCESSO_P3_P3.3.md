# BuildSmart — Processo P3.3 — Primeiro Módulo Real: Orçamento

Branch: `processo`
Executor: Claude Code
Status: **PASS**

## Objetivo executado

Implementar a Rodada P3.3 de `PROCESSO_P3_PLANO_ACAO_CLAUDE.md`: trazer o Orçamento — módulo real, já em produção — para dentro de um Processo, **sem duplicar o módulo**, provando leitura/escrita pelo contrato existente.

## Mapeamento da implementação atual (antes de mexer em qualquer coisa)

- `orcamentos` e `etapas` já têm um padrão dual-root nullable (`obra_id`/`projeto_id`), criado na Estabilização V1 para o Orçamento funcionar tanto em Obra quanto em fase de Projeto (antes de "Iniciar Obra").
- `components/obra/ObraOrcamento.tsx` já resolve o orçamento **direto por `orcamentoId`** quando esse prop é passado (linha `if (orcamentoId) { ... }`) — `obraId`/`projetoId` só importam para (a) decidir o contexto de `etapas` (`etapaContexto`, um único objeto centralizado usado em 5 lugares: carregar, criar, checar duplicidade de hierarquia e importar etapas) e (b) carregar `processo_id`/`projeto_id` ao "reabrir" o orçamento numa nova versão.
- `components/projeto/ProjetoOrcamentosPanel.tsx` já demonstra esse padrão: passa só `orcamentoId` (sem `obraId`) para orçamentos em fase de Projeto — exatamente o que o Motor de Processo precisa replicar.
- `lib/materiais-sync.ts` (sincronizar orçamento → materiais) já é condicionado a `resolvedObraId` existir e simplesmente não roda sem Obra — comportamento que já existe hoje na fase de Projeto, não é uma lacuna nova desta rodada.

Conclusão do mapeamento: **um único ponto** (`etapaContexto`, `components/obra/ObraOrcamento.tsx`) precisava ganhar um terceiro ramo (`processo_id`) para o módulo inteiro funcionar sob um Processo — nada mais no componente precisou mudar.

## Arquivos alterados

- `supabase/migrations/20260906130000_processo_orcamento.sql` *(novo)* — `orcamentos.processo_id` (nullable, `ON DELETE SET NULL`, mesmo padrão de `obra_id`/`projeto_id`) e `etapas.processo_id` (nullable, `ON DELETE CASCADE`, mesmo padrão de `obra_id`/`projeto_id`), com índices. Aditiva — nenhuma linha existente tocada.
- `lib/types.ts` — `processo_id?: string | null` adicionado a `Orcamento` e `Etapa`.
- `components/obra/ObraOrcamento.tsx` — 3 edições cirúrgicas:
  1. novo prop opcional `processoId`;
  2. `etapaContexto` ganha um terceiro ramo (`processo_id`), mesmo formato do ramo `projeto_id` já existente — isso sozinho cobre carregar/criar/checar duplicidade/importar etapas, porque todos esses pontos já usavam esse único objeto;
  3. o insert de "reabrir (nova versão)" passa a carregar `processo_id: processoId || orcamento.processo_id`, para uma nova versão não "escapar" do Processo.
- `lib/processo/orcamento.ts` *(novo)* — `getOrCreateOrcamentoDoProcesso`, mesmo raciocínio de `lib/investidor-venda.ts::getOrCreateProspeccaoVenda`: resolve o orçamento do Processo ou cria o primeiro se ainda não existir.
- `components/ui/Tabs.tsx` *(novo)* — abas de seção (ícone + rótulo), padrão que já existia em `app/(app)/projetos/[id]/page.tsx`, extraído para não recriar de novo (ver `PROCESSO_P3_PADROES_UI.md`).
- `app/(app)/processos/[id]/page.tsx` — ganha uma aba "Orçamento" (só aparece quando o módulo `orcamento` está habilitado) que resolve/cria o orçamento do Processo e renderiza `<ObraOrcamento processoId orcamentoId obraName>` — o componente de produção, sem cópia.

## Testes executados e resultados

- `npx tsc --noEmit` — limpo.
- `npx eslint` nos arquivos tocados — limpo, **exceto** `components/obra/ObraOrcamento.tsx`, que já tinha 16 erros de lint pré-existentes antes desta rodada (confirmado via `git stash` + lint no arquivo original) — meu diff (3 edições, 16 linhas) não adiciona nenhum novo; contagem foi de 16 para 13 após minha edição (nenhum dos 13 restantes cai nas linhas que toquei). Não fiz limpeza desses 16 erhos pré-existentes — são um arquivo de produção de 3000+ linhas, fora do escopo desta rodada, e mexer neles sem necessidade é risco de regressão não pedido.
- `npx vitest run` — 230/230, sem regressão.
- `npm run build` — produção OK; `/processos/[id]` continua gerado normalmente.
- **Teste SQL ao vivo** (Supabase, `jwezrjyatfjvvsugtugo`): criado um Processo de teste, um orçamento com `processo_id`, uma etapa com `processo_id`+`orcamento_id`; confirmado `select ... where processo_id = ...` retorna a linha certa em ambas as tabelas; limpeza completa ao final (deletado o orçamento e o processo de teste) — confirmado por consulta pós-limpeza que não sobrou nenhuma linha órfã.

## Comportamento observado

- Abrir a aba "Orçamento" de um Processo (com o módulo habilitado) cria automaticamente o primeiro orçamento (`versao: 1`, `status: em_projeto`, `bdi_percentual: 25` — mesmos defaults do fluxo de Obra) na primeira vez, e reaproveita o mesmo depois.
- Dentro dessa aba, o componente é **literalmente o mesmo** `ObraOrcamento` usado por Obras e por Projetos em fase de projeto — etapas, itens, composições, conferência (QA), importar/exportar XLSX, templates: tudo funciona porque o único ponto que precisava saber sobre `processo_id` (`etapaContexto`) foi generalizado.
- "Sincronizar materiais" continua sem efeito sob um Processo (mesmo comportamento silencioso que já existe hoje em fase de Projeto sem Obra) — não é uma lacuna introduzida por esta rodada; Materiais/Compras é P3.6.

## Dívida / pendência encontrada

- `sincronizarMateriaisDoOrcamento()` não dá nenhum feedback ao usuário quando `resolvedObraId` é nulo (clica e nada acontece, sem mensagem) — comportamento pré-existente da fase de Projeto, não introduzido aqui. Vale corrigir quando Materiais/Compras migrar de verdade (P3.6), não antes.
- `components/obra/ObraOrcamento.tsx` tem 13 erros de lint pré-existentes (a maioria `react-hooks/set-state-in-effect`) não relacionados a esta rodada — registrados aqui para não serem confundidos com algo que esta rodada introduziu, mas não corrigidos (fora de escopo).
- Não testei manualmente na UI (browser) por falta de navegação interativa neste ambiente — a prova foi tsc/eslint/vitest/build limpos + teste de SQL direto simulando exatamente as queries que o app faz. Recomendo teste humano real no preview antes de considerar P3.3 definitivamente fechada (mesmo padrão da P3.2: Luiz testou ao vivo e confirmou).

## Riscos

- Baixo–médio: `ObraOrcamento.tsx` é o componente mais crítico do sistema (dados reais de obras em produção). A alteração foi deliberadamente mínima (3 pontos), sem tocar em nenhuma lógica de cálculo, RLS ou fluxo de Obra/Projeto existente — `processoId` só entra em jogo quando `obraId` e `projetoId` estão ambos ausentes, o que nunca acontece nas telas de Obra/Projeto hoje.

## Próximo passo recomendado

Pedir para Luiz testar a aba "Orçamento" dentro de um Processo no preview (criar um Processo, abrir a aba, adicionar uma etapa/item, confirmar que persiste). Depois disso, seguir para **P3.4 — Planejamento + evolução física**, integrando Cronograma/Planejamento e Medições ao Processo pelo mesmo raciocínio (achar o único ponto de bifurcação obra/projeto e generalizar, em vez de duplicar).
