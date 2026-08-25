# RELATORIO INVESTIDOR - RODADA 08

## Escopo

Rodada 8 - Rotinas + Agentes.

Implementacao limitada ao Laboratorio Investidor. Nao foi implementado Marco posterior, automacao silenciosa, audio, anexos novos, alteracao em Tarefas/Avisos/Geral, nem mudanca em Planejamento/Obras/Financeiro.

## Arquitetura

- Agente = skill + contexto + permissoes + configuracao.
- Rotina = gatilho assistido associado a um agente.
- Run = historico auditavel de uma execucao.
- Nesta rodada, as rotinas ficam prontas para agendamento futuro, mas executam apenas manualmente por UI ou por Luiza Work com confirmacao.

## Migrations

- `supabase/migrations/20260825193000_investidor_rotinas_agentes.sql`
  - cria `investidor_agentes`;
  - cria `investidor_rotinas`;
  - cria `investidor_rotina_runs`;
  - cria RPC `investidor_executar_rotina`;
  - amplia o CHECK de `luizia_pending_task_actions.tool` para rotinas do Investidor.
- `supabase/migrations/20260825194500_investidor_rotina_padrao.sql`
  - cria a rotina inicial `Triagem semanal de prospecções`, manual e assistida.

Migrations aplicadas no Supabase `jwezrjyatfjvvsugtugo` pelo conector Supabase.

## UI

- `app/(app)/investidor/page.tsx`
  - adicionada aba `Rotinas`;
  - exibe Agentes, Rotinas e Historico de execucoes;
  - permite criar rotina manualmente;
  - permite pausar/ativar rotina;
  - permite executar rotina com confirmacao explicita;
  - execucao manual registra run e nao altera prospeccoes/cenarios/ativos.

## Luiza

- `lib/investidor-ai-tools.ts`
  - novas tools de leitura:
    - `list_agentes_investidor`;
    - `list_rotinas_investidor`.
  - novas tools de proposta:
    - `propose_create_rotina_investidor`;
    - `propose_update_rotina_investidor`;
    - `propose_run_rotina_investidor`.
  - confirmacao executa:
    - `create_investidor_rotina`;
    - `update_investidor_rotina`;
    - `run_investidor_rotina`.
- `lib/luizia-investidor-runtime.ts`
  - Chat continua somente leitura.
  - Work continua exigindo proposta e confirmacao explicita.
  - Rotinas entram no mesmo mecanismo de propostas pendentes.
- `lib/luizia-pending-actions.ts`
  - tipo de proposta ampliado para rotinas do Investidor.

## Segurança e Escrita

- Nenhuma rotina executa automaticamente.
- Chat nao cria, edita nem executa rotina.
- Executar rotina pela Luiza exige Work + proposta + confirmacao.
- A RPC de execucao registra somente historico (`investidor_rotina_runs`) e atualiza `ultima_execucao` da rotina.
- A execucao nao altera `prospeccoes`, `prospeccao_cenarios` nem `projetos`.

## Validacao no Supabase

- Projeto validado: `jwezrjyatfjvvsugtugo`.
- Apos migrations:
  - agentes: 1;
  - rotinas: 1;
  - runs: 1 apos execucao de validacao;
  - prospeccoes permaneceram 1 antes/depois da execucao.
- Resumo do run validado:
  - `Agente de Prospecção executou "Triagem semanal de prospecções": 1 prospecção(ões), 0 em análise, 0 leilão(ões) nos próximos 14 dias, 1 sem cenário financeiro.`

## Testes

- TypeScript: passou com `npx tsc --noEmit`.
- Testes completos: passou com `npm run test` - 10 arquivos, 124 testes.
- Build Next.js: passou com `npm run build`.
- Lint aplicado: passou sem erros nos arquivos relevantes; ficaram apenas 3 warnings legados de `<img>` em `app/(app)/investidor/page.tsx`.
- `git diff --check`: passou.

## Arquivos Alterados

- `app/(app)/investidor/page.tsx`
- `lib/investidor-ai-tools.ts`
- `lib/luizia-investidor-runtime.ts`
- `lib/luizia-pending-actions.ts`
- `lib/types.ts`
- `lib/__tests__/fake-supabase.ts`
- `lib/__tests__/investidor-ai-tools.test.ts`
- `supabase/migrations/20260825193000_investidor_rotinas_agentes.sql`
- `supabase/migrations/20260825194500_investidor_rotina_padrao.sql`

## Limitações

- Nao foi criado cron job real.
- Nao foi criado agente autonomo que escreve sozinho.
- Web Search permanece restrito ao runtime Investidor da Rodada 7 e nao foi usado pela RPC de rotina.
- Regras de RLS ainda seguem o padrao MVP amplo do modulo Investidor; endurecimento por perfil fica para rodada propria de seguranca.
