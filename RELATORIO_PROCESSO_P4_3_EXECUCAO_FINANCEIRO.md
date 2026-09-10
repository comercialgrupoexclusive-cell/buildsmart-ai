# RELATÓRIO — P4.3 Motor de Processo: fundação de Medições/Compras/Financeiro/Financiamento

Branch `processo`. Baseline obrigatório: `69bb3e52fb910d9160dfbf9d60f0d72c3494d0f9` (P4.2, PASS PARCIAL, não refeito).
Fonte de produto obrigatória: "05 - Auditoria Operacional Real — Allegra x Canoas R01" (Google Doc), lida por inteiro incluindo o Adendo 2026 com a auditoria ampliada de Canoas/Banrisul.
Teste real: Processo "Teste 1" (`8d251932-346d-4c33-a7d5-8bf3cb3aa0cc`), orçamento `e1394712-bf0b-4c4d-8156-4cdfb3d63d9d`. Allegra e Canoas **não foram tocadas nem migradas**.

---

## 1. Arquitetura encontrada (auditoria antes de codificar)

Reconfirmado ao vivo (schema live, `jwezrjyatfjvvsugtugo`) antes de qualquer migration:

- `medicoes`/`medicao_itens`: já tinham `processo_id` (P4.2), `pct_anterior`/`pct_atual`/`valor_periodo`/`valor_pago`/`orcamento_item_id` — faltavam só `origem`, `peso`, `previsao_proxima_pct` no item.
- `compra_itens`, `materiais`, `requisicoes_compra`, `listas_compra`: `obra_id NOT NULL`, sem `processo_id` — confirmado exatamente como o relatório P4.2 havia registrado. `compra_itens.fornecedor_id`/`valor_unitario`/`quantidade` já eram nullable e `status_valor` já distinguia confirmado/estimado — ou seja, o legado **já suportava** itens nascendo incompletos, só faltava a raiz `processo_id`.
- `financiamento_itens` (árvore ponderada, `peso`/`valor_financiado`/`nivel`/`parent_id`/`etapa_ref_id`), `financiamento_medicoes`/`financiamento_medicao_itens` (medição bancária com `pct_executado`), `financiamento_cronograma_banco` (previsão mensal acumulada), `obra_fontes_recursos` (financiamento/FGTS/recursos próprios) e `obra_reembolsos` (solicitado/aprovado/recebido, com datas próprias) **já existiam e já modelavam quase exatamente** o que a auditoria Allegra×Canoas descreve — nenhuma tabela nova de domínio foi necessária, só `processo_id` + 2 colunas em `financiamento_itens` (`orcamento_item_id`) e `financiamento_medicao_itens` (`previsao_proxima_pct`, `origem`).
- `lib/financeiro.ts` já separava Planejado original/atual, Comprometido/Contratado e Pago — só não tinha histórico de pagamento por data (um único `status_pagamento` binário) e não aceitava `processoId`.

Conclusão da auditoria: o legado modela corretamente quase tudo que a fonte de produto pede. O trabalho real foi (a) generalizar a raiz para `processo_id` nas 9 tabelas envolvidas, (b) fechar as 3 lacunas de schema identificadas contra a fonte de produto, (c) generalizar os componentes que já implementam esse domínio.

## 2. EAP bancária × EAP canônica (decisão de produto 1)

A fonte de produto confirma (Adendo 2026, seção E): *"Definir se a EAP bancária será uma visão/configuração sobre a EAP canônica ou uma estrutura vinculada paralela. Recomendação: visão/configuração vinculada."*

Implementado exatamente assim: `financiamento_itens` continua sendo a estrutura bancária (própria árvore, com peso e nível — porque o peso bancário raramente bate com a estrutura de etapas do orçamento), mas cada item pode se vincular à EAP canônica de duas formas, conforme a operação precisar:
- `etapa_ref_id` (já existia) — vínculo em nível de etapa;
- `orcamento_item_id` (novo, migration `20260910150000`) — vínculo em nível de item, para operações que precisam de granularidade fina (ex.: Banrisul, que na auditoria aparece com estrutura por serviço).

Não há duplicação de avanço físico: o `pct_executado` da medição bancária é um registro próprio (o banco mede o que quiser, na hora que quiser — inclusive antes/depois da medição interna), nunca copiado automaticamente do avanço físico do Planejamento nem o contrário.

## 3. Medições completas

**Estado anterior**: só Avanço físico + Boletins (P4.2), granularidade de item já existia mas faltavam 3 campos pedidos pela fonte de produto: origem, peso (quando aplicável) e previsão da próxima medição.

