# RELATÓRIO — P4.2 Motor de Processo: integração de módulos legados

Branch `processo`. Baseline obrigatório: `4c6aa5757f62bba1256a5dfdb6636adf385ebf06` (P4.1, PASS, não refeito).
Commits desta rodada: `1908f49` (Tarefas+Board), `d0042cc` (Medições), `510ced8` (RDO).
Teste real: Processo "Teste 1" (`8d251932-346d-4c33-a7d5-8bf3cb3aa0cc`), orçamento `e1394712-bf0b-4c4d-8156-4cdfb3d63d9d`. Allegra (`5d4f844a-a433-4912-8b2d-45352f2569a0`) **não foi tocada**.

---

## 1. Tarefas + Board

**Estado encontrado**: `ContextoTarefas.tsx`/`TarefaModal.tsx` aceitavam só `obraId?`/`projetoId?`, sem `processoId`. Tabela `tarefas` tinha `obra_id`/`projeto_id` nullable, sem `processo_id`. Board (`KanbanTarefas`) é 100% derivado — agrupa em memória o mesmo array de tarefas por `status`, sem tabela própria.

**Componentes/tabelas**: `components/tarefas/ContextoTarefas.tsx`, `TarefaModal.tsx`, `LinhaTarefa.tsx`; tabela `public.tarefas`.

**Dependências**: obra_id/projeto_id nullable (convenção de app, nunca reforçada no banco); nenhuma outra tabela depende de `tarefas.processo_id`.

**Decisão**: **B** — coluna `processo_id` nullable + índice parcial. Aditivo, zero mudança em `/obras`/`/projetos`.

**Alterações**: `lib/types.ts` (`Tarefa.processo_id`), `ContextoTarefas.tsx` (filtro três-vias `obraId ? … : projetoId ? … : processoId`), `TarefaModal.tsx` (grava `processo_id` no insert), `/processos/[id]/page.tsx` (aba "Tarefas" condicionada a `habilitados.has('tarefas')`, renderiza `<ContextoTarefas processoId={processo.id} />`).

**Migration**: `20260910120000_tarefas_processo_id.sql` (aplicada).

**Teste real**: criar/editar/mudar status/excluir uma tarefa via `processo_id`, reler pelo filtro exato da UI, limpar por ID, 0 órfãos.

**Resultado**: **PASS**. `processo_id` canônico. CRUD testado. Legado preservado (obra_id/projeto_id inalterados). Pendência: nenhuma relevante — Board continua view derivada, sem ação necessária.

---

## 2. Execução

**Estado encontrado**: não existe módulo, componente, tabela ou rota chamada "Execução" em nenhum lugar do código. O conceito de execução física já é coberto pelo Planejamento (avanço físico via `planejamento_itens.progresso_executado`), integrado e testado na P4.1.

**Decisão**: nenhuma — não há o que integrar.

**Resultado**: **NÃO IMPLEMENTADO NO LEGADO**. Registrado por instrução explícita de não inventar funcionalidade. Coberto conceitualmente pelo módulo Planejamento (P4.1, já PASS).

---

## 3. Medições (avanço físico + boletim formal)

**Estado encontrado**: `ObraMedicoes.tsx` (orquestrador de 5 sub-abas), `ObraBoletins.tsx`, `ObraMedicaoMaoObra.tsx` (+ `ObraEixoAvanco.tsx`/`ObraAjusteDistribuicao.tsx`) todos com `obraId: string` obrigatório. Tabela `medicoes`: `obra_id NOT NULL`, sem `projeto_id` (Medições nunca existiu na fase Projeto) nem `processo_id`. Sub-aba "Avanço físico" já usava `lib/planejamento-progresso.ts` (generalizado na P4.1) — só faltava repassar `processoId`.

**Componentes/tabelas**: `ObraMedicoes.tsx`, `ObraBoletins.tsx`; tabelas `medicoes`/`medicao_itens`.

**Dependências obra_id/processo_id**: `medicoes.obra_id` era `NOT NULL` — bloqueio de schema, não só de UI. Consumida também por Financiamento (`ObraFinanciamentoMedicao.tsx`), `ObraCurvaS.tsx`, `PortfolioResumo.tsx`, RPCs do Portal, Luiza/WhatsApp — todos filtrados por `obra_id`, nenhum afetado (aditivo, obra_id continua preenchido nas linhas existentes).

**Decisão**: **B** — `obra_id` vira nullable, `processo_id` nullable + índice + CHECK (`obra_id is not null or processo_id is not null`).

