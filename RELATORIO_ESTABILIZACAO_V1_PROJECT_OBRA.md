# Relatório — Rodada de Estabilização V1 (Project → Iniciar Obra → Orçamento → Planejamento → Execução/Progresso)

Escopo: auditar e corrigir **somente** inconsistências comprovadas no fluxo acima, sem refatoração arquitetural, sem unificar Project/Obra e sem migrar para V2. Investigação feita com 3 agentes de leitura em paralelo (Planejamento, fontes de progresso, vínculo Project×Obra×Orçamento) + verificação ao vivo via Supabase MCP (somente leitura, nenhuma escrita em dado real) contra **Resid. Jardim Allegra**, o caso de regressão pedido.

---

## 1. Project × Obra × Orçamento — vínculo do orçamento

### FATO ENCONTRADO
Reproduzido com dado real, não hipotético: o projeto "2025_02 - Residência D&R" (Jardim Allegra, `projetos.id=5f267bb8…`, `obra_id=5d4f844a…`) tem **dois orçamentos desconectados**:
- `92b55988…` "2025_02 - Residência D&R" — `projeto_id` preenchido, `obra_id` nulo, **0 itens, 0 etapas**, `is_principal=true`.
- `3a426d94…` "Orçamento Executivo Allegra - V1" — `obra_id` preenchido, `projeto_id` nulo, **68 itens, 17 etapas**, `is_principal=true`.

`ProjetoOrcamentosPanel.tsx` buscava orçamentos só com `.eq('projeto_id', projetoId)` (`load()`, antiga linha 51). Resultado real: abrir a aba "Orçamento"/"Planejamento" do Project mostrava e selecionava por padrão o orçamento **vazio** — o orçamento real de 68 itens ficava completamente invisível do lado do Project, só acessível pela tela da Obra.

### CAUSA
`iniciar_obra_por_orcamento` (RPC de "Iniciar Obra") **nunca rodou para este par** — confirmado pela ausência de linhas em `orcamento_itens_baseline`/`planejamento_itens_baseline` para o orçamento de 68 itens (a RPC sempre grava baseline ao promover). O orçamento real foi vinculado à obra por outro caminho (ex.: cadastro direto da obra), que seta `obra_id` sem popular `projeto_id`. Como a RPC normal **preserva** `projeto_id` ao promover (`set obra_id = v_obra_id, status = 'ativo'` — não toca `projeto_id`, migration `20260816203125…sql:175`), o problema não é sistêmico no fluxo padrão; é específico de orçamentos vinculados por fora dele.

### CORREÇÃO
`components/projeto/ProjetoOrcamentosPanel.tsx`:
- `load()` agora busca também `orcamentos` por `.eq('obra_id', obraId)` (quando o projeto já tem `obra_id`) e mescla com a busca por `projeto_id`, deduplicado por `id` — função pura extraída `mesclarOrcamentosPorProjetoEObra()`. Nenhuma escrita, nenhuma migração de dado — só passa a **enxergar** o orçamento que já existe.
- Seleção padrão (`escolherOrcamentoPadrao()`) passa a priorizar o orçamento com `obra_id` preenchido (o que reflete a execução real) sobre `is_principal` (marcação da fase de projeto, que pode ter ficado no orçamento errado).
- `app/(app)/projetos/[id]/page.tsx`: passa `obraId={projeto.obra_id}` para o painel (antes não era passado).

Isso também resolve, para este caso real, o sintoma do item 2 (Planejamento vazio) — ver seção 2.

### TESTE
`lib/__tests__/estabilizacao-v1-project-obra.test.ts` (7 testes) — usa os IDs e números reais de Allegra: confirma que o orçamento de 68 itens aparece mesmo com `projeto_id` nulo, que a deduplicação funciona no fluxo normal (mesmo orçamento nas duas buscas), e que a seleção padrão escolhe o orçamento operacional mesmo quando o rascunho vazio é `is_principal`. Verificado também ao vivo (SQL somente leitura) que a união das duas buscas retorna os dois orçamentos reais de Allegra.

