-- Evita acessar campos especificos de outra tabela dentro do trigger generico.
create or replace function public.portal_notification_admin_fallback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.board_items;
  v_obra_id uuid;
  v_mensagem text;
begin
  if tg_table_name = 'board_item_comments' then
    select i.* into item from public.board_items i where i.id = new.board_item_id;
    v_mensagem := new.mensagem;
  else
    item := new;
    v_mensagem := item.titulo;
  end if;

  select b.obra_id into v_obra_id
  from public.boards b
  where b.id = item.board_id and b.scope = 'portal';

  if v_obra_id is null or item.visibility <> 'client' then return new; end if;
  if exists (select 1 from public.obra_usuarios ou where ou.obra_id = v_obra_id) then return new; end if;

  insert into public.portal_notifications (usuario_id, obra_id, board_item_id, tipo, titulo, mensagem)
  select p.id, v_obra_id, item.id,
    case when tg_table_name = 'board_item_comments' then 'board_comment_created'
         when tg_op = 'INSERT' then 'board_item_created'
         else 'board_item_updated' end,
    case when tg_table_name = 'board_item_comments' then 'Novo comentario no Portal'
         when tg_op = 'INSERT' then 'Nova anotacao do cliente'
         else 'Anotacao do Portal atualizada' end,
    v_mensagem
  from public.profiles p
  where p.tipo = 'admin';

  return new;
end;
$$;

revoke all on function public.portal_notification_admin_fallback() from public;