**Alterações**: `ObraMedicoes.tsx` (prop `processoId?`, `setItemProgresso`/`setItemProximaMedicao` recebem `processoId`, `abrirHistorico` com filtro três-vias, `TABS_PROCESSO` mostra só Avanço físico + Boletins + Diário — Mão de obra/Gerenciamento continuam presos a `obraId`, omitidos em vez de mostrados quebrados), `ObraBoletins.tsx` (mesmo padrão: listagem/criação/fechamento com filtro `obraId`/`processoId`), `lib/types.ts` (`Medicao.obra_id` nullable + `processo_id`), `/processos/[id]/page.tsx` (aba "Medições").

**Migration**: `20260910130000_medicoes_processo_id.sql` (aplicada).

**Teste real**: avanço físico gravado via `processo_id` em `planejamento_itens` (mesma fonte única do Planejamento), boletim criado→fechado (snapshot em `medicao_itens`), histórico lido de volta pelo filtro `processo_id`, limpeza sem órfãos. Regressão: tabela `medicoes` sem contaminação cruzada obra/processo.

**Resultado**: **PASS PARCIAL**. `processo_id` canônico para Avanço físico + Boletins. CRUD testado. Legado preservado. **Pendência**: "Mão de obra" e "Gerenciamento" (`ObraMedicaoMaoObra.tsx` + `ObraEixoAvanco.tsx` + `ObraAjusteDistribuicao.tsx`) continuam presos a `obraId` — não integrados nesta rodada (superfície separada, com sua própria lógica de agregação por `eixo`; ver módulo 6/7 abaixo, que compartilham a mesma raiz de causa).

---

## 4. RDO (Diário de Obra)

**Estado encontrado**: `ObraRdo.tsx` com `obraId: string` obrigatório, usado **só** em `/canteiro/[id]` (não em `/obras/[id]` desktop — comentário do próprio arquivo estava desatualizado). Tabela `rdo`: `obra_id NOT NULL`, sem `processo_id`, DDL original não versionado no repo (criada antes do rastreamento de migrations). Numeração sequencial calculada no client, sempre por `obra_id`.

**Componentes/tabelas**: `ObraRdo.tsx`; tabela `public.rdo`.

**Dependências**: `lib/luizia-tools.ts` e `lib/ai-obra-tools.ts` também escrevem em `rdo` com `obra_id` fixo — **fora de escopo** por instrução explícita (sem automação WhatsApp/Luiza autônoma nesta rodada), não tocados.

**Decisão**: **B** — mesmo padrão de Medições: `obra_id` nullable, `processo_id` nullable + índice + CHECK.

**Alterações**: `ObraRdo.tsx` (prop `processoId?`, todas as queries — listagem, descoberta de orçamentos, numeração sequencial, insert/update, elo com `setItemProgresso` — com filtro `obraId`/`processoId`), `lib/types.ts` (`Rdo.obra_id` nullable + `processo_id`), `ObraMedicoes.tsx` (sub-aba "Diário (RDO)" reabilitada para Processo).

**Migration**: `20260910140000_rdo_processo_id.sql` (aplicada).

**Teste real**: RDO criado/editado via `processo_id`, numeração sequencial funcionando, leitura de volta pelo filtro exato da UI, limpeza sem órfãos. Regressão: tabela `rdo` sem contaminação, `/canteiro/[id]` inalterado.

**Resultado**: **PASS**. `processo_id` canônico. CRUD testado (abrir/listar/criar/editar/consultar/excluir, exatamente como o legado permite). Legado preservado. Automação Luiza/WhatsApp/SINAPI explicitamente fora de escopo, não afetada.

---

## 5. Compras/Suprimentos

**Estado encontrado** (auditoria completa via agente dedicado): fluxo `requisicoes_compra` → `cotacoes` → `compra_itens` (auto-criado ao marcar cotação vencedora), mais `materiais`/`listas_compra`/`fornecedores`. **4 tabelas com `obra_id NOT NULL`** (`compra_itens`, `materiais`, `requisicoes_compra`, `listas_compra`) e **nenhuma com `processo_id`**. `ComprasLancamentos.tsx`, `ObraMateriais.tsx`, `ObraRequisicoes.tsx`, `ObraFornecedores.tsx` — todos com `obraId: string` obrigatório, sem qualquer `etapaContexto`-like.

**Raio de explosão confirmado**: `compra_itens`/`materiais` são lidos por `lib/financeiro.ts`, 6+ RPCs SQL do Portal do Cliente, `FinanceiroObrasWidget`, `ControleFinanceiro.tsx`, `RelatorioCliente.tsx`, `PortfolioResumo.tsx`, WhatsApp/Luiza (`lib/luizia-tools.ts`) — todos presumindo `obra_id` sempre presente, sem tratamento de `null`. `lib/materiais-sync.ts`'s RPC (`sincronizar_materiais_orcamento`) **lança exceção** se `obra_id` for nulo (`raise exception 'obra_id e orcamento_id sao obrigatorios'`) — não é um no-op silencioso, é um bloqueio ativo.

