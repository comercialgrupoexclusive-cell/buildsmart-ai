-- Unificação Caixa de Entrada + Tarefas: referência, não cópia.
--
-- Hoje, quando uma entrada da Caixa é triada como "tarefa", o conteúdo é
-- RE-DIGITADO numa linha nova de `tarefas` e a triagem tenta amarrar o id
-- procurando a tarefa "pelo título mais recente" (lib/caixa-entrada/
-- triagem-runtime.ts). Isso é frágil: auditoria mostrou 4 triagens e 0 com
-- tarefa_id preenchido — o vínculo não estava se formando.
--
-- A correção estrutural é uma referência direta: a tarefa aponta para a
-- entrada que a originou. A entrada continua sendo a fonte de verdade do que
-- foi dito (append-only); a tarefa carrega a ação. Nada é duplicado sem
-- vínculo. Com a referência, amarrar a triagem vira um .eq determinístico, não
-- um palpite por título.
--
-- Aditivo e reversível: nullable (tarefa avulsa nunca veio da Caixa),
-- on delete set null (apagar a entrada não apaga a tarefa, só perde a origem).
-- Rollback: drop index idx_tarefas_origem_entrada_id;
--           alter table public.tarefas drop column origem_entrada_id;

alter table public.tarefas
  add column if not exists origem_entrada_id uuid
  references public.processo_caixa_entrada(id) on delete set null;

comment on column public.tarefas.origem_entrada_id is
  'Entrada da Caixa (processo_caixa_entrada) que originou esta tarefa, quando veio de uma triagem. Referência, não cópia: o conteúdo bruto vive na entrada; a tarefa é a ação derivada. Null para tarefa criada direto.';

create index if not exists idx_tarefas_origem_entrada_id
  on public.tarefas(origem_entrada_id) where origem_entrada_id is not null;
