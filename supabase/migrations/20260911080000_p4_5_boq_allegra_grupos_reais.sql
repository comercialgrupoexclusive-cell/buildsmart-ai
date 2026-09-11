-- P4.5 FOCO 2 (P4.4 seção 7) — materializa os agrupamentos de subetapa do
-- orçamento real da Allegra (hoje só texto livre em orcamento_itens.
-- subetapa, sem grupo_id) como GRUPO real (tipo_linha='subetapa'), para
-- que a árvore fique ETAPA → SUBETAPA/GRUPO → SERVIÇO, como a nova UI do
-- Processo já sabe navegar (OrcamentoEtapa/OrcamentoGrupo). Hoje as 84
-- linhas (19 verbas + 65 mão de obra) aparecem todas soltas na tela da
-- etapa porque nenhuma tem grupo_id, mesmo já tendo um rótulo de subetapa
-- coerente (ex.: "Pilares", "Laje de Entrepiso", "Fundações").
--
-- 100% aditivo/de rótulo — nenhum valor, quantidade, classificação ou
-- vínculo (planejamento_itens, medicao_itens, compra_itens,
-- financiamento_itens já apontam para orcamento_itens.id, que não muda)
-- é apagado, fundido ou recalculado. Só: (1) cria as linhas-cabeçalho de
-- grupo que faltavam; (2) aponta grupo_id nos itens existentes para o
-- grupo correspondente; (3) limpa o prefixo "Mão de obra - " da descrição
-- dos serviços de mão de obra, porque na hierarquia nova o serviço é o
-- nível principal visível (a classificação MAO_DE_OBRA já indica a
-- natureza do custo — não precisa repetir no nome).
--
-- Não tenta redistribuir a verba de materiais por serviço (ex.: dividir
-- os R$73.327,13 de "03 Supraestrutura" entre Pilares/Laje/Escada): isso
-- exigiria quantitativo real que não existe hoje — fica registrado como
-- pendência explícita no relatório, não fabricado aqui.
do $$
declare
  r record;
  v_grupo_id uuid;
  v_codigo text;
begin
  for r in
    select oi.etapa_id, oi.subetapa, e.ordem as etapa_ordem
    from orcamento_itens oi
    join etapas e on e.id = oi.etapa_id
    where oi.orcamento_id = '9476cc91-649a-4116-a399-f8f05e58924f'
      and oi.tipo_linha = 'item'
      and oi.subetapa is not null
      and oi.grupo_id is null
    group by oi.etapa_id, oi.subetapa, e.ordem
  loop
    v_codigo := 'SUB-' || lpad(r.etapa_ordem::text, 2, '0') || '-' ||
      upper(left(regexp_replace(r.subetapa, '[^a-zA-Z0-9]+', '-', 'g'), 20));

    insert into orcamento_itens (
      orcamento_id, etapa_id, subetapa, tipo_linha, quantidade,
      preco_unitario_snapshot, descricao_snapshot, codigo_snapshot,
      unidade_snapshot, subetapa_valor_manual_ativo
    ) values (
      '9476cc91-649a-4116-a399-f8f05e58924f', r.etapa_id, r.subetapa, 'subetapa', 1,
      0, r.subetapa, v_codigo, 'VB', false
    )
    returning id into v_grupo_id;

    update orcamento_itens
    set grupo_id = v_grupo_id
    where orcamento_id = '9476cc91-649a-4116-a399-f8f05e58924f'
      and tipo_linha = 'item'
      and etapa_id = r.etapa_id
      and subetapa = r.subetapa
      and grupo_id is null;
  end loop;
end $$;

update orcamento_itens
set descricao_snapshot = trim(substring(descricao_snapshot from 15))
where orcamento_id = '9476cc91-649a-4116-a399-f8f05e58924f'
  and descricao_snapshot like 'Mão de obra - %';
