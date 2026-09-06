# BuildSmart — Processo P3.1 — Fundação do Domínio

Branch: `processo`
Executor: Claude Code
Status: **PASS**

## Objetivo executado

Implementar a fundação do Motor de Processo (Core) descrita em `PROCESSO_P3_PLANO_ACAO_CLAUDE.md`, seção 11, Rodada P3.1: entidade raiz nova `processos`, vínculo de módulos `processo_modulos`, domínio/repository/service/actions e testes — **sem tocar em nenhuma tabela ou comportamento legado** (`projetos`, `obras` e módulos existentes permanecem intactos e não são lidos por este código).

## Arquivos alterados

Todos novos — nenhum arquivo existente foi modificado.

- `supabase/migrations/20260906120000_processo_fundacao.sql`
- `lib/processo/domain/types.ts` — `Processo`, `ProcessoStatus`, `ProcessoModuloVinculo`, tipos de input.
- `lib/processo/domain/module-registry.ts` — registry tipado dos 12 módulos da seção 4 do plano, com `enabledByDefault` para os 5 primeiros (Dados Gerais, Projeto técnico, Orçamento, Planejamento, Tarefas).
- `lib/processo/repository/processo-repository.ts` — único ponto que fala com as tabelas `processos`/`processo_modulos`; recebe o `SupabaseClient` (não cria o seu), sem regra de negócio.
- `lib/processo/service/processo-service.ts` — validação de nome/status/módulo, normalização de texto, bookkeeping de `archived_at`.
- `lib/processo/actions/processo-actions.ts` — as 8 Actions mínimas da seção 6 do plano: `criarProcesso`, `obterProcesso`, `listarProcessos`, `atualizarDadosProcesso`, `alterarStatusProcesso`, `habilitarModulo`, `desabilitarModulo`, `listarModulosDoProcesso` (+ `listarModulosDisponiveis` para expor o registry).
- `lib/processo/index.ts` — barrel público (`import { criarProcesso } from '@/lib/processo'`); repository/service não devem ser importados fora da pasta.
- `lib/__tests__/processo.test.ts` — 17 testes unitários com `FakeDB` (mesmo padrão de `investidor-ai-tools.test.ts`), sem rede.

## Migrations criadas

`20260906120000_processo_fundacao.sql` — aditiva, cria do zero:
- `public.processos` (id, organization_id nullable, nome, tipo, cliente_nome, endereco, responsavel_id → `profiles.id`, status com CHECK no vocabulário `ACTIVE|ON_HOLD|COMPLETED|ARCHIVED`, created_at/updated_at/archived_at). RLS habilitada com policy permissiva (`using(true) with check(true)`), mesmo padrão já usado em `projeto_custos_aquisicao` e demais tabelas do app.
- `public.processo_modulos` (id, processo_id → `processos.id` on delete cascade, module_key, enabled, enabled_at, disabled_at, unique(processo_id, module_key)). RLS na mesma política permissiva.
- Aplicada ao vivo no projeto Supabase (`jwezrjyatfjvvsugtugo`) via MCP — confirmado `{"success":true}`.
- Nenhuma tabela legada foi lida, alterada ou referenciada.

## Testes executados e resultados

- `npx tsc --noEmit` — limpo.
- `npx eslint lib/processo lib/__tests__/processo.test.ts` — limpo.
- `npx vitest run` — **230/230** (17 novos de `processo.test.ts` + 213 pré-existentes, zero regressão).
- `npm run build` — produção OK, todas as rotas existentes geradas normalmente (nenhuma rota nova criada nesta rodada — P3.2 é quem cria `/processos`).

Cobertura dos 17 testes novos: criação com módulos padrão do registry e com lista explícita; rejeição de nome vazio e de módulo desconhecido; normalização de texto em branco para `null`; `obterProcesso` retornando `null` para id inexistente; `listarProcessos` filtrando por `status` e por nome (`q`); `atualizarDadosProcesso` (sucesso, nome vazio, processo inexistente); `alterarStatusProcesso` (arquivar preenche `archived_at`, restaurar limpa, status fora do vocabulário rejeita); `habilitarModulo`/`desabilitarModulo` (toggle, habilitar módulo fora da lista inicial, módulo desconhecido, processo inexistente); `listarModulosDisponiveis` expõe o registry completo.

## Comportamento observado

- `criarProcesso` sem `modulos` explícito habilita automaticamente os 5 módulos com `enabledByDefault: true` do registry — nenhum caller precisa conhecer essa lista.
- `alterarStatusProcesso` é a única regra de transição implementada nesta rodada: mover para `ARCHIVED` carimba `archived_at`; mover para qualquer outro status limpa `archived_at`. Não há grafo de transições restritivo (ex.: impedir `COMPLETED → ACTIVE`) — o plano P3.1 não pediu isso e o P2 não define esse detalhe; fica em aberto para quando houver caso de uso real.
- Nenhuma rota de API nem tela nova foi criada — isso é P3.2 ("Entrada única": `/processos`, `Criar Processo`, `ProcessContext`).
- Nenhuma tool da Luiza foi tocada — isso é P3.7, e só depois de P3.2-P3.6 estarem prontos, conforme a ordem de execução do plano.

## Dívida / pendência encontrada

- O plano (seção 3.2) menciona `cliente_id ou referência equivalente, se já houver modelo confiável`. Não existe hoje uma tabela `clientes` no schema (só `cliente_nome`/`cliente_contato` como texto livre em `obras`) — usei `cliente_nome text` seguindo o mesmo padrão já existente em `obras`, em vez de inventar uma tabela nova fora do escopo desta rodada. Se um cadastro de clientes real surgir depois, migrar para `cliente_id` é uma migração aditiva simples.
- `organization_id` ficou `uuid` solto sem FK (Organization não é operacional ainda, conforme o próprio plano antecipa).

## Riscos

- Nenhum: a rodada não toca em dado nem comportamento existente. As duas tabelas novas ficam vazias e inertes até P3.2 criar a primeira tela que grava nelas.

## Próximo passo recomendado

Rodada **P3.2 — Entrada única**: criar `/processos`, `/processos/novo` (tela "Criar Processo"), `/processos/[id]` com shell mínimo, e o `ProcessContext` (contexto canônico de aplicação, carregando só `processoId` — sem `obraId`/`projetoId` na API pública). Consumir as Actions criadas aqui (`lib/processo`) sem tocar no repository/service. Não remover nem redirecionar `/obras` e `/projetos` ainda — o plano só autoriza isso em P3.7, depois que os módulos operacionais tiverem migrado e o Allegra (P3.8) tiver passado no teste de aceite.
