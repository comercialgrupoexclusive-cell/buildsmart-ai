# BuildSmart — Handoff

> Arquivo único de handoff. Não criar um novo por rodada — sempre atualizar/sobrescrever este.
> Reflete o estado REAL do código ao final da última rodada, não o planejado.

## Estado atual

Sistema de gestão de obras (Next.js + Supabase, projeto `jwezrjyatfjvvsugtugo`). Módulos maduros e em produção: Orçamento (Projeto + Obra, componente único `components/obra/ObraOrcamento.tsx`), Planejamento 2.0 / Cronograma, Medições/RDO, Suprimentos (Materiais + Compras), Financeiro/Financiamento, Portal do Cliente (V1 fechado), Luiza (assistente IA), WhatsApp.

Módulo mais recente: **Conferência do Orçamento** — controle de QA/revisão sobre o orçamento (etapa → subetapa → item → insumo), independente de execução física, medições, financeiro ou Portal. Implementado em duas rodadas (ver abaixo) e agora considerado pronto para uso prático.

## Alvo da rodada (última rodada, atual)

Corrigir dois problemas identificados após a primeira implementação da Conferência do Orçamento, antes de liberar para uso real:

1. **Atribuição de usuário nas reversões automáticas**: quando um item já conferido é alterado, o histórico registrava `alterado_apos_verificacao` com `usuario_id = null` (a arquitetura é PostgREST/stateless, sem sessão real — o trigger de banco não tinha como saber quem editou).
2. **Filtro "Pendentes" raso**: só filtrava em granularidade de subetapa (escondia subetapa 100% conferida, mas mostrava todos os itens/insumos dentro de uma subetapa parcial, e nunca escondia uma etapa 100% conferida da lista).

Escopo explicitamente fechado pelo usuário: não mexer em cálculos do orçamento, execução, cronograma, previsões, Portal ou financeiro.

## Alterações realizadas

### Rodada 1 (base da Conferência do Orçamento)
- Colunas `verificado/verificado_por/verificado_em` em `etapas`, `orcamento_itens`, `orcamento_item_insumos`.
- Tabela de histórico `orcamento_verificacao_historico` (append-only).
- RPC `orcamento_verificacao_marcar` (cascata etapa→subetapa/item→insumo, com confirmação apenas no nível etapa).
- Triggers `BEFORE UPDATE` nas 3 tabelas revertendo `verificado=false` quando conteúdo real muda.
- UI em `ObraOrcamento.tsx`: modo conferência opt-in, checkboxes tri-estado (☐/◩/☑) desktop+mobile em todos os níveis, barra de progresso, modal de confirmação para etapa.

### Rodada 2 (esta rodada — correção de atribuição + filtro recursivo)

**Atribuição de usuário na invalidação automática — solução escolhida:**
Auditei todos os pontos do app que fazem `.update()` de conteúdo em `etapas`/`orcamento_itens`/`orcamento_item_insumos` (não apenas em `ObraOrcamento.tsx` — grep no repo inteiro). Descobri que os únicos pontos de edição INTERATIVA (usuário via UI) que tocam campos realmente comparados pelos triggers de invalidação estão todos dentro de `ObraOrcamento.tsx` (8 call sites, listados abaixo). Os demais `.update()` no restante do app tocam apenas campos de execução/cronograma que os triggers explicitamente ignoram (ex.: `percentual_executado`, `status`, `ordem`, datas) — exceto os caminhos de IA (Luiza chat, WhatsApp, `api/obra-ai`), que ficam **fora do escopo desta rodada** (ver Limitações).

Solução: nova RPC `orcamento_atualizar_com_ator(p_tabela, p_ids[], p_patch jsonb, p_profile_id)` (SECURITY DEFINER) que:
1. Valida o profile (mesmo padrão de `orcamento_verificacao_marcar`).
2. Seta um GUC **transaction-local** via `set_config('app.current_profile_id', p_profile_id::text, true)` — funciona mesmo com PostgREST/connection pooling porque fica confinado à mesma transação da própria chamada RPC (não depende de sessão persistente entre requests).
3. Executa o UPDATE real na tabela pedida, usando `case when p_patch ? 'coluna' then ... else t.coluna end` por coluna (lista fixa e explícita por tabela — sem SQL dinâmico/EXECUTE).