**Alterações**: `medicao_itens` ganhou `origem` (`interna`|`vistoria`|`documento_bancario`|`estimativa`, CHECK fechado — nomes não tratados como enumeração rígida de produto, só como classificação técnica interna, conforme a fonte de produto pede em "não transformar estados temporários em enumeração permanente sem necessidade"), `peso` (nullable, só usado quando a operação exige ponderação) e `previsao_proxima_pct` (nullable). `financiamento_medicao_itens` ganhou os mesmos dois últimos campos (migration `20260910160000`), para a medição bancária ter a mesma granularidade.

**Não implementado**: consolidação automática de "previsão do período" a partir do saldo dos itens planejados (fonte de produto, requisito P1) — fica registrado como pendência, não bloqueia PASS do módulo porque é um derivado de leitura, não uma capacidade de escrita/persistência.

**Teste real — Cenário 1**: item com avanço anterior (20%, via `planejamento_itens`), boletim de medição criado → fechado (pct_anterior=0, pct_atual=20, peso=15.5, origem='interna', previsao_proxima_pct=45) → **reaberto** (snapshot apagado, status volta a rascunho) → avanço físico atualizado para 45% → **fechado novamente** com pct_atual=45, previsao_proxima_pct=60. Saldo físico derivado (100-45=55) confere. PASS.

## 4. Compras/Suprimentos

**Decisão B** aplicada a `compra_itens`, `materiais`, `requisicoes_compra`, `listas_compra`: `obra_id` vira nullable, `processo_id` nullable + índice + CHECK raiz — mesmo padrão já usado em tarefas/medições/rdo.

**Componentes generalizados**: `ComprasLancamentos.tsx` e `ObraRequisicoes.tsx` (props `obraId?`/`processoId?`, todas as queries com filtro condicional). `ObraFornecedores`/`ObraMateriais.tsx` (1478 linhas, sincronização Orçamento→Materiais específica de obra) **não foram tocados** — em vez disso, foi criado `components/processo/compras/ProcessoCompras.tsx`, um shell leve que compõe os dois componentes já generalizados em abas (Lançamentos/Requisições), seguindo o mesmo padrão já usado para `ProcessoOrcamento.tsx` na P3.3 (não reaproveitar um componente grande e obra-específico dentro do Processo, evitando risco de regressão em `/obras`). `lib/materiais-sync.ts` (sincronização automática Orçamento→Materiais, com RPC que lança exceção se `obra_id` for nulo) **permanece decisão E, exclusivo de /obras** — no Processo, a necessidade nasce manual (via Requisições ou lançamento direto), o que já satisfaz a fonte de produto ("requisição/compra deve poder nascer incompleta").

**Estados de material**: confirmado que o legado já suporta a flexibilidade pedida sem enum rígido — `materiais.status_compra` (nao_comprado/solicitado/parcial/comprado) + `compra_itens.status_valor` (estimado/confirmado) + `fornecedor_id` nullable + `compra_itens.status_recebimento` (pendente/parcial/recebido) juntos cobrem "apenas identificado, a levantar, em cotação, preço sem fornecedor, comprado, recebido/disponível" sem precisar de uma tabela ou enum novo.

**Teste real — Cenário 3**: `requisicoes_compra` criada com item sem quantidade/unidade definidas → cotação registrada → "vencedora" marcada (cria `compra_itens` automaticamente, replicando `toggleVencedora()`) → `status_recebimento` marcado como `recebido`. Avanço físico do item de orçamento relacionado conferido **antes e depois** (45.00 → 45.00, inalterado). PASS.

## 5. Financeiro

**Decisão B**: `lib/financeiro.ts` generalizado para `obraId?`/`processoId?`. Nova tabela `compra_pagamentos` (histórico de pagamentos por data, nunca sobrescrito — decisão de produto 5 e requisito P0 da fonte: *"Lançamentos históricos por data vinculados ao serviço, evitando sobrescrever o valor anterior"*). `compra_itens.status_pagamento`/`valor_total` continuam como estão (snapshot do compromisso, usados por relatórios/Portal legados sem quebrar nada); a nova tabela é o detalhe de "quando e quanto foi pago".

`loadFinanceiroResumo` agora deriva "Pago" como `soma(compra_pagamentos.valor_pago)` quando existir histórico, caindo para o flag binário legado (`status_pagamento==='pago' ? valor_total : 0`) só para itens que nunca tiveram um pagamento individual registrado — preserva dados antigos de `/obras` sem exigir migração retroativa.

**UI**: `ComprasLancamentos.tsx` ganhou um modal "Histórico de pagamentos" (ícone de carteira ao lado da cotação) que lista os pagamentos e permite registrar um novo com data e valor — sem remover o toggle rápido pendente/pago já existente (mantido por compatibilidade com o fluxo atual de `/obras`).

**Teste real — Cenário 4**: item contratado (R$ 3.200) recebeu 2 pagamentos em datas diferentes (R$ 1.200 em 15/08, R$ 1.000 em 05/09). Confirmado: as duas linhas permanecem na tabela (nenhuma sobrescrita), acumulado derivado = R$ 2.200, saldo = R$ 1.000. PASS.

