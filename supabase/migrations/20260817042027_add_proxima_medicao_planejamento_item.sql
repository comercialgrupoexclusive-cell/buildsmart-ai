alter table public.planejamento_itens
  add column if not exists proxima_medicao_percentual numeric null;

alter table public.planejamento_itens
  drop constraint if exists planejamento_itens_proxima_medicao_percentual_check;

alter table public.planejamento_itens
  add constraint planejamento_itens_proxima_medicao_percentual_check
  check (
    proxima_medicao_percentual is null
    or proxima_medicao_percentual between 0 and 100
  );

create or replace function public.ajustar_proxima_medicao_ao_executado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.proxima_medicao_percentual is not null then
    new.proxima_medicao_percentual := greatest(
      new.proxima_medicao_percentual,
      new.progresso_executado
    );
  end if;
  return new;
end;
$$;

drop trigger if exists planejamento_itens_ajustar_proxima_medicao
  on public.planejamento_itens;

create trigger planejamento_itens_ajustar_proxima_medicao
before insert or update of progresso_executado, proxima_medicao_percentual
on public.planejamento_itens
for each row execute function public.ajustar_proxima_medicao_ao_executado();
