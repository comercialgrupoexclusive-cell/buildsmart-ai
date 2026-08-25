# Hotfix pré-reunião — Investidor

Resumo objetivo do que foi corrigido, validado e o gap real que ficou documentado (não implementado), conforme a própria instrução do hotfix de não avançar arquitetura nova quando o ajuste exigisse mudança grande.

## Contexto: retomada de um hotfix interrompido

Este hotfix havia sido iniciado por uma sessão anterior ("codex") que travou no meio. Ao retomar, foi encontrado:

- Duas migrations do Marco 8 (`investidor_agentes`, `investidor_rotinas`, `investidor_rotina_runs`, seed de um "Agente de Prospecção" + rotina "Triagem semanal de prospecções", função `investidor_executar_rotina()`) já aplicadas ao vivo no Supabase, mas sem commit no git.
- Uma coluna (`prospeccao_cenarios.tipo_aquisicao`) também já aplicada ao vivo via SQL direto, fora do controle de migrations.
- Uma **regressão real**: a migration do Marco 8 reescreveu o CHECK constraint `luizia_pending_task_actions_tool_check` a partir de uma cópia desatualizada do array de tools, derrubando `create_evidencia` (adicionado numa rodada anterior) — ou seja, confirmar uma evidência proposta pela Luiza estava quebrado em produção.
- Em paralelo, `main` já havia recebido commits próprios (Marco 8 completo + uma correção de escopo do Web Search) depois do ponto em que este hotfix começou.

Ações tomadas: a regressão do `create_evidencia` foi corrigida com uma migration corretiva aplicada ao vivo e commitada; o restante do trabalho de Marco 8 (Rotinas/Agentes) **não foi construído em cima** — apenas reconciliado, pois o próprio hotfix proíbe explicitamente novos agentes/rotinas. O merge com `main` reconciliou as duas linhas de desenvolvimento paralelas sem perder trabalho de nenhum dos dois lados (detalhe técnico no commit de merge).

## 1. Prospecções — CRUD

Adicionada exclusão (criar/ver/editar já existiam). Exige confirmação; bloqueia exclusão se a prospecção já foi convertida em Ativo (orienta a excluir o Ativo/Projeto em vez disso, já que o histórico fica vinculado a ele).

## 2. Prospecções — Análise (Compra direta vs Leilão)

Nova dimensão `tipo_aquisicao` (`leilao` | `compra_direta`), independente de `modalidade` (à vista/SAC/PRICE). Compra direta zera a comissão de leiloeiro dentro do motor de cálculo existente (`lib/investidor-calculadora.ts`) — nenhum motor novo foi criado. Validado com um cenário real inserido em "São Manoel — Edifício Princesa" e com testes automatizados (comissão cobrada em leilão, ignorada em compra direta mesmo com o campo preenchido, funciona também com financiamento).

## 3. Evidências / Pesquisa

Nova aba "Evidências" na Prospecção (componente `ProspeccaoEvidencias.tsx`, mesmo padrão visual de Arquivos): descrição, fonte, link, data e natureza (observado/inferido/estimado). A Luiza já registra evidências via `propose_create_evidencia` (mais a correção da regressão acima). Não foi criada nenhuma plataforma nova de comparáveis — reaproveita a estrutura de evidências já existente.

## 4. Imóveis — UX

Ao abrir um Ativo (Project com `contexto='investimento'`), a aba inicial agora é **Visão Geral**, com as demais abas reorganizadas em ordem lógica (Estrutura, Orçamento, Cronograma, Tarefas, Board, Tour 360°, Dados Gerais, Assistente IA). Projects normais (`contexto='projeto'`) mantêm a ordem de abas original, sem alteração.

## 5. Orçamento preliminar ("A conferir")

`quantidade` e `preço unitário` de um item de orçamento agora aceitam `null` — nunca são forçados a zero na gravação. A UI mostra "A conferir" com destaque visual (cor de aviso) quando o valor está indefinido. Em agregados/exports (totais, Curva ABC), um item indefinido soma como 0 no cálculo — matematicamente correto para uma quantidade desconhecida, sem alterar o dado salvo.

## 6. Alertas da EAP / Cronograma — GAP DOCUMENTADO (não implementado)

**Investigação:** o mecanismo de EAP/Cronograma (`projeto_itens` + `projeto_item_dependencias`) guarda `responsavel` como texto livre (não há vínculo a `profiles`), não tem predicado de "bloqueada por predecessora não concluída", e não existe hoje nenhum mecanismo de aviso derivado de datas de `projeto_itens` (o sistema de Avisos existente cobre outros domínios, não este).

**Por que não foi implementado agora:** dar ao responsável avisos reais de "próxima/vencendo/atrasada" que respeitem predecessoras exigiria, no mínimo: (a) uma FK `responsavel_id` em `projeto_itens` (hoje é texto livre, não dá para notificar ninguém de forma confiável), (b) uma função/predicado que verifique se todas as predecessoras de um item estão concluídas antes de considerá-lo "liberado", e (c) um novo tipo de evento de aviso que hoje não existe. Isso é uma mudança de schema + lógica nova, não um ajuste — exatamente o que o hotfix pede para **não** fazer agora ("se isso exigir mudança grande, não implementar arquitetura nova").

**Gap real para decisão do usuário:** hoje, nenhuma atividade da EAP gera aviso automático por data ou por bloqueio de predecessora. Fica para uma rodada dedicada.

## 7. Francisco Bernardes — Alpes do Vale (dados reais)

Confirmado ao vivo no projeto (`contexto='investimento'`, responsável Luiz):

- **EAP completa** com as 4 etapas (Regularização, Preparação da Reforma, Reforma, Comercialização) e todos os itens/marcos pedidos, com as datas exatamente como informadas (nenhuma data inventada para DMI ou aprovação da Prefeitura — ficaram sem data, corretamente).
- **3 predecessoras** configuradas: Protocolo na Prefeitura → Projeto pronto; Cronograma da reforma → Orçamento da reforma; Reforma planejada → Cronograma da reforma.
- **Orçamento preliminar**: os 6 serviços da Reforma inseridos como "A conferir" (quantidade e preço nulos, nada inventado).
- **Tarefa**: criada "Verificar andamento da regularização na Prefeitura", responsável Luiz. Nota: como o sistema de Tarefas não tem recorrência nativa (ver gap acima, mesma família de limitação), a tarefa foi criada como uma tarefa única com a intenção de acompanhamento diário documentada na própria descrição — precisa ser reaberta manualmente enquanto o acompanhamento for necessário, até que uma rodada futura implemente recorrência real.
- Nenhum item da EAP foi copiado para Tarefas.

## Validação

- `npx tsc --noEmit`: limpo.
- `npx vitest run`: 159 testes passando (12 arquivos).
- `npm run build`: build de produção concluído com sucesso.
- Projects comuns (`contexto='projeto'`) confirmados intactos — nenhuma mudança de aba/ordem para eles.

## Commit

Branch de trabalho: `previsoes/prazo-fornecimento-material`. Merge com `main` (reconciliação com o Marco 8 e a correção de Web Search que chegaram em paralelo) e push direto para `main`, conforme instruído.