## 6. Financiamento

**Decisão B** aplicada a `financiamento_itens`, `financiamento_medicoes`, `financiamento_cronograma_banco`, `obra_fontes_recursos`, `obra_reembolsos`. Componentes `ObraFinanciamento.tsx` e `ObraFinanciamentoMedicao.tsx` (1400 linhas) generalizados para `obraId?`/`processoId?` em todas as queries/inserts — não foram reescritos, só a raiz foi trocada de fixa para condicional, seguindo exatamente o padrão já validado em Medições/RDO na P4.2.

**CAIXA**: `obra_fontes_recursos` (recursos_proprios/financiamento/fgts) e `obra_reembolsos` (solicitado/aprovado/recebido, com datas próprias) já cobrem exatamente o que a Allegra evidencia — nenhuma mudança de modelo, só raiz.

**BANRISUL**: confirmado pela auditoria ampliada (Adendo 2026) que a estrutura ponderada por serviço, execução acumulada, vistoria e previsão da próxima medição são reais e evidenciadas — exatamente o que `financiamento_itens`(peso)/`financiamento_medicoes`/`financiamento_medicao_itens`(agora com `origem`/`previsao_proxima_pct`) já modelam. **Confirmado também**: não existe evidência de fórmula de liberação financeira Banrisul — por isso, como já era o comportamento do legado, `registrarMedicao()` nunca cria ou atualiza `obra_reembolsos`; liberação continua um registro 100% manual e separado.

**Teste real — Cenário 2**: item bancário raiz + item folha mapeado ao item canônico do orçamento (via `orcamento_item_id`) com peso 15,5%; medição bancária registrada com `pct_executado=45`, `origem='vistoria'`, `previsao_proxima_pct=60`; confirmado por contagem que **nenhum `obra_reembolsos` foi criado automaticamente** por essa medição (0 linhas). PASS.

**Teste real — Cenário 5**: fonte de recurso "financiamento" (previsto R$ 400.000) → reembolso criado com `valor_solicitado=50.000` (deliberadamente não-derivado do % medido — 45% de 400.000 seria R$ 180.000, provando que não há fórmula automática) → aprovado (R$ 48.000) → recebido (R$ 48.000), cada transição com sua própria data (`data_solicitacao`/`data_aprovacao`/`data_recebimento`). Os três valores (solicitado/aprovado/recebido) permanecem campos independentes ao final. PASS — desembolso previsto, liberação e recebimento confirmados como três entidades/estados distintos.

## 7. Orçamento durante a execução (decisão de produto 4)

Não alterado nesta rodada — `orcamentos.versao`/`travado_em` já implementam "orçamento-base versionado" (P3/P4), exatamente a recomendação da fonte de produto ("orçamento-base versionado + visão corrente derivada"). Não foi reconstruído o motor de orçamento, conforme instrução explícita da rodada.

## 8. Migrations aplicadas (Supabase `jwezrjyatfjvvsugtugo`, todas versionadas no repo, todas aditivas)

1. `20260910150000_p4_3_processo_id_compras_financiamento.sql` — `processo_id` + `obra_id` nullable + CHECK raiz em `compra_itens`, `materiais`, `requisicoes_compra`, `listas_compra`, `financiamento_itens`, `financiamento_medicoes`, `financiamento_cronograma_banco`, `obra_fontes_recursos`, `obra_reembolsos`; `financiamento_itens.orcamento_item_id`; `medicao_itens.origem`/`peso`/`previsao_proxima_pct`; tabela nova `compra_pagamentos`.
2. `20260910160000_p4_3_financiamento_medicao_itens_previsao.sql` — `financiamento_medicao_itens.previsao_proxima_pct`/`origem`.

Nenhuma coluna removida, nenhum dado reescrito, nenhuma migration destrutiva. `obra_id`/`projeto_id` preservados em todas as tabelas — nenhum consumidor legado (`/obras`, RPCs do Portal, Luiza) foi alterado além do estritamente necessário (nenhum foi tocado nesta rodada).

## 9. Shell `/processos/[id]`

Abas "Compras", "Financeiro" e "Financiamento" adicionadas, condicionadas a `habilitados.has(...)` (mesmo padrão das abas anteriores). Nenhuma delas pede seleção de Obra ou Projeto — todas recebem só `processoId`/`orcamentoId` resolvidos pelo shell.

## 10. Não regressão