### RISCO / PENDÊNCIA V2
- A causa raiz de **como** o orçamento ficou vinculado à obra sem passar pela RPC não foi determinada com certeza (não há log de auditoria desse vínculo) — os candidatos são o cadastro direto de obra (`NovoCadastroModal.tsx`) e a tela de vincular/desvincular orçamento (`app/(app)/orcamentos/[id]/page.tsx:91-118`, que faz `.update()` direto em `obra_id`/`projeto_id` sem nenhuma checagem de idempotência ou de orçamento já existente no destino). Nenhuma dessas telas foi alterada nesta rodada (não há reprodução de um novo incidente causado por elas, só a suspeita razoável de terem causado o de Allegra no passado) — **adicionar uma checagem antes de vincular um orçamento a uma obra/projeto que já tem outro** é uma melhoria de V2.
- Os dois orçamentos de Allegra continuam existindo como dois registros separados no banco — a correção só os torna visíveis e prioriza o correto por padrão; **não os funde**. Decidir se e como aposentar/arquivar o rascunho vazio é uma decisão de produto, não uma correção de bug, e fica para V2 ou para uma ação manual deliberada.

---

## 2. Planejamento da obra (idempotência)

### FATO ENCONTRADO
Confirmado ao vivo: o orçamento real de Allegra (`3a426d94…`) tem **17 etapas e 68 itens completos** (todos com `etapa_id`/`obra_id` corretamente preenchidos — 0 nulos), mas **zero linhas em `planejamento_itens`**.

### CAUSA
Por desenho, não é um bug isolado: `planejamento_itens` é uma tabela de **overlay** (datas/status/progresso/predecessoras), nunca uma cópia da estrutura do orçamento. `ObraPlanejamento2.tsx` monta a árvore em memória a partir de `etapas`/`orcamento_itens` (`buildTree()`, `load()`) e só cria uma linha em `planejamento_itens` na primeira edição de um nó (`upsertPlan()`/`ensurePlanId()`) — nunca em lote. Isso significa que **a árvore do Planejamento já é montada inteira a partir do orçamento independentemente de existir linha em `planejamento_itens`** — cada nó sem linha aparece com status "não iniciado" e sem datas, não desaparece.

Ou seja: o "Fato observado" (planejamento_itens vazio com orçamento completo) é esperado e, por si só, **não impede a árvore de aparecer completa** — desde que a etapa tenha `obra_id` certo e o item tenha `etapa_id` certo (que é exatamente o que já está correto para Allegra). O sintoma real de "Planejamento vazio" que o usuário via para Allegra tinha a mesma causa do item 1: a tela era aberta apontando para o orçamento vazio (0 etapas/0 itens), não para o real.

### CORREÇÃO
Nenhuma mudança em `ObraPlanejamento2.tsx` foi necessária — a arquitetura de overlay já garante representação consistente de todo item válido do orçamento, de forma idempotente por construção (nada é recriado, cada nó é lido direto do orçamento a cada carregamento). A correção do item 1 (`ProjetoOrcamentosPanel` passar a resolver o orçamento certo) já resolve o sintoma para o caso real.

### TESTE
Verificado ao vivo: `select count(*) from etapas where orcamento_id = '3a426d94…' and obra_id is null` → 0; mesmo para `orcamento_itens.etapa_id is null` → 0. Confirma que a árvore de Allegra está apta a renderizar completa assim que o orçamento certo for aberto (item 1).

### RISCO / PENDÊNCIA V2
Existe uma classe de bug já vista antes neste projeto (migration `20260816231701_backfill_etapas_orcamento_id.sql`, que corrigiu 72 linhas de `etapas.orcamento_id` nulo): se uma etapa futura ficar com `obra_id` nulo, ou um item de orçamento ficar com `etapa_id` nulo, ela **desaparece silenciosamente** da árvore do Planejamento (sem erro, sem aviso) — mesmo aparecendo normalmente na aba Orçamento. Não há hoje nenhuma validação/alerta para esse caso. Não é um bug comprovado agora (Allegra está íntegra), mas é um ponto frágil sem rede de segurança — candidato a uma validação leve (ex.: alerta "N itens do orçamento não aparecem no Planejamento") em V2.

---

## 3. Progresso / Avanço físico

### FATO ENCONTRADO
Mapeamento completo (tabela TELA → CAMPO LIDO → CAMPO GRAVADO → REGRA DE CÁLCULO) documentado a partir da investigação — resumo dos achados mais relevantes:

