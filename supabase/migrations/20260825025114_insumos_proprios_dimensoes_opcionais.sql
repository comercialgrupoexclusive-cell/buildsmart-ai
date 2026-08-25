-- Evolução simples do cadastro de insumos próprios (empresa): 4 campos numéricos
-- opcionais e genéricos para permitir registrar dimensões físicas quando fizer
-- sentido (tábua: comprimento/largura/espessura; barra: comprimento/diâmetro;
-- piso: comprimento/largura). Deliberadamente sem tipo_geometrico, dimensao_1/2/3,
-- sistema de embalagem ou campos específicos de material — fora de escopo desta
-- rodada. Um motor de derivação de área/volume pode vir depois, não agora.
alter table public.insumos_proprios
  add column if not exists comprimento numeric,
  add column if not exists largura numeric,
  add column if not exists espessura numeric,
  add column if not exists diametro numeric;

comment on column public.insumos_proprios.comprimento is 'Comprimento em metros, opcional — uso genérico (ex.: tábua, barra de aço).';
comment on column public.insumos_proprios.largura is 'Largura em metros, opcional — uso genérico (ex.: tábua, piso).';
comment on column public.insumos_proprios.espessura is 'Espessura em metros, opcional — uso genérico (ex.: tábua, piso).';
comment on column public.insumos_proprios.diametro is 'Diâmetro em metros, opcional — uso genérico (ex.: barra de aço).';