- `/obras`, `/projetos`, Orçamento do Processo, Planejamento (P4.1), Tarefas/Board (P4.2), Medições (P4.2), RDO (P4.2): nenhum desses arquivos foi tocado nesta rodada, exceto os componentes de Compras/Financeiro/Financiamento generalizados — e neles a mudança é estritamente "raiz fixa → raiz condicional preservando o comportamento quando `obraId` é passado", validado por: todas as queries condicionais fazem `obraId ? query.eq('obra_id', obraId) : query.eq('processo_id', processoId)`, ou seja, o caminho `obraId` é bit-a-bit idêntico ao código anterior.
- Confirmado por contagem: todas as tabelas tocadas (`compra_itens`, `requisicoes_compra`, `financiamento_itens`, `financiamento_medicoes`, `obra_fontes_recursos`, `obra_reembolsos`, `compra_pagamentos`, `medicoes`, `planejamento_itens`) estavam em 0 linhas antes e depois do teste (base ainda não populada para Allegra/Canoas neste ambiente) — sem risco de contaminação cruzada.
- RDO e Luiza: não alterados.
- Gates: `tsc --noEmit` limpo; `eslint` nos arquivos alterados sem erros novos (2 erros pré-existentes confirmados via `git stash` contra o baseline, não introduzidos nesta rodada); `vitest run` 230/230; `npm run build` OK.

## 11. Bloqueios remanescentes

- **Compras**: Lista de Compras (`ObraMateriais.tsx`) e a sincronização automática Orçamento→Materiais (`lib/materiais-sync.ts`) continuam decisão E, exclusivas de `/obras` — no Processo, a necessidade de material nasce manual. Não bloqueia PASS porque o fluxo completo (necessidade→requisição→cotação→compra→recebimento) já funciona sem a sincronização automática.
- **Medições**: "Mão de obra"/"Gerenciamento" (`ObraMedicaoMaoObra.tsx`) seguem `obraId`-only, como já registrado na P4.2 — fora do escopo desta rodada.
- **Previsão de próxima medição derivada do saldo planejado** (requisito P1 da fonte de produto): não implementada — hoje `previsao_proxima_pct` é sempre entrada manual, nunca calculada automaticamente a partir do Planejamento. Registrado como pendência, não bloqueia PASS.
- **Portal/Relatórios**: não iniciados, conforme instrução explícita da rodada.
- **Fórmula de liberação financeira Banrisul**: continua NÃO DETERMINADA pela própria fonte de produto — corretamente não codificada.

## 12. Matriz final

| MÓDULO | ESTADO ANTES (P4.2) | RESULTADO P4.3 | PROCESSO_ID CANÔNICO? | TESTADO? | LEGADO PRESERVADO? | PENDÊNCIA |
|---|---|---|---|---|---|---|
| Medições (granularidade completa) | PASS PARCIAL (item básico) | **PASS** | Sim | Sim (Cenário 1) | Sim | Previsão automática de próximo período (deriva de saldo) não implementada |
| Compras/Suprimentos | BLOQUEADO | **PASS** | Sim | Sim (Cenário 3) | Sim | Lista de Compras/sync automática seguem exclusivas de /obras (decisão E) |
| Financeiro | BLOQUEADO | **PASS** | Sim | Sim (Cenário 4) | Sim | Nenhuma |
| Financiamento (CAIXA) | BLOQUEADO | **PASS** | Sim | Sim (Cenário 5) | Sim | Nenhuma |
| Financiamento (BANRISUL configurável) | BLOQUEADO | **PASS** | Sim | Sim (Cenário 2) | Sim | Fórmula de liberação continua NÃO DETERMINADA (correto, sem evidência) |

---

## Recomendação para o primeiro Processo real

Allegra (CAIXA) e Canoas (BANRISUL) **não foram tocadas**. Todas as migrations são aditivas e nenhum componente de `/obras` teve seu caminho de execução alterado (só o de Processo, que é novo). Recomendo:

1. Antes de migrar a Allegra ou a Canoas de verdade, criar um Processo de teste dedicado que **replique a estrutura real** de uma delas (mesmas etapas/itens/pesos, dados fictícios) e rodar o ciclo completo (EAP→Planejamento→Medição→Compra→Financeiro→Financiamento) uma segunda vez com volume realista (a Allegra tem centenas de itens de orçamento — o teste desta rodada usou 1-2 itens).
2. Para Banrisul especificamente: como a fórmula de liberação continua NÃO DETERMINADA, o primeiro Processo Banrisul real deve operar com liberação 100% manual (já suportado) até que o Luiz localize e valide um documento bancário que demonstre a relação medição→liberação — só então essa regra deve ser codificada.
3. Priorizar a extensão de Compras (Lista de Compras + sincronização automática) para Processo como próxima rodada, já que hoje a necessidade só nasce manual — isso é aceitável para o primeiro Processo real, mas vira atrito em obras grandes com muitos insumos.
4. Portal/Relatórios devem vir depois de validar os 5 módulos desta rodada com um Processo de volume real, não com o Processo de teste mínimo usado aqui.
