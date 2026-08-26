-- Planning de Projetos: duração em dias como campo de primeira classe em
-- projeto_itens. Já validado no fluxo (marco externo aprovado → dependentes
-- iniciam no dia seguinte → prazo = início + duracao_dias); esta migração
-- só formaliza no repositório o que já foi aplicado ao vivo no banco.
--
-- Idempotente (IF NOT EXISTS): não recria nada se já existir. Nullable e sem
-- default — itens antigos continuam funcionando via fallback derivado de
-- data_inicio/data_prazo no código (ver effectiveDuracao em
-- components/projeto/ProjetoCascata.tsx e ProjetoCronograma.tsx). Marco
-- (is_marco=true) não usa este campo — fica null.
--
-- NOTA (divergência encontrada): as tabelas projeto_itens e
-- projeto_item_dependencias em si não têm migração de criação neste
-- repositório (foram aplicadas diretamente no banco em rodada anterior,
-- fora do controle de versão). Fora de escopo desta mudança recriar essa
-- migração retroativa — ver RELATORIO_PLANNING_PROJETOS_DURACAO.md.
alter table public.projeto_itens
  add column if not exists duracao_dias integer;

comment on column public.projeto_itens.duracao_dias is
  'Duração em dias corridos. Usada para calcular data_prazo = data_inicio + duracao_dias ao reagendar por predecessora. Marco (is_marco=true) não usa este campo.';
