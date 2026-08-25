# Relatório — Mobile Orçamento + Campos Insumos Próprios + Limpeza de Base (Allegra)

```
=== PARA REVISÃO ===

CONTEXTO
Preparação para validar pelo celular o primeiro orçamento real completo da
Allegra: (1) corrigir o layout mobile do orçamento (descrição cortada, etapa
sem destaque visual — ver print anotado "Supraestrutura"/"Vigas de
Entrepiso"); (2) evoluir o cadastro de insumos próprios com 4 campos
dimensionais opcionais; (3) zerar a base operacional de teste preservando
usuários, SINAPI e catálogos globais.

1) MOBILE — components/obra/ObraOrcamento.tsx (componente real confirmado
   por leitura de código, dentro de GrupoEtapa)
   Causa raiz confirmada lendo o JSX (não suposição):
   - Total da etapa (mobile) vinha embutido como <span className="sm:hidden">
     dentro de um <p className="text-xs">, ou seja, MENOR (text-xs) que o
     total da subetapa (text-sm font-bold) e do item (text-sm font-semibold)
     — exatamente o problema apontado na seta do print.
   - Descrição do item usava `truncate` num <p> de largura fixa, cortando com
     "..." — exatamente o problema apontado nos rabiscos do print.
   Alterações:
   - Nome da etapa: text-base font-bold no mobile (text-sm font-semibold no
     desktop, inalterado). Total da etapa: bloco próprio (mesmo padrão visual
     de subetapa/item) em text-base font-extrabold no mobile — agora maior e
     mais forte que subetapa (text-sm font-bold) e item (text-sm
     font-semibold), sem alterar a UI de desktop (>= sm mantém text-sm
     font-semibold, idêntico a antes).
   - Linha do item mobile reestruturada em duas linhas dentro do mesmo bloco:
     linha 1 = descrição completa, sem truncate, com whitespace-normal +
     break-words, largura total; linha 2 = flex justify-between com detalhes
     (qtd editável, unidade, preço unit., contagem de insumos) à esquerda e
     valor total (+ botão restaurar quando há divergência) à direita. Nenhuma
     informação foi removida — só reorganizada. Botão de ações (⋮) permanece
     como irmão de topo, alinhado com o drag handle.
   - Tabela desktop (<table>, hidden md:block) foi lida e confirmada como já
     adequada — colunas de largura fixa e wrap normal, sem o problema de
     truncamento; não foi alterada.
   Validação visual: sandbox não tem rota de rede até *.supabase.co (mesma
   limitação já documentada nesta sessão), então não foi possível abrir o
   app real contra o Supabase de produção no navegador headless. Validação
   feita por (a) tsc/build reais compilando o JSX alterado sem erro, e (b)
   reprodução estática com as mesmas classes/estrutura, capturada via
   Playwright em 360px/390px/430px, cobrindo: descrição curta, descrição
   muito longa, valor pequeno (R$19,50) e valor com muitos dígitos
   (R$12.345.567,80), etapa+subetapa+item. Resultado: etapa nitidamente mais
   forte que os filhos, nenhuma descrição cortada, sem scroll horizontal.

2) INSUMOS PRÓPRIOS — 4 campos dimensionais opcionais
   - Migração aplicada ao projeto Supabase jwezrjyatfjvvsugtugo (e replicada
     em supabase/migrations/20260825025114_insumos_proprios_dimensoes_opcionais.sql):
     ALTER TABLE insumos_proprios ADD COLUMN comprimento/largura/espessura/
     diametro numeric, todas nullable. Nada de tipo_geometrico, dimensao_1/2/3,
     embalagem ou campos por material — fora de escopo como pedido.
   - lib/types.ts: InsumoProprio ganhou os 4 campos opcionais (number|null).
   - app/(app)/servicos/page.tsx: formulário "Novo insumo" (aba Insumos) ganhou
     seção "Dimensões (opcional, em metros)" com os 4 inputs numéricos;
     handleNovo() envia null quando vazio. Edição em massa/inline das células
     existentes não foi alterada (fora do pedido, que era só o form simples).

3) LIMPEZA DA BASE DE TESTE — "zerar para Allegra"
   Levantamento de FKs feito ANTES de qualquer DELETE via information_schema +
   pg_constraint (não suposição): confirmado que obras/orcamentos/projetos
   cascateiam a esmagadora maioria dos filhos; identificadas as exceções
   NO ACTION (etapa_composicoes.composicao_id, orcamento_itens.composicao_id,
   medicao_itens.orcamento_item_id, materiais.subetapa_orcamento_item_id,
   tarefas.projeto_id) e resolvidas por ORDEM de exclusão (nunca alterando
   constraint), confirmando antes que medicoes.obra_id/materiais.obra_id são
   NOT NULL — ou seja, sempre removidos em cascade de obras antes de
   orçamentos serem apagados. RLS está habilitado em todas as tabelas, mas com
   policy "bs_mvp_*" permissiva (mesmo modelo MVP já documentado nesta sessão);
   a migração roda com privilégio administrativo, sem bloqueio de policy.

   Script administrativo (migração única, não é código de app):
   supabase/migrations/20260825025114... (campos insumos) e a migração
   "limpeza_base_teste_zerar_para_allegra" aplicada via mcp Supabase, na
   ordem: tarefas -> obras -> orcamentos -> projetos -> cronogramas órfãs
   (obra_id e projeto_id nulos) -> composicoes_proprias -> insumos_proprios.

   RELATÓRIO DE CONTAGEM (tabela | antes | depois) — tabelas em escopo:
   obras                              15 -> 0
   projetos                           13 -> 0
   orcamentos                         30 -> 0
   orcamento_itens                   929 -> 0
   orcamento_item_insumos            373 -> 0
   orcamento_itens_baseline          168 -> 0
   orcamento_verificacao_historico     0 -> 0
   etapas                            150 -> 0
   etapa_composicoes                   0 -> 0
   etapa_caixa                        19 -> 0
   subetapas_cronograma              193 -> 0
   servicos_cronograma               652 -> 0
   planejamento_itens                198 -> 0
   planejamento_itens_baseline        30 -> 0
   planejamento_dependencias           0 -> 0
   planejamento_dependencias_baseline  0 -> 0
   medicoes                           11 -> 0
   medicao_itens                      76 -> 0
   medicao_progresso                 155 -> 0
   materiais                         382 -> 0
   requisicoes_compra                  4 -> 0
   requisicao_itens                   34 -> 0
   cotacoes                            0 -> 0
   listas_compra                       3 -> 0
   compra_itens                      148 -> 0
   fornecedores (vinculados a obra)     -> 0 (as 3 restantes ficaram porque
                                             já tinham obra_id nulo = globais)
   obra_fornecedores                   2 -> 0
   financiamento_itens                40 -> 0
   financiamento_medicoes              4 -> 0
   financiamento_medicao_itens        80 -> 0
   financiamento_cronograma_banco     18 -> 0
   obra_fontes_recursos                7 -> 0
   obra_reembolsos                     4 -> 0
   obra_previsoes                     52 -> 0
   obra_usuarios                       1 -> 0
   obra_files                          4 -> 0
   tarefas                            35 -> 0
   rdo                                 1 -> 0
   diario_obra                         0 -> 0
   comunicados_obra                    0 -> 0
   cronogramas                        31 -> 0
   cronograma_dependencias            14 -> 0
   boards                              6 -> 0
   board_items                        23 -> 0
   board_item_comments                 0 -> 0
   board_files                        18 -> 0
   feed_items                          4 -> 0
   feed_item_files                     6 -> 0
   feed_reactions                      0 -> 0
   feed_comments                       0 -> 0
   feed_story_views                    0 -> 0
   feed_story_file_views               1 -> 0
   portal_access_links                 6 -> 0
   portal_audit_log                   28 -> 0
   portal_configuracoes                3 -> 0
   portal_messages                     0 -> 0
   portal_notifications                3 -> 0
   portal_tours                        1 -> 0
   portal_tour_nodes                   2 -> 0
   portal_tour_hotspots                0 -> 0
   portal_tour_links                   2 -> 0
   projeto_itens                      47 -> 0
   projeto_item_dependencias           2 -> 0
   projeto_usuarios                    0 -> 0
   project_item_files                  2 -> 0
   composicoes_proprias              214 -> 0
   composicao_insumos                440 -> 0
   insumos_proprios                  241 -> 0

   PRESERVADOS (não tocados pelo script — verificado antes e depois):
   profiles                     5 -> 5   (usuários)
   sinapi_insumos              270 -> 270
   sinapi_composicoes            3 -> 3
   sinapi_composicao_itens       5 -> 5
   orcamento_templates           2 -> 2  (sem FK p/ obras/orcamentos/
                                          composicoes_proprias — confirmado
                                          via information_schema antes de
                                          preservar)
   projeto_templates             2 -> 2  (idem)
   etapas_padrao                20 -> 20 (catálogo global, sem FK de teste)
   luizia_logs / luizia_wa_messages / luizia_wa_config / luizia_wa_phone_rules
   / luizia_tarefas_log — inalterados (config/log do sistema Luiza/WhatsApp,
   não são dado operacional de obra/projeto; qualquer obra_id que possuíssem
   foi apenas SET NULL pelo cascade, nenhuma linha removida)

   AMBIGUIDADES DOCUMENTADAS (não apagadas por não terem sido pedidas
   explicitamente nem terem finalidade de teste comprovada):
   - fornecedores com obra_id nulo (cadastro global de fornecedor, 3 linhas
     remanescentes) — preservado.
   - responsaveis / proprietarios — 0 linhas, cadastros globais, preservados
     por não serem "dado de teste de obra/projeto".

   Nenhuma tabela foi apagada "no escuro": a ordem acima foi definida ANTES
   da execução, a partir do grafo de FKs real, não por tentativa e erro.

VALIDAÇÃO TÉCNICA
- npx tsc --noEmit: limpo, sem erros.
- npm run build (Next 16.2.7 / Turbopack): compilou com sucesso, 40 rotas
  geradas, TypeScript do build também limpo.
- Teste funcional pós-limpeza: criada uma obra/orçamento SINTÉTICA temporária
  via SQL (não é a Allegra, nome claramente marcado "QA MOBILE TESTE —
  apagar") só para validar visualmente o layout mobile após a limpeza,
  confirmando que o fluxo obra -> orçamento -> etapa -> subetapa -> item
  continua funcionando ponta a ponta no banco zerado. Essa obra/orçamento de
  QA foi apagada em seguida — a base foi conferida e voltou a 0 em todas as
  tabelas em escopo (obras/orcamentos/orcamento_itens/etapas/cronogramas).

ARQUIVOS ALTERADOS
- components/obra/ObraOrcamento.tsx (layout mobile: cabeçalho de etapa +
  linha de item)
- lib/types.ts (InsumoProprio: 4 campos opcionais)
- app/(app)/servicos/page.tsx (form "Novo insumo": 4 campos opcionais)
- supabase/migrations/20260825025114_insumos_proprios_dimensoes_opcionais.sql
  (novo — espelha a migração aplicada ao banco)

SQL EXECUTADO NO BANCO (jwezrjyatfjvvsugtugo)
1. insumos_proprios_dimensoes_opcionais — ADD COLUMN comprimento/largura/
   espessura/diametro numeric (nullable) em insumos_proprios.
2. limpeza_base_teste_zerar_para_allegra — DELETE em cascata na ordem
   tarefas -> obras -> orcamentos -> projetos -> cronogramas órfãs ->
   composicoes_proprias -> insumos_proprios (texto completo documentado
   acima e no histórico de migrações do projeto).

NÃO FEITO (fora de escopo, como pedido)
- Módulo de orçamento não foi reconstruído; motor do Orçamento Civil não foi
  migrado.
- SINAPI não foi tocada.
- Nenhuma abstração nova, nenhuma regra de negócio do orçamento alterada.
- Allegra não foi hardcoded em nenhuma tela.
- Motor de conversão dimensional (área/volume a partir dos 4 campos novos)
  não foi implementado — só os campos e o formulário, como pedido.

RISCOS / LIMITAÇÕES
- Validação visual mobile foi feita por reprodução estática das mesmas
  classes (Playwright), não pelo app real renderizado contra produção — o
  sandbox não alcança *.supabase.co (limitação de ambiente já documentada
  nesta sessão, não é bug do código).
- luizia_wa_dispatches/luizia_wa_dispatch_log ficaram com obra_id nulo onde
  antes apontavam para obras de teste (SET NULL, nenhuma linha apagada) —
  se algum agendamento de aviso estava vinculado a uma obra de teste, ele
  continua existindo mas sem obra associada; nenhum dispatch existia no banco
  no momento da limpeza (0 linhas antes e depois).

PRONTO PARA ALLEGRA
SIM, com uma ressalva de validação visual. A base operacional está
completamente zerada (obras, projetos, orçamentos, etapas, planejamento,
medições, materiais/suprimentos, lançamentos financeiros, composições e
insumos próprios — todos em 0), preservando usuários, SINAPI e catálogos
globais intactos. O layout mobile do orçamento foi corrigido na origem (novo
código já em components/obra/ObraOrcamento.tsx) e o cadastro de insumos
próprios já aceita comprimento/largura/espessura/diâmetro opcionais. O
sistema builda limpo e o fluxo obra->orçamento->etapa->item foi exercitado
ponta a ponta no banco zerado com uma obra sintética (depois removida).
A única pendência é a validação visual do layout mobile dentro do app real
renderizado no navegador contra a Allegra de verdade — isso só poderá ser
confirmado quando a Allegra for cadastrada e aberta num celular (ou browser
com acesso à internet), já que este ambiente de desenvolvimento não alcança
o Supabase de produção pela rede para um teste end-to-end no browser.
```
