-- A migração anterior (conferencia_orcamento_checkbox_simples) mudou o tipo
-- do 6º parâmetro de boolean (p_incluir_filhos) para uuid (p_orcamento_item_id)
-- + acrescentou um 7º (jsonb) — isso NÃO conta como "mesma assinatura" para
-- o Postgres, então CREATE OR REPLACE criou um overload novo em vez de
-- substituir o antigo, deixando as duas versões coexistindo e ambíguas para
-- chamadas com exatamente 5 argumentos posicionais (a app sempre nomeia os
-- parâmetros, então não quebrou nada em produção, mas fica ambíguo em SQL
-- direto e é lixo de schema). Remove o overload antigo.
drop function if exists public.orcamento_verificacao_marcar(uuid, text, uuid, text, uuid, boolean);
