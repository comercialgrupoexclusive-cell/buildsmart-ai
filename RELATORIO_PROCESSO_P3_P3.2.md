# BuildSmart — Processo P3.2 — Entrada Única

Branch: `processo`
Executor: Claude Code
Status: **PASS**

## Objetivo executado

Implementar a Rodada P3.2 de `PROCESSO_P3_PLANO_ACAO_CLAUDE.md`: a primeira superfície visível do Motor de Processo — `/processos`, `/processos/novo` ("Criar Processo") e `/processos/[id]` com shell mínimo — consumindo só as Actions criadas em P3.1 (`lib/processo`), e o `ProcessContext` canônico da seção 7 do plano.

`/projetos` e `/obras` **não foram tocados** — continuam sendo os caminhos reais de trabalho. `/processos` existe ao lado deles, marcado como "(beta)" na navegação, sem nenhum redirect ou remoção (isso só acontece em P3.7).

## Arquivos alterados

- `lib/processo/context.tsx` *(novo)* — `ProcessProvider`/`useProcessContext`, fornece só `processoId` (nenhum `obraId`/`projetoId` no contrato público, conforme seção 7 do plano).
- `app/(app)/processos/page.tsx` *(novo)* — listagem: busca por nome, filtro por status, grid de cards, botão "Novo Processo".
- `app/(app)/processos/novo/page.tsx` *(novo)* — formulário "Criar Processo" (nome, tipo, cliente, endereço, responsável) chamando `criarProcesso`.
- `app/(app)/processos/[id]/page.tsx` *(novo)* — shell: dados gerais, seletor de status (`alterarStatusProcesso`), e grade de módulos do registry com toggle habilitar/desabilitar (`habilitarModulo`/`desabilitarModulo`) — sem conteúdo de módulo real ainda (isso é P3.3+).
- `components/layout/Sidebar.tsx` — novo item "Processos (beta)" no menu principal, ao lado de Investidor/Projetos/Obras, não no lugar deles.

Nenhuma migration nova nesta rodada (usa só o schema de P3.1).

## Testes executados e resultados

- `npx tsc --noEmit` — limpo.
- `npx eslint app/(app)/processos components/layout/Sidebar.tsx lib/processo/context.tsx` — limpo (1 erro de `react-hooks/set-state-in-effect` corrigido em `[id]/page.tsx`, mesmo padrão de fix já usado em `ProjetoCustosAquisicao.tsx`: `window.setTimeout(() => { void load() }, 0)`).
- `npx vitest run` — 230/230, sem regressão (P3.2 não mexeu na lógica do Core, só consome as Actions).
- `npm run build` — produção OK; rotas novas confirmadas no output: `○ /processos`, `ƒ /processos/[id]`, `○ /processos/novo`.

## Comportamento observado

- Criar um Processo em `/processos/novo` grava em `processos` e habilita os 5 módulos padrão do registry (Dados Gerais, Projeto técnico, Orçamento, Planejamento, Tarefas) via `criarProcesso`, depois redireciona para `/processos/[id]`.
- Em `/processos/[id]`, o seletor de status chama `alterarStatusProcesso` de verdade (persiste no banco e recarrega o Processo); a grade de módulos reflete o estado real de `processo_modulos` e cada toggle chama `habilitarModulo`/`desabilitarModulo`.
- Cada módulo do shell é só um rótulo com estado habilitado/desabilitado — não há tela de Orçamento/Tarefas/etc. dentro do Processo ainda. Isso é esperado e está dito na própria tela ("Nenhum módulo tem tela própria ainda").

## Dívida / pendência encontrada

- Nenhuma nova. As pendências já conhecidas (Gate B fixture, Gate E geocoding ao vivo) são do Núcleo, não desta rodada.

## Riscos

- Baixo: rotas novas e isoladas, sem tocar em dado ou tela existente. O único ponto de atenção é o item novo na Sidebar — visível para todo usuário logado, rotulado "(beta)" para deixar claro que ainda não é funcional para trabalho real.

## Próximo passo recomendado

Rodada **P3.3 — Primeiro módulo real: Orçamento**. Escolher um Orçamento existente para mapear a implementação atual, introduzir `processo_id` sem duplicar o módulo, e provar leitura/escrita pelo contrato do módulo dentro de um Processo criado em P3.2.
