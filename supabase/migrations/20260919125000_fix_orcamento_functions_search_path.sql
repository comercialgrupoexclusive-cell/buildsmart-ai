-- Higiene de segurança: 6 funções de cálculo de orçamento (SECURITY INVOKER,
-- não SECURITY DEFINER — risco bem menor que os helpers da fundação de auth,
-- mas ainda vale fixar) estavam sem search_path travado. Todas já
-- referenciam every tabela com prefixo public. explícito, então travar em
-- '' é seguro — não dependem de resolução implícita de schema.
alter function public.gerar_codigo_item_livre(uuid) set search_path = '';
alter function public.preco_vigente_insumo(uuid, uuid, text) set search_path = '';
alter function public.orcamento_item_valor(uuid) set search_path = '';
alter function public.preco_vigente_composicao(uuid, uuid, text) set search_path = '';
alter function public.orcamento_item_insumos_detalhe(uuid) set search_path = '';
alter function public.orcamento_arvore_valores(uuid[]) set search_path = '';
