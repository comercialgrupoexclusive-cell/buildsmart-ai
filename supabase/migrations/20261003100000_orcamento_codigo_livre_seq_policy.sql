-- Corrige o lançamento de item "Livre" no orçamento (erro 42501 em
-- gerar_codigo_item_livre).
--
-- Causa: orcamento_codigo_livre_seq (contador dos códigos LIV-001…) tinha RLS ligada
-- e só uma política RESTRITIVA (auth_global_orcamento_sequence_guard). Política
-- restritiva só estreita o que uma permissiva já permite; sem nenhuma permissiva,
-- o acesso é negado a todos. As tabelas irmãs (orcamentos, orcamento_itens, etapas)
-- têm a dupla permissiva + restritiva; esta ficou sem a permissiva.
--
-- Correção: política permissiva com a mesma regra das irmãs (o usuário só mexe no
-- contador de um orçamento cujo Processo ele acessa), restrita a usuários logados.
-- Não altera a função nem abre acesso entre organizações.
--
-- Rollback: drop policy orcamento_codigo_livre_seq_all on public.orcamento_codigo_livre_seq;

drop policy if exists orcamento_codigo_livre_seq_all on public.orcamento_codigo_livre_seq;

create policy orcamento_codigo_livre_seq_all on public.orcamento_codigo_livre_seq
  as permissive for all to authenticated
  using (public.processo_is_accessible((
    select o.processo_id from public.orcamentos o
    where o.id = orcamento_codigo_livre_seq.orcamento_id)))
  with check (public.processo_is_accessible((
    select o.processo_id from public.orcamentos o
    where o.id = orcamento_codigo_livre_seq.orcamento_id)));
