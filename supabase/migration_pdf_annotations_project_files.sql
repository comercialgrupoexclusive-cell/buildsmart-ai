-- PDF annotations and project item attachments
create table if not exists public.pdf_annotations (
  id uuid primary key default gen_random_uuid(),
  file_url text not null,
  context_type text not null check (context_type in ('obra', 'projeto')),
  context_id uuid not null,
  item_id text null,
  page_number integer not null,
  annotations_json jsonb not null default '{}'::jsonb,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  unique (file_url, context_type, context_id, item_id, page_number)
);

create table if not exists public.project_item_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projetos(id) on delete cascade,
  item_id uuid not null references public.projeto_itens(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size bigint null,
  uploaded_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pdf_annotations_context
  on public.pdf_annotations(context_type, context_id, item_id);

create index if not exists idx_project_item_files_project_item
  on public.project_item_files(project_id, item_id);