**Decisão**: nenhuma implementada. Classificação técnica seria **B** (mesmo padrão das tabelas anteriores), mas a superfície de consumidores afetados é qualitativamente maior — não uma tela e um componente, mas ~15 pontos de leitura espalhados por Financeiro, Portal, Dashboard, Relatórios e IA, nenhum com fallback para ausência de `obra_id`.

**Resultado**: **BLOQUEADO**. Justificativa: integrar exigiria (a) tornar `obra_id` nullable em 4 tabelas, (b) generalizar 4 componentes de Compras, e (c) auditar e ajustar individualmente cada um dos ~15 consumidores externos (a maioria RPCs SQL do Portal, que não podem ser testadas via UI) para não quebrar quando `obra_id` for nulo — isso é reconstrução substancial, não um incremento mecânico como Tarefas/Medições/RDO. Marcar como concluído sem essa auditoria arriscaria regressão silenciosa em Financeiro/Portal, que são superfícies com dinheiro real. Não integrado nesta rodada; recomendação de tratar como iniciativa própria.

---

## 6. Financeiro

**Estado encontrado**: `lib/financeiro.ts` (`loadFinanceiroResumo`) hardcoded a `obraId: string`, consulta `etapas`/`compra_itens` filtrados por `obra_id`. UI: `ObraAvancoFinanceiro.tsx`, também `obraId`-only. Lógica de "comprometido/pago/saldo" duplicada em 3 lugares (lib/financeiro.ts, RPCs do Portal, `ControleFinanceiro.tsx`).

**Dependência direta do módulo 5**: Financeiro lê `compra_itens` como fonte de "realizado/pago" — sem Compras integrado, Financeiro não tem dado real de Processo para mostrar (ficaria sempre zerado ou teria que reimplementar uma segunda fonte, o que violaria a regra de não duplicar cálculo).

**Resultado**: **BLOQUEADO** (dependência direta do módulo 5, mesma classe de risco — raio de explosão compartilhado com Compras). Não integrado nesta rodada.

---

## 7. Financiamento

**Estado encontrado**: `ObraFinanciamentoMedicao.tsx` (~1400 linhas), 6 tabelas (`financiamento_itens`, `financiamento_medicoes`, `financiamento_medicao_itens`, `financiamento_cronograma_banco`, `obra_fontes_recursos`, `obra_reembolsos`), nenhuma com `processo_id`, todas RLS permissivas. Domínio de liberação de recursos bancários atrelado a % de medição — depende estruturalmente do módulo 3 (Medições, parcialmente integrado) e do módulo 5 (Compras/pagamento, bloqueado).

**Resultado**: **BLOQUEADO**. Justificativa: 6 tabelas sem `processo_id`, componente de maior porte do sistema, e dependência funcional de Medições completo (mão de obra/gerenciamento, ainda pendente) e Compras (bloqueado). Reconstrução substancial — não improvisado, per instrução explícita da rodada. Não integrado.

---

## 8. Projeto Técnico + Arquivos

**Estado encontrado**: "Projeto Técnico" **não tem nenhuma implementação de domínio** — é só uma chave vazia no registry (`lib/processo/domain/module-registry.ts`), o termo só aparece como texto de prompt de IA ou sinônimo do WhatsApp-bot para a raiz legada `projetos`. Arquivos: fragmentados em 4 tabelas sem relação entre si (`obra_files`, `project_item_files`, `board_files`, `prospeccao_arquivos`), nenhuma com `processo_id`; a maioria dos tipos de arquivo em `ObraArquivos.tsx` não usa Supabase Storage de verdade (PDF → base64 inline; outros tipos → só metadado).

**Resultado**: **BLOQUEADO**. Justificativa: "Projeto Técnico" exigiria uma decisão de produto sobre o que essa capacidade deveria conter — não existe conceito, tabela ou tela legada para reaproveitar, e a instrução da rodada proíbe inventar funcionalidade nova. Arquivos tem dívida técnica pré-existente (fragmentação em 4 tabelas, armazenamento inconsistente) que tornaria qualquer integração um retrabalho maior que um incremento — reconstrução substancial, não escopo desta rodada. Não integrado.

---

## 9. Relatórios

**Estado encontrado**: não há tabela própria de relatório (bom — zero risco de segunda fonte de verdade), mas os três componentes existentes (`PortfolioResumo.tsx`, `ControleFinanceiro.tsx`, `RelatorioCliente.tsx`) são escopados por `obraId`/`useObraOrcamento()`, sem qualquer caminho por `processoId`, e derivam dados de Compras/Financeiro/Medições — módulos 5 e 6 bloqueados, módulo 3 parcial.

