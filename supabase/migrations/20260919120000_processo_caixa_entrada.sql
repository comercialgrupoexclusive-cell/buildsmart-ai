-- Caixa de Entrada do Processo — fundação do objeto de entrada bruta.
--
-- Auditoria feita antes desta migration (sem estrutura paralela):
--   * feed_items/feed_item_files (20260809224039) são o feed CURADO e
--     publicado ao cliente, escopado por obra_id — não é "realidade bruta".
--   * obra_files tem obra_id NOT NULL e colunas de portal/IA que não fazem
--     sentido aqui (publicado_cliente, source_type/source_id) — mesmo motivo
--     que levou a prospeccao_arquivos a não reaproveitar obra_files.
--   * luizia_tarefas_log e luizia_pending_task_actions são precedentes de
--     audit-log e de card de aprovação, respectivamente, mas nenhum dos dois
--     é o objeto de entrada em si.
--   * Não existe tabela de "ocorrências" no schema.
--   * O padrão de anexo replicado aqui é o de prospeccao_arquivos: tabela
--     pequena e dedicada + bucket de Storage já existente (`project-files`)
--     com prefixo próprio — não um bucket novo.
--
-- Regra de produto (não renegociável): a entrada bruta nunca é sobrescrita
-- pela interpretação da IA. Por isso esta tabela NÃO tem nenhuma coluna de
-- análise/classificação — qualquer camada derivada (fatos extraídos, ações
-- executadas, divergências, cards de revisão) será uma tabela separada que
-- referencia esta por id, no formato agentes/Flow que vier depois. Por isso
-- também não existem policies de UPDATE/DELETE: uma vez gravada, a entrada é
-- append-only nesta fundação.
create table public.processo_caixa_entrada (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  autor_profile_id uuid references public.profiles(id) on delete set null,
  tipo text not null check (tipo in ('texto', 'imagem', 'documento', 'audio')),
  origem text not null default 'web' check (origem in ('web', 'whatsapp', 'api')),
  conteudo_texto text,
  arquivo_url text,
  arquivo_nome text,
  arquivo_tipo text,
  arquivo_tamanho bigint,
  duracao_segundos integer,
  status text not null default 'novo' check (status in ('novo', 'processando', 'revisado', 'arquivado')),
  created_at timestamptz not null default now(),
  check (
    (tipo = 'texto' and conteudo_texto is not null and trim(conteudo_texto) <> '')
    or (tipo <> 'texto' and arquivo_url is not null)
  )
);

comment on table public.processo_caixa_entrada is
  'Realidade bruta recebida pelo Processo (texto livre, imagem, documento ou áudio), preservada integralmente. Nunca sobrescrita por interpretação de agente — camadas derivadas (análise, fatos, ações, divergências, cards de revisão, vínculo com Tempo/Flow) devem viver em tabelas próprias referenciando esta por id, nunca mutando esta linha.';
comment on column public.processo_caixa_entrada.autor_profile_id is
  'Forçado por trigger a partir de current_profile_id() — nunca aceito do cliente (mesmo risco de bypass já corrigido em orcamento_atualizar_com_ator/orcamento_verificacao_marcar).';
comment on column public.processo_caixa_entrada.status is
  'Estado operacional simples da entrada nesta rodada (novo/processando/revisado/arquivado) — não é classificação de conteúdo, é só rastro de progresso para a futura camada de agentes.';

create index idx_processo_caixa_entrada_processo_id_created_at
  on public.processo_caixa_entrada (processo_id, created_at desc);

-- autor_profile_id nunca vem do cliente: o mesmo padrão de risco já
-- identificado em funções antigas que confiavam em p_profile_id do caller
-- (quarentenadas em 20260917061212_fundacao_auth_global.sql). Aqui a defesa
-- é estrutural: um trigger BEFORE INSERT reescreve a coluna sempre.
create function public.processo_caixa_entrada_set_autor() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.autor_profile_id := public.current_profile_id();
  return new;
end
$$;

create trigger processo_caixa_entrada_autor
  before insert on public.processo_caixa_entrada
  for each row execute function public.processo_caixa_entrada_set_autor();

alter table public.processo_caixa_entrada enable row level security;

-- Mesma fonte de verdade de acesso por Processo que todo o resto do motor
-- usa (processo_is_accessible → organização da sessão + membership ativo).
create policy processo_caixa_entrada_select on public.processo_caixa_entrada
  for select to authenticated
  using (public.processo_is_accessible(processo_id));

create policy processo_caixa_entrada_insert on public.processo_caixa_entrada
  for insert to authenticated
  with check (public.processo_is_accessible(processo_id));

revoke all on public.processo_caixa_entrada from public, anon, authenticated;
grant select, insert on public.processo_caixa_entrada to authenticated;
revoke all on function public.processo_caixa_entrada_set_autor() from public, anon, authenticated;

-- Documentos comuns (Word/Excel/texto/CSV) e áudio gravado no navegador
-- ainda não eram aceitos no bucket compartilhado (só PDF + imagens, de
-- 20260809233514_project_files_image_mimes.sql).
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a'
]
where id = 'project-files';