Os 3 triggers de invalidação (`trg_invalidar_verificacao_*`) foram atualizados para ler esse GUC ao gravar `alterado_apos_verificacao`:
`nullif(current_setting('app.current_profile_id', true), '')::uuid` em vez de `null` fixo.

Todos os 8 pontos de edição de conteúdo em `ObraOrcamento.tsx` foram convertidos de `.update()` direto para passar por um novo helper `atualizarComAtor(tabela, ids, patch)` que chama essa RPC com `currentProfile.id`:
1. `upsertSubetapaMeta` (update do meta-row ao editar valor manual)
2. `handleUpdateItemQuantidade` (edição inline de quantidade)
3. `handleEditItemSave` (modal "Editar item")
4. Renomear etapa (dialog de hierarquia)
5. Renomear subetapa (dialog de hierarquia, bulk update por nome)
6. `handleRestoreSubetapaValor`
7. `handleRestoreItemValor`
8. `handleRestoreInsumoValor`

**Filtro "Pendentes" — agora recursivo:**
- Etapa 100% conferida (`etapaState === 'full'`) → `GrupoEtapa` retorna `null` (etapa some da lista) quando o filtro Pendentes está ativo.
- Dentro de uma etapa parcial: `gruposParaExibir` já filtrava subetapas 100% conferidas (mantido).
- Novo: dentro de uma subetapa parcial, `itensParaExibir(itens)` filtra para mostrar só itens que não estão 100% (item em si pendente OU algum insumo dele pendente).
- Novo: dentro de um item parcial expandido, `insumosParaExibir(item)` filtra para mostrar só insumos com `verificado=false`.
- Os totais financeiros (`subtotalGrupo`, `totalGrupo`, `pctDoDireto`, subtotal por subetapa/item) continuam usando as listas SEM filtro (`gruposSubetapa`, `grupo.itens`, `item.composicao_itens`) — nunca as versões "ParaExibir", que servem só para renderização. Isso preserva a regra de não excluir itens não conferidos dos totais do orçamento.

## Banco / migrations / RPCs

- **Migrations criadas nesta rodada**: `supabase/migrations/20260820060020_conferencia_orcamento_ator_edicao.sql` (aplicada ao vivo via `apply_migration`, mirror local escrito e conferido).
- Migration da rodada 1 (referência): `supabase/migrations/20260820051007_conferencia_orcamento.sql`.
- **Tabelas modificadas**: nenhuma coluna nova nesta rodada (as colunas de conferência já existiam desde a rodada 1).
- **RPCs**:
  - `orcamento_atualizar_com_ator(p_tabela text, p_ids uuid[], p_patch jsonb, p_profile_id uuid) returns setof uuid` — **nova**. SECURITY DEFINER, `search_path=''`, grant PUBLIC (padrão das ferramentas internas do app — mesmo padrão de `orcamento_verificacao_marcar`, `iniciar_obra_por_orcamento`, `finalizar_orcamento`). Único caminho de update que preserva atribuição de usuário nas 3 tabelas de conferência.
  - `orcamento_verificacao_marcar` — inalterada nesta rodada (rodada 1).
- **Triggers alterados** (apenas a cláusula de `usuario_id` no INSERT de histórico): `trg_invalidar_verificacao_etapas`, `trg_invalidar_verificacao_orcamento_itens`, `trg_invalidar_verificacao_orcamento_item_insumos`.

## Frontend

- `components/obra/ObraOrcamento.tsx` (único componente, usado tanto em fase Projeto quanto Obra):
  - Novo helper `atualizarComAtor()` (chama a RPC nova) — usado pelos 8 call sites listados acima.
  - Novo helper `itensParaExibir()` / `insumosParaExibir()` dentro de `GrupoEtapa` — filtro recursivo.
  - `GrupoEtapa` retorna `null` quando `filtroConferencia==='pendentes' && etapaState==='full'`.
  - Checkboxes de conferência (desktop + mobile) inalterados nesta rodada — já existiam da rodada 1.