| Tela | Campo lido | Campo gravado | Regra |
|---|---|---|---|
| `ObraPlanejamento2.tsx` / `ObraMedicoes.tsx` / `ObraRdo.tsx` (fonte única) | `planejamento_itens.progresso_executado` via `lib/planejamento-progresso.ts` | `planejamento_itens.progresso_executado` | Item = direto; Subetapa/Etapa = média ponderada por valor |
| `ObraCronograma.tsx` (cronograma legado) | `etapas`/`subetapas_cronograma`/`servicos_cronograma`.`percentual_executado` | idem, por nível, sem propagação ao pai | Nenhuma — grava o valor digitado, sem recalcular o pai |
| `canteiro/[id]/page.tsx` (Canteiro, item do menu principal) | idem legado | só `subetapas_cronograma.percentual_executado` | Nenhum rollup para a etapa — etapa fica desatualizada |
| `PortfolioResumo.tsx`, `app/api/whatsapp/dispatch/route.ts` | `medicoes.percentual_executado` **sem filtrar `eixo`** | read-only | Direto do campo — pode pegar medição de mão de obra/gerenciamento em vez de física |
| `ObraFinanciamentoMedicao.tsx` | mistura `etapa.percentual_executado` (legado) com subetapas da fonte única, na mesma árvore | — | Duas fontes lado a lado na mesma tela |
| `RelatorioCliente.tsx` (PDF ao cliente) | só o legado | — | Nunca reflete o que foi lançado em Planejamento 2.0/Medições/RDO |
| Dois assistentes de IA | `ObraAssistenteIA`→`/api/obra-ai` grava no legado; "Luiza" (`LuiziaFloatingChat`)→`/api/buildassist` grava na fonte única | — | Pedir a mesma coisa num ou noutro assistente atualiza tabelas diferentes |

### CAUSA
Existem **dois sistemas de progresso paralelos e não sincronizados**: o cronograma legado (`etapas`/`subetapas_cronograma`/`servicos_cronograma`.`percentual_executado`, editável em várias telas ainda ativas) e a "fonte única" mais nova (`planejamento_itens.progresso_executado`, `lib/planejamento-progresso.ts`, para a qual só uma parte das telas foi migrada em rodadas anteriores — ver `RELATORIO_MOBILE_ORCAMENTO_LIMPEZA_BASE.md` e as migrations de agosto/2026). Nenhum gatilho de banco ou hook de aplicação sincroniza os dois lados. **Isto é um problema estrutural** — unificá-lo exigiria migrar todas as telas legadas (Cronograma, Canteiro, RelatorioCliente, WhatsApp, `obra-ai`) para a fonte única, o que é uma mudança grande e está fora do escopo desta rodada ("não inventar nova fonte", "não fazer refatoração arquitetural grande").

### CORREÇÃO (mínima, aplicada)
Duas leituras de `medicoes.percentual_executado` que **não filtravam `eixo`** foram corrigidas para `.eq('eixo', 'fisico')`, alinhando com o que `ObraBoletins.tsx` já fazia corretamente:
- `components/relatorios/PortfolioResumo.tsx` — card "Avanço físico" do dashboard de portfólio.
- `app/api/whatsapp/dispatch/route.ts` — resumo de obra enviado por WhatsApp.

`medicoes.eixo` é `not null default 'fisico'` (migration `20260809034500…`), então o filtro nunca exclui indevidamente uma medição física real — é uma correção de leitura sem risco.

**Não corrigido nesta rodada** (fica para V2, por ser parte do problema estrutural acima, e por uma exceção explícita do escopo): `components/layout/LuiziaFloatingChat.tsx` também lê `medicoes` sem filtrar `eixo` — mas esse arquivo é parte da Luiza, e a instrução desta rodada foi explícita: **"não mexer em Luiza"**. Registrado aqui, não alterado.

### TESTE
As duas correções são filtros de leitura de uma linha cada, sobre uma coluna `not null` com default — verificadas por leitura de código e pela constraint do banco (não há lógica nova para testar; testar exigiria mockar todo o carregamento de `PortfolioResumo.tsx`/rota de API, que não têm essa infraestrutura de teste hoje — ver Riscos). Rodada geral (`npx vitest run`) confirma que nada quebrou.

