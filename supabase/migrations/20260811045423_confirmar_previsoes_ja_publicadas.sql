-- A publicacao existente representava a aprovacao explicita no fluxo anterior.
-- Preserva esses itens no Portal ao introduzir a regra confirmada + publicada.
update public.obra_previsoes
set status = 'confirmada', updated_at = now()
where vigente
  and publicado_cliente
  and status = 'prevista';