- `lib/types.ts`: inalterado nesta rodada.

## Testes executados

Todos via SQL direto (`begin; ... rollback;`) contra o banco de produção, chamando exatamente as mesmas RPCs que o frontend chama — não foi possível testar via browser real (sandbox sem acesso de rede a `*.supabase.co`, mesma limitação de rodadas anteriores). Obra de teste: **Resid. Jardim Allegra - Revisão Orçamentária** (`bb8e6f10-6f19-4c40-b9ea-1ae6fc05146b`), orçamento **Resid. Jardim Allegra - Orçamento em Revisão** (`14c8293f-9984-4d62-8925-4278cc3001d6`) — 20 etapas, 49 subetapas, 0 itens/insumos.

| Cenário | Esperado | Obtido | Resultado |
|---|---|---|---|
| A) Marcar 1 subetapa isolada | só ela vira conferida | confirmado (`Locação da obra` / `Canteiro de obras` isoladas) | PASSOU |
| B) Marcar 1 etapa inteira (com filhos) | etapa + todas as subetapas existentes conferidas | confirmado (Infraestrutura: 5/5, Supraestrutura: 6/6) | PASSOU |
| C) Editar subetapa já conferida via `orcamento_atualizar_com_ator` | ela reverte p/ pendente; etapa vira parcial; irmãs continuam conferidas; histórico grava `alterado_apos_verificacao` **com usuario_id real** | confirmado — subetapa editada reverteu (5/6 restantes verificadas em Supraestrutura), irmãs (`Pilares`, `Laje de entrepiso`(renomeada, revertida), `Escadas`, `Vigas de cobertura`, `Laje de cobertura`) preservadas, histórico mostrou `usuario: "Gabriel"` (o editor) — não mais `null` | PASSOU |
| D) Nova subetapa em etapa 100% conferida | nasce pendente; etapa vira parcial; % global cai | confirmado — nova subetapa `verificado=false` por default, etapa passou de 6/6 para 5/7, total global do orçamento passou de 69 para 70 com a mesma contagem de conferidos | PASSOU |
| E) Histórico mostra usuário + data | ações `verificado`/`verificacao_em_lote` com usuario_id de quem verificou (Luiz); `alterado_apos_verificacao` com usuario_id de quem editou depois (Gabriel) | confirmado nos dois casos, incluindo timestamps | PASSOU |
| Segurança: profile inválido/inexistente chamando `orcamento_atualizar_com_ator` | rejeitado | `ERROR 42501: edicao_nao_autorizada` | PASSOU |
| Rollback / estado limpo | nenhum dado de teste sobra | confirmado: `etapas_verif=0, itens_verif=0, total_itens=49, historico=0` idêntico ao baseline original | PASSOU |
| `npx tsc --noEmit` | 0 erros | 0 erros | PASSOU |
| `npx eslint components/obra/ObraOrcamento.tsx` | sem novos problemas | 17 problemas (13 erros/4 warnings) — **idênticos** aos pré-existentes antes desta rodada (confirmado via `git stash` + eslint no baseline) | PASSOU (sem regressão) |
| `npm run build` | build limpo | compilado com sucesso, todas as rotas geradas | PASSOU |

## Dados de teste

Obra: **Resid. Jardim Allegra - Revisão Orçamentária** — `bb8e6f10-6f19-4c40-b9ea-1ae6fc05146b`
Orçamento: **Resid. Jardim Allegra - Orçamento em Revisão** — `14c8293f-9984-4d62-8925-4278cc3001d6`
Profiles usados nos testes: Luiz (`e5b43686-19f8-4879-9435-0feb35185565`, tipo usuario) como verificador, Gabriel (`0ba6a160-b8df-4be3-b6d7-9c2a5c23fdc9`, tipo usuario) como editor causador de invalidação.

