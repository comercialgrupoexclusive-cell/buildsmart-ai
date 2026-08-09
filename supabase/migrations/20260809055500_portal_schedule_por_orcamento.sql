-- Mantem o cronograma do Portal alinhado ao orcamento global selecionado.
create or replace function public.portal_get_schedule(p_token_hash text, p_orcamento_id text default 'todos')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  budget_id uuid;
begin
  acesso := public.portal_authorize(p_token_hash);
  if p_orcamento_id is not null and p_orcamento_id <> 'todos' then
    budget_id := p_orcamento_id::uuid;
    if not exists (select 1 from public.orcamentos where id = budget_id and obra_id = acesso.obra_id) then
      raise exception 'portal_budget_denied' using errcode = '42501';
    end if;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'status', e.status, 'inicio', e.data_inicio,
      'fim', e.data_fim, 'percentual', coalesce(e.percentual_executado, 0)
    ) order by e.ordem)
    from public.etapas e
    where e.obra_id = acesso.obra_id
      and (budget_id is null or exists (
        select 1 from public.orcamento_itens oi
        where oi.orcamento_id = budget_id and oi.etapa_id = e.id
      ))
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_get_schedule(text, text) from public;
grant execute on function public.portal_get_schedule(text, text) to anon, authenticated;
