-- A migração anterior revogou INSERT/UPDATE/DELETE mas esqueceu TRUNCATE
-- (e REFERENCES/TRIGGER) do GRANT ALL original — qualquer cliente anon
-- ainda podia TRUNCATE TABLE e apagar a baseline inteira de uma vez.
-- Cliente agora só tem SELECT, ponto.
revoke truncate, references, trigger on public.orcamento_itens_baseline from anon, authenticated;
revoke truncate, references, trigger on public.planejamento_itens_baseline from anon, authenticated;
revoke truncate, references, trigger on public.planejamento_dependencias_baseline from anon, authenticated;
