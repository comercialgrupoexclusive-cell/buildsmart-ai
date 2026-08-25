-- Laboratório Investidor — Marco 3 (Calculadora + Cenários).
-- RPC atômica para marcar um cenário como principal de uma prospecção,
-- respeitando o índice único parcial prospeccao_cenarios_unico_principal
-- (no máximo um principal por prospecção). Sem isso, duas UPDATEs
-- separadas do app (desmarcar todos, marcar um) já seriam seguras em
-- sequência, mas uma RPC evita deixar a prospecção sem nenhum principal
-- caso a segunda UPDATE falhe no meio do caminho.
create or replace function public.prospeccao_cenario_definir_principal(
  p_prospeccao_id uuid,
  p_cenario_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1 from public.prospeccao_cenarios
    where id = p_cenario_id and prospeccao_id = p_prospeccao_id
  ) then
    raise exception 'cenario_nao_encontrado';
  end if;

  update public.prospeccao_cenarios
  set principal = false, updated_at = now()
  where prospeccao_id = p_prospeccao_id and principal = true and id <> p_cenario_id;

  update public.prospeccao_cenarios
  set principal = true, updated_at = now()
  where id = p_cenario_id;
end;
$$;

grant execute on function public.prospeccao_cenario_definir_principal(uuid, uuid) to authenticated, anon;
