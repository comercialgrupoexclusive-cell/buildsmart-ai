-- Baseline realmente imutável: cliente (anon/authenticated) só pode ler.
-- Só a função iniciar_obra_por_orcamento (agora SECURITY DEFINER, executa
-- como o owner "postgres", que é dono das tabelas de baseline e ignora RLS)
-- pode gravar nelas — nem o próprio usuário do app, direto pelo Supabase
-- client, consegue UPDATE/DELETE.
alter function public.iniciar_obra_por_orcamento(uuid) security definer;

drop policy if exists "orcamento_itens_baseline_all" on public.orcamento_itens_baseline;
drop policy if exists "planejamento_itens_baseline_all" on public.planejamento_itens_baseline;
drop policy if exists "planejamento_dependencias_baseline_all" on public.planejamento_dependencias_baseline;

create policy "orcamento_itens_baseline_select" on public.orcamento_itens_baseline for select using (true);
create policy "planejamento_itens_baseline_select" on public.planejamento_itens_baseline for select using (true);
create policy "planejamento_dependencias_baseline_select" on public.planejamento_dependencias_baseline for select using (true);

revoke insert, update, delete on public.orcamento_itens_baseline from anon, authenticated;
revoke insert, update, delete on public.planejamento_itens_baseline from anon, authenticated;
revoke insert, update, delete on public.planejamento_dependencias_baseline from anon, authenticated;

grant select on public.orcamento_itens_baseline to anon, authenticated;
grant select on public.planejamento_itens_baseline to anon, authenticated;
grant select on public.planejamento_dependencias_baseline to anon, authenticated;

notify pgrst, 'reload schema';