### RISCO / PENDÊNCIA V2
- **Estrutural, não corrigido**: unificar o cronograma legado com `planejamento_itens` (ou pelo menos migrar as telas restantes: `ObraCronograma.tsx`, `canteiro/[id]` aba Cronograma, `ObraCurvaS.tsx`, `ObraFinanciamentoMedicao.tsx`'s `cronogramaRef`, `RelatorioCliente.tsx`, `obra-ai`/`ai-obra-tools.ts`). Enquanto isso não acontece, editar progresso numa tela legada continua sem refletir na fonte única e vice-versa — a V1 pode mostrar percentuais diferentes para o "mesmo" serviço dependendo de qual tela foi usada por último.
- `canteiro/[id]/page.tsx` grava só a subetapa sem recalcular a etapa-pai — correção exigiria portar a lógica de rollup ponderado do `lib/planejamento-progresso.ts` para o legado, o que seria "inventar" lógica nova sobre um sistema que está sendo descontinuado — não fizemos, fica para V2 (idealmente resolvido migrando essa tela para a fonte única, não duplicando lógica).
- `LuiziaFloatingChat.tsx`'s leitura de `medicoes` sem filtro de eixo — fora de escopo por instrução explícita ("não mexer em Luiza"), registrado para quando a Luiza puder ser tocada.

---

## 4. UX de segurança — selo PROJECT/OBRA

### FATO ENCONTRADO
`app/(app)/projetos/[id]/page.tsx` e `app/(app)/obras/[id]/page.tsx` têm cabeçalhos visualmente parecidos (foto/nome/status), sem nenhum indicador textual de qual entidade está aberta.

### CORREÇÃO
Selo simples acima do título em cada cabeçalho — "Project" (verde, ícone `LayoutList`) em `projetos/[id]/page.tsx`, "Obra" (azul, ícone `HardHat`) em `obras/[id]/page.tsx`. Sem redesenho, sem novo componente — só um `<span>` com estilo já existente no design system da tela.

### TESTE
`npx tsc --noEmit` e `npm run build` — sem alteração de lógica, verificação visual não é possível neste ambiente (sem navegador).

### RISCO / PENDÊNCIA V2
Nenhum.

---

## Testes executados (rodada completa)

- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — compilado com sucesso, todas as rotas geradas.
- `npm run lint` — nenhum warning/erro novo introduzido nos arquivos alterados (`ProjetoOrcamentosPanel.tsx`, `PortfolioResumo.tsx`, `app/api/whatsapp/dispatch/route.ts`, `projetos/[id]/page.tsx`, `obras/[id]/page.tsx`); os poucos apontamentos existentes nesses arquivos são pré-existentes, em trechos não tocados (confirmado lendo o diff).
- `npx vitest run` — 191/191 passando (7 novos, em `lib/__tests__/estabilizacao-v1-project-obra.test.ts`).
- **Regressão real (Jardim Allegra, somente leitura, nenhum dado alterado):**
  - Confirmado o estado exato relatado pelo usuário: orçamento completo (17 etapas / 68 itens) vinculado à obra, `planejamento_itens` vazio.
  - Confirmado que a árvore do Planejamento está apta a renderizar completa (0 etapas/itens órfãos de FK).
  - Confirmado que a correção do painel do Project passa a listar os dois orçamentos e a selecionar por padrão o real (68 itens), simulando exatamente a query que o código agora executa.
  - Nenhuma medição (`medicoes`) existe ainda para Allegra — a correção do filtro de eixo não muda nada visível para essa obra hoje, mas foi verificada como segura (coluna `not null default 'fisico'`).

## Arquivos alterados

- `components/projeto/ProjetoOrcamentosPanel.tsx` — busca também por `obra_id`, mescla e prioriza o orçamento operacional na seleção padrão; funções `mesclarOrcamentosPorProjetoEObra`/`escolherOrcamentoPadrao` extraídas e exportadas para teste.
- `app/(app)/projetos/[id]/page.tsx` — passa `obraId` ao painel; selo "Project" no cabeçalho.
- `app/(app)/obras/[id]/page.tsx` — selo "Obra" no cabeçalho.
- `components/relatorios/PortfolioResumo.tsx` — filtro `eixo='fisico'` na leitura de `medicoes`.
- `app/api/whatsapp/dispatch/route.ts` — idem.
- `lib/__tests__/estabilizacao-v1-project-obra.test.ts` (novo) — 7 testes de regressão com os dados reais de Allegra.

Nenhuma migração de banco foi necessária nesta rodada (todas as correções são de leitura/UI). Nenhum dado real foi alterado. `lib/luizia-*`, `LuiziaFloatingChat.tsx`, `/obras` (rota) e o módulo Investidor não foram tocados.
