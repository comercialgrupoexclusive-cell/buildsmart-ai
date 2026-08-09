-- Normaliza itens antigos importados com identificacao no nome, mas sem classe.
update public.orcamento_itens
set classificacao_snapshot = 'MAO_DE_OBRA',
    updated_at = now()
where classificacao_snapshot is distinct from 'MAO_DE_OBRA'
  and (
    descricao_snapshot ilike '%mão de obra%'
    or descricao_snapshot ilike '%mao de obra%'
  );
