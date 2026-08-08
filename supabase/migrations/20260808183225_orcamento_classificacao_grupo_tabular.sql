alter table public.insumos_proprios
  add column if not exists classificacao text;

update public.insumos_proprios
set classificacao = case upper(coalesce(categoria, ''))
  when 'EQUIPAMENTO' then 'EQUIPAMENTO'
  when 'MAO_DE_OBRA' then 'MAO_DE_OBRA'
  else 'MATERIAL_SERVICOS'
end
where classificacao is null;

alter table public.insumos_proprios
  drop constraint if exists insumos_proprios_classificacao_check;

alter table public.insumos_proprios
  add constraint insumos_proprios_classificacao_check
  check (classificacao is null or classificacao in ('EQUIPAMENTO', 'MAO_DE_OBRA', 'MATERIAL_SERVICOS'));

create or replace function public.sincronizar_classificacao_insumo()
returns trigger
language plpgsql
as $$
begin
  if new.classificacao is null
     or (tg_op = 'UPDATE'
         and new.classificacao is not distinct from old.classificacao
         and new.categoria is distinct from old.categoria) then
    new.classificacao := case upper(coalesce(new.categoria, ''))
      when 'EQUIPAMENTO' then 'EQUIPAMENTO'
      when 'MAO_DE_OBRA' then 'MAO_DE_OBRA'
      else 'MATERIAL_SERVICOS'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_classificacao_insumo on public.insumos_proprios;
create trigger trg_sincronizar_classificacao_insumo
before insert or update of categoria, classificacao
on public.insumos_proprios
for each row execute function public.sincronizar_classificacao_insumo();

alter table public.orcamento_itens
  add column if not exists classificacao_snapshot text,
  add column if not exists grupo_snapshot text,
  add column if not exists subetapa_categoria_snapshot text;

alter table public.orcamento_itens
  drop constraint if exists orcamento_itens_classificacao_snapshot_check;

alter table public.orcamento_itens
  add constraint orcamento_itens_classificacao_snapshot_check
  check (classificacao_snapshot is null or classificacao_snapshot in ('EQUIPAMENTO', 'MAO_DE_OBRA', 'MATERIAL_SERVICOS'));
