-- P4.6 Bloco B — Planta Baixa 2D do Processo (Axonometra vendorizado, ver
-- vendor/axonometra/VENDOR.md). Cada linha é uma planta/cenário de um
-- Processo — nunca sobrescreve outra (cada "Nova Planta" é uma linha nova).
--
-- plan_json guarda o FloorPlanSerializable inteiro (JSON do próprio editor,
-- version 2 a partir desta rodada — ver PLAN-FORMAT.md do vendor). Não há
-- necessidade de decompor em colunas: o editor é o único leitor/escritor
-- desse formato, e a UI do BuildSmart só precisa de nome/timestamps/autoria
-- para listar. plan_schema_version fica também como coluna própria (redundante
-- com plan_json.version) para permitir consultas/migração em massa no banco
-- sem precisar abrir o JSON.
create table if not exists public.plantas (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  nome text not null,
  plan_json jsonb not null,
  plan_schema_version integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists plantas_processo_id_idx on public.plantas (processo_id);

alter table public.plantas enable row level security;

-- Reaproveita processo_is_accessible (P4.5/P4.6) sem nenhuma regra nova:
-- quem já pode ver/editar o Processo (owner/admin/membro da organização, ou
-- convidado com concessão explícita) pode ver/editar suas plantas. Uma
-- planta não tem dono individual — é um artefato do Processo, como um
-- orçamento ou um cronograma.
create policy plantas_select on public.plantas
  for select to authenticated
  using (public.processo_is_accessible(processo_id));

create policy plantas_write on public.plantas
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));
