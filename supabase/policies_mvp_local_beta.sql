-- ====================================================================
-- Políticas abertas para MVP local beta
--
-- O app ainda não usa autenticação Supabase real; os perfis são perfis
-- locais/lógicos do próprio sistema. Para testar online com a anon key,
-- estas políticas liberam leitura e escrita nas tabelas do MVP.
--
-- Antes de produção real/multiempresa, substituir por políticas por
-- usuário/empresa/obra.
-- ====================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'profiles',
    'obras',
    'orcamentos',
    'orcamento_itens',
    'orcamento_item_insumos',
    'etapas',
    'materiais',
    'medicoes',
    'fornecedores',
    'obra_fornecedores',
    'sinapi_insumos',
    'sinapi_composicoes',
    'sinapi_composicao_itens',
    'composicoes_proprias',
    'composicao_insumos',
    'insumos_proprios'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);

      EXECUTE format('DROP POLICY IF EXISTS bs_mvp_select_all ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS bs_mvp_insert_all ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS bs_mvp_update_all ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS bs_mvp_delete_all ON public.%I', t);

      EXECUTE format('CREATE POLICY bs_mvp_select_all ON public.%I FOR SELECT USING (true)', t);
      EXECUTE format('CREATE POLICY bs_mvp_insert_all ON public.%I FOR INSERT WITH CHECK (true)', t);
      EXECUTE format('CREATE POLICY bs_mvp_update_all ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t);
      EXECUTE format('CREATE POLICY bs_mvp_delete_all ON public.%I FOR DELETE USING (true)', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