**Resultado**: **BLOQUEADO** (dependência dos módulos 5/6, que não estão prontos — um relatório de Processo hoje só poderia mostrar Orçamento/Planejamento/Tarefas/Medições parciais, não o conjunto que o usuário esperaria de "Relatórios"). Não integrado.

---

## Matriz final

| MÓDULO | ESTADO ANTES | RESULTADO P4.2 | PROCESSO_ID CANÔNICO? | CRUD TESTADO? | LEGADO PRESERVADO? | PENDÊNCIA |
|---|---|---|---|---|---|---|
| Tarefas + Board | obra/projeto only | **PASS** | Sim | Sim | Sim | Nenhuma |
| Execução | inexistente | **NÃO IMPLEMENTADO NO LEGADO** | N/A | N/A | N/A | Coberto por Planejamento (P4.1) |
| Medições | obra only | **PASS PARCIAL** | Sim (Avanço físico + Boletins) | Sim | Sim | Mão de obra/Gerenciamento seguem obraId-only |
| RDO | obra only, só /canteiro | **PASS** | Sim | Sim | Sim | Automação Luiza/WhatsApp fora de escopo (por instrução) |
| Compras/Suprimentos | obra only, 4 tabelas NOT NULL | **BLOQUEADO** | Não | Não | Sim (nada alterado) | Raio de explosão ~15 consumidores; reconstrução substancial |
| Financeiro | obra only | **BLOQUEADO** | Não | Não | Sim (nada alterado) | Depende de Compras |
| Financiamento | obra only, 6 tabelas | **BLOQUEADO** | Não | Não | Sim (nada alterado) | Depende de Medições completo + Compras |
| Projeto Técnico + Arquivos | sem domínio / 4 tabelas fragmentadas | **BLOQUEADO** | Não | Não | Sim (nada alterado) | Decisão de produto necessária; dívida técnica pré-existente |
| Relatórios | sem tabela própria, obra only | **BLOQUEADO** | Não | Não | Sim (nada alterado) | Depende de Compras/Financeiro |

---

## Não regressão

- `/obras`: inalterado — todos os componentes tocados (`ObraMedicoes`, `ObraBoletins`, `ObraRdo`) continuam recebendo `obraId` exatamente como antes; `obraId` virou opcional no tipo, não removido do comportamento.
- `/projetos`: inalterado — nenhum destes componentes era usado na fase Projeto (confirmado por grep, Medições/RDO/Tarefas-no-Projeto nunca existiram lá exceto Tarefas, que já suportava `projetoId` e continua suportando).
- Orçamento e Planejamento do Processo (P4.1): inalterados nesta rodada — não foram tocados.
- Migrations aplicadas são todas aditivas (`add column if not exists`, `drop not null`, índice parcial, CHECK que sempre passa em dados existentes) — nenhum dado apagado ou reescrito.
- Nenhum segredo/token entrou no repositório.

## Migrations aplicadas (Supabase `jwezrjyatfjvvsugtugo`, todas versionadas no repo)

1. `20260910120000_tarefas_processo_id.sql`
2. `20260910130000_medicoes_processo_id.sql`
3. `20260910140000_rdo_processo_id.sql`

## Recomendação objetiva para o teste real da Allegra

A Allegra (Obra "Resid. Jardim Allegra") **não foi tocada** nesta rodada — nenhuma migration ou alteração de componente afeta dados existentes de obra (todas as mudanças são aditivas e testadas isoladamente via Processo "Teste 1"). É seguro testar os módulos PASS (Tarefas, RDO) e PASS PARCIAL (Medições — Avanço físico + Boletins) contra a Allegra **como Obra**, já que o comportamento obra_id-only está structurally idêntico ao anterior à rodada.

Para testar via **Processo** (a peça nova): recomenda-se criar um Processo de teste dedicado a partir dos dados da Allegra (clonar orçamento, não migrar a Obra em si) antes de qualquer teste real com a Allegra como Processo — a tarefa explicitamente proíbe migrar/usar a Allegra como Processo nesta fase, e isso deve continuar até haver uma decisão de produto explícita sobre o momento da migração real Obra→Processo.

Não recomendo avançar para Compras/Financeiro/Financiamento/Projeto Técnico+Arquivos/Relatórios sem antes: (1) decidir o escopo de "Projeto Técnico" como decisão de produto; (2) planejar como uma iniciativa própria (não uma rodada de P4.2) a generalização de Compras — dado seu raio de explosão sobre Financeiro/Portal/Dashboard/Relatórios/Luiza, ela deveria ser auditada e testada com o mesmo rigor usado nas rodadas de Fase 4/5 do Orçamento (ver plano `Reconstrução de Orçamento + Planejamento`), não comprimida em um módulo do P4.2.
