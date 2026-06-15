create table if not exists public.obra_files (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  nome text not null,
  tipo text not null default 'arquivo',
  tamanho bigint not null default 0,
  categoria text not null default 'outro' check (categoria in ('projeto', 'planta', 'memorial', 'imagem', 'outro')),
  url text,
  uploaded_by text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_obra_files_obra_id on public.obra_files(obra_id);

alter table public.obra_files enable row level security;

drop policy if exists "obra_files_all" on public.obra_files;
create policy "obra_files_all"
on public.obra_files
for all
using (true)
with check (true);