Nenhuma credencial, token ou secret foi registrado neste arquivo.

## Limitações conhecidas

1. **Edições via Luiza (chat IA), WhatsApp ou `api/obra-ai`** continuam gravando `usuario_id=null` no histórico de invalidação automática — esses caminhos não passam por `atualizarComAtor` (não foi trocado nesta rodada, para não ampliar escopo). Se algum dia isso importar, seria preciso threading do profile id através dessas rotas server-side.
2. **Filtro "Pendentes"** já é recursivo (etapa → subetapa → item → insumo), mas o `hasInsumos` (afeta se o chevron de expandir aparece no item) continua calculado sobre a lista SEM filtro — ou seja, um item pode mostrar a seta de expandir mesmo que, ao expandir com o filtro Pendentes ativo, a lista de insumos pendentes venha vazia (porque o item em si é que está pendente, não os insumos). Comportamento visualmente aceitável, não é um bug de dado.
3. Testes de UI (clique real em checkbox, mobile) continuam só por revisão de código — sandbox não tem acesso de rede a `*.supabase.co` para testar em browser real.
4. Conferência não é (ainda) gate de nenhuma operação — publicação no Portal, baseline, medições etc. continuam 100% independentes, por design explícito desta fase.

## Decisões importantes

- **Por que RPC + GUC transaction-local em vez de header HTTP → `request.headers` GUC do PostgREST**: a alternativa "zero-call-site-change" seria usar o GUC `request.headers` que o PostgREST expõe automaticamente em toda request, lido via `current_setting('request.headers', true)::json`, sem precisar de nenhuma RPC nova. Essa abordagem foi descartada nesta rodada porque **não pôde ser testada no sandbox** (rede bloqueada para `*.supabase.co`, `curl` retorna 403 do proxy) — não fazia sentido apostar a correção principal pedida pelo usuário em um mecanismo que não dava pra validar ponta a ponta antes de entregar. A RPC com `set_config(..., true)` é 100% testável via `execute_sql` direto (simula exatamente uma chamada RPC real do PostgREST) e foi essa que recebeu toda a bateria de testes A-E. Se o próximo agente tiver acesso de rede real, vale reconsiderar a abordagem de header para eliminar os 8 call sites convertidos — mas não é urgente, o comportamento atual está correto e testado.
- **Por que só os 8 call sites de `ObraOrcamento.tsx`**: são os únicos pontos de edição INTERATIVA (usuário humano via UI) que tocam campos comparados pelos triggers. Convertidos por análise linha a linha (grep de todo `.update()` no arquivo), não por amostragem.
- **`orcamento_atualizar_com_ator` usa CASE explícito por coluna, não SQL dinâmico**: decisão deliberada de segurança — nomes de coluna são sempre literais estáticos no corpo da função, nunca construídos a partir de input do usuário.
- **Regra de estado "parcial" nunca é armazenada** (herdada da rodada 1, reafirmada aqui): sempre recalculada a partir dos filhos, inclusive no novo filtro recursivo — não foi criada nenhuma coluna nova para isso.

## Próximo passo recomendado

Nenhuma correção pendente conhecida para a Conferência do Orçamento nesta fase. Se o usuário pedir para usar a conferência como gate de alguma operação (ex.: só permitir "Iniciar Obra" ou publicar no Portal com orçamento 100% conferido), isso é uma decisão de produto nova e deliberadamente fora do escopo até aqui — não implementar sem pedido explícito.

## Git

- **Branch utilizada**: `previsoes/prazo-fornecimento-material` (branch reaproveitada em todas as rodadas desta sessão)
- **Commit final**: ver `git log -1` após esta rodada (mensagem: correção de atribuição de usuário + filtro recursivo na Conferência do Orçamento)
- **Merge em main**: sim, fast-forward
- **Status do build**: limpo (`npm run build` sem erros)
- **Status do tsc/eslint**: `tsc --noEmit` sem erros; eslint sem regressão (mesmos 17 problemas pré-existentes de antes desta rodada)
