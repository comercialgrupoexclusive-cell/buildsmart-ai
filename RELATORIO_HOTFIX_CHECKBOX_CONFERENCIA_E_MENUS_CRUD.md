# Hotfix — Checkbox de conferência (`insumo_invalido`) + menus CRUD do orçamento

```
=== PARA REVISÃO ===

CONTEXTO
Validação do primeiro orçamento real (Resid. Jardim Allegra → Orçamento Executivo
Allegra - V1) pelo celular revelou dois problemas: (1) clicar no checkbox de
conferência estourava "insumo_invalido"; (2) os menus de 3 pontos de
etapa/subetapa/item existiam visualmente mas as ações não pareciam executar.

1) CAUSA RAIZ DO insumo_invalido (achada lendo o código real, não suposta)
   A RPC antiga `orcamento_verificacao_marcar` (migração 20260820051007) exigia,
   para conferir um insumo, que o id recebido já existisse em
   `orcamento_item_insumos` — senão estourava `insumo_invalido`. Só que
   `orcamento_item_insumos` só é populada por importação XLSX (ou por uma
   conferência anterior); todo item criado pelo fluxo normal do orçamento nunca
   tem essa linha. A UI então exibe os insumos direto de `composicao_insumos`
   (a definição da composição) e usa o id de LÁ no checkbox — que nunca existe em
   `orcamento_item_insumos`, então qualquer clique num insumo não importado
   quebrava. Confirmado ao vivo: o item real "Placa de Obra e Placas de
   Sinalização" (id 2273f1ef-...) tem 0 linhas em orcamento_item_insumos e 3 em
   composicao_insumos — reprodução exata do relato.
   A mesma RPC também cascateava automaticamente etapa→subetapa/item→insumo
   (p_incluir_filhos), indo contra o pedido de "cada nível independente, sem
   propagação".

2) FIX — RPC reescrita do zero (radicalmente mais simples)
   Nova versão de `orcamento_verificacao_marcar` (migração
   20260825044232_conferencia_orcamento_checkbox_simples, projeto Supabase
   jwezrjyatfjvvsugtugo — e migração 20260825044939 removendo um overload
   antigo que sobrou por causa da mudança de assinatura):
   - Etapa/subetapa/item: update direto e independente das 3 colunas
     verificado/verificado_por/verificado_em — sem exigir filhos conferidos,
     sem cascata, sem validar composição/insumos.
   - Insumo: primeiro tenta achar o id em orcamento_item_insumos (caminho
     normal). Se não existir, materializa uma linha mínima usando o MESMO
     snapshot (código/descrição/unidade/classificação/coeficiente/quantidade
     calculada/preço unitário) que a UI já está exibindo — enviado pelo
     próprio front-end no clique — e marca essa nova linha. Não recalcula nem
     altera preço, coeficiente ou qualquer regra da composição; só dá ao
     insumo um lugar para guardar "conferido" dali em diante.
   - `p_incluir_filhos` foi removido; nenhuma chamada cascateia mais.

   Front-end (components/obra/ObraOrcamento.tsx):
   - handleVerificar perdeu o parâmetro incluirFilhos; ganhou orcamentoItemId
     + insumoSnapshot (só usados para entidadeTipo='insumo').
   - Checkbox da etapa: removido o modal de confirmação "Só a etapa / Etapa +
     todos os itens" (estado confirmarEtapa) — agora alterna direto, sem modal,
     como todos os outros níveis.
   - Checkbox do insumo (2 lugares — tabela desktop expandida e lista mobile):
     agora envia item.id + snapshot (código/descrição/unidade/classificação/
     coeficiente/quantidade calculada/preço) construído a partir dos mesmos
     valores já calculados para exibição.

3) MENUS DE 3 PONTOS NÃO EXECUTAVAM AÇÕES
   Investigação de ponta a ponta confirmou que os handlers (editar/excluir
   etapa, editar/excluir subetapa, editar valor, editar/excluir composição)
   já eram reais chamadas Supabase funcionais — nenhum estava "morto". A causa
   real: os menus (etapa/subetapa/item) usam bottom-sheet fixo no mobile
   (`fixed inset-x-4 bottom-4`) com z-[120]; o dock flutuante da Luiza
   (ObraAssistenteDock, componente adicionado em rodada anterior desta sessão)
   usa `fixed inset-x-0 bottom-0 z-[140]` — MAIOR que o menu. Com o chat da
   Luiza aberto (ou minimizado), o painel dele ficava por cima dos menus,
   bloqueando o toque nas opções — exatamente o problema #6 relatado ("não
   ficar escondido atrás do chat flutuante"). Fix: os 5 bottom-sheets de ação
   (etapa, subetapa ×2 variações desktop/mobile, item ×2) subiram para
   z-[150] — acima do dock (140) e do LuiziaFloatingChat global (z-50),
   abaixo de modais reais (Modal.tsx usa z-[200]). Fechar ao tocar fora e ao
   selecionar ação já funcionava (listener de mousedown existente, verificado
   no código).

4) AÇÃO "DUPLICAR" (não existia — confirmado por busca no arquivo)
   Nova função handleDuplicateItem: copia a linha de orcamento_itens (mesma
   etapa, subetapa, composição vinculada, quantidade, snapshots, valores
   manuais) e, se existirem, as linhas de orcamento_item_insumos do item
   original (overrides/conferência por insumo) — cópia nasce não conferida.
   Nenhum motor de composição é recalculado. Adicionada ao menu de item
   (desktop e mobile), entre "Adicionar insumo" e "Excluir composição".

5) EDIÇÃO DE ITEM
   Já permitia quantidade, descrição, unidade, preço, subetapa e mover de
   etapa (modal existente, openEditItem/handleEditItemSave) — não precisou de
   mudança, só confirmado que já cobre o pedido mínimo (quantidade, descrição,
   subetapa; composição vinculada é trocada via "Editar composição" no
   +Adicionar/duplicar, não neste modal — não alterado, fora do pedido).

TESTES
- tsc --noEmit: limpo. npm run build: 40 rotas, sem erro.
- Reprodução direta no banco de produção (jwezrjyatfjvvsugtugo), no orçamento
  REAL "Orçamento Executivo Allegra - V1", item real "Placa de Obra e Placas
  de Sinalização" (id 2273f1ef-1fec-4360-b91f-2585a4dce44c, 0 linhas em
  orcamento_item_insumos, 3 em composicao_insumos):
    1. orcamento_verificacao_marcar(..., 'item', <id do item>, 'verificar') → ok:true,
       orcamento_itens.verificado passou a true.
    2. orcamento_verificacao_marcar(..., 'insumo', <id de composicao_insumos>, 'verificar', ..., <item_id>, <snapshot>)
       → ok:true (ANTES: insumo_invalido). Criou uma linha nova em
       orcamento_item_insumos (verificado=true, mesmo código/descrição/
       coeficiente/preço já exibidos, sem alterar nada do cálculo).
    3. Testado também um segundo insumo do mesmo item (item com vários
       insumos) e a etapa da Supraestrutura, isoladamente — confirmado que
       marcar a etapa NÃO marca o item nem os insumos, e marcar/desmarcar um
       insumo não afeta o outro nem o item: nenhuma propagação em nenhuma
       direção.
    4. Ambos os registros de teste (item + insumo) foram desmarcados
       (reabrir) ao final, restaurando o estado exatamente como estava antes
       do teste (verificado=false) — a única mudança permanente e desejada é
       a linha de orcamento_item_insumos agora existir para aquele insumo
       (com verificado=false), o que é o comportamento correto esperado daqui
       pra frente.
    5. Um fixture sintético separado (obra/orçamento/composição/insumos
       próprios de teste, claramente identificados e apagados depois) foi
       usado antes para validar o fluxo completo em um cenário controlado
       (item com 2 insumos, etapa isolada) antes de tocar no dado real.
- Menu de ações: reprodução estática (mesma técnica de mock usado no relatório
  anterior — o sandbox não alcança *.supabase.co, limitação já documentada) em
  360/390/430px comprovando que o menu de "Editar/Duplicar/Excluir composição"
  agora renderiza por cima do dock da Luiza (antes ficava atrás) e continua
  totalmente dentro do viewport.

ARQUIVOS ALTERADOS
- components/obra/ObraOrcamento.tsx (RPC call simplificada, remoção do modal
  de confirmação de etapa, snapshot no checkbox de insumo, z-index dos 5
  menus de ação, nova função handleDuplicateItem + botão "Duplicar
  composição" em 2 lugares, import do ícone Copy)
- supabase/migrations/20260825044232_conferencia_orcamento_checkbox_simples.sql (novo)
- supabase/migrations/20260825044939_remove_overload_antigo_verificacao_marcar.sql (novo)
- supabase/migrations/20260825025823_limpeza_base_teste_zerar_para_allegra.sql
  (novo — só espelha no repo a migração já aplicada na rodada anterior, que
  não tinha sido salva localmente)

SQL EXECUTADO NO BANCO (jwezrjyatfjvvsugtugo)
1. conferencia_orcamento_checkbox_simples — reescreve orcamento_verificacao_marcar.
2. remove_overload_antigo_verificacao_marcar — remove o overload antigo
   (assinatura com boolean) que ficou órfão porque CREATE OR REPLACE não
   substitui uma função quando o tipo de um parâmetro muda; a app sempre
   chama com parâmetros nomeados então nunca foi ambíguo em produção, mas
   ficou registrado como limpeza de schema.
3. Testes diretos via SELECT na função (marcar/reabrir) em dado real e
   sintético, documentados acima — sem alterar preço, coeficiente ou
   qualquer coluna fora de verificado/verificado_por/verificado_em.

NÃO FEITO (fora de escopo, como pedido)
- Motor de composição, coeficientes e preços não foram tocados.
- Nenhuma propagação pai-filho foi criada (nem mantida — a antiga foi
  removida).
- Nenhum workflow de aprovação, permissão nova ou status adicional.
- Estrutura do orçamento não foi alterada.

CRITÉRIO DE ACEITE
[x] checkbox marca com um toque — sem modal, update direto.
[x] checkbox desmarca com um toque.
[x] sem insumo_invalido — testado no item real que antes quebrava.
[x] funciona mesmo com insumos "problemáticos" (sem snapshot próprio ainda) —
    materializa on-demand com os valores já exibidos.
[x] etapa possui editar/excluir — já existia, confirmado funcional.
[x] subetapa possui editar/excluir — já existia, confirmado funcional.
[x] item possui editar/duplicar/excluir — duplicar era o que faltava, adicionado.
[x] menu funciona no celular — z-index corrigido acima do dock da Luiza.
[x] totais atualizam após edição/exclusão — já usavam state local
    (setItens/loadItens), sem precisar de reload de página.
[x] TypeScript/build passam.
[x] relatório salvo na raiz do repositório (este arquivo).
```
