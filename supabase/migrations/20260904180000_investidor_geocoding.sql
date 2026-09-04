-- Núcleo N06.2 (Investidor/Imóveis: correção de dados + simplificação de UX).
--
-- Geocoding (lat/long) da Prospecção e dos comparáveis — hoje a busca de
-- comparáveis (pesquisar_comparaveis) usa só web_search + prompt textual de
-- prioridade (mesmo prédio → mesma rua → entorno → bairro), sem nenhum
-- filtro geográfico real. Aditiva e nullable: uma prospecção/comparável sem
-- geocoding ainda funciona exatamente como hoje, só sem o filtro de
-- distância (fallback gracioso quando o serviço de geocoding falhar).
alter table public.prospeccoes add column latitude numeric;
alter table public.prospeccoes add column longitude numeric;
comment on column public.prospeccoes.latitude is 'Geocoding do endereco (Nominatim/OpenStreetMap) — nullable, preenchido ao criar/editar a prospecção. Usado para filtrar/corrigir a similaridade dos comparáveis por distância real.';

alter table public.prospeccao_comparaveis add column latitude numeric;
alter table public.prospeccao_comparaveis add column longitude numeric;
comment on column public.prospeccao_comparaveis.latitude is 'Geocoding best-effort do título/endereço do comparável — nullable (nem todo anúncio tem um endereço específico o bastante para geocodificar). Quando presente, junto com prospeccoes.latitude, corrige a similaridade declarada pela IA se a distância real não bater.';
