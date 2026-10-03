-- Branding da organização (nome do assistente de IA + logo) editável SÓ por
-- owner/admin da própria organização, sem abrir UPDATE geral em `organizations`
-- (que só tem política de leitura). Mesmo padrão das funções *_admin_* do
-- portal: SECURITY DEFINER, search_path vazio, erros com errcode explícito.
--
-- Atualiza apenas assistente_nome e logo_url da organização da sessão atual.
-- Nome vazio volta ao default genérico "Assistente"; logo vazio remove a logo.
--
-- Rollback: drop function public.organizacao_branding_atualizar(text, text);

create or replace function public.organizacao_branding_atualizar(p_assistente_nome text, p_logo_url text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_org uuid := public.current_organization_id();
  v_nome text := nullif(btrim(coalesce(p_assistente_nome, '')), '');
  v_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
begin
  if v_org is null then
    raise exception 'organizacao_nao_selecionada' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid() and m.organization_id = v_org
      and m.ativo and m.role in ('owner', 'admin')
  ) then
    raise exception 'apenas_admin_da_organizacao' using errcode = '42501';
  end if;

  if v_nome is not null and char_length(v_nome) > 40 then
    raise exception 'assistente_nome_muito_longo' using errcode = '22023';
  end if;

  if v_logo is not null and (char_length(v_logo) > 500 or v_logo !~* '^https?://') then
    raise exception 'logo_url_invalida' using errcode = '22023';
  end if;

  update public.organizations
     set assistente_nome = coalesce(v_nome, 'Assistente'),
         logo_url = v_logo
   where id = v_org;

  return jsonb_build_object(
    'assistente_nome', coalesce(v_nome, 'Assistente'),
    'logo_url', v_logo
  );
end;
$$;

revoke all on function public.organizacao_branding_atualizar(text, text) from public, anon;
grant execute on function public.organizacao_branding_atualizar(text, text) to authenticated;
