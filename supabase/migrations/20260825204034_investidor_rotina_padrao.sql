-- Rodada 8 — rotina inicial assistida para o Agente de Prospecção.
-- Deixa a aba Rotinas útil logo após aplicar a fundação, sem automação
-- silenciosa: frequencia='manual' e execução só por clique/confirmação.
--
-- NOTA (Hotfix pré-reunião, sincronização de drift): idem ao arquivo
-- anterior — já aplicada ao vivo fora do controle de versão, só espelhada
-- aqui. Nenhuma tela ou tool desta rodada usa esta rotina/seed.
insert into public.investidor_rotinas (agente_id, nome, descricao, tipo, frequencia, ativo, parametros)
select a.id,
       'Triagem semanal de prospecções',
       'Verifica oportunidades em análise, leilões próximos e prospecções sem cenário financeiro.',
       'triagem_prospeccoes',
       'manual',
       true,
       '{"origem":"seed_rodada_8"}'::jsonb
from public.investidor_agentes a
where a.nome = 'Agente de Prospecção'
  and not exists (
    select 1
    from public.investidor_rotinas r
    where r.nome = 'Triagem semanal de prospecções'
  );
