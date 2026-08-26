# Relatório — Duração e Predecessoras no Cronograma de Projetos

## Alvo

Finalizar no código o suporte a **duração em dias** (`duracao_dias`) e **predecessoras** no cronograma de Projetos (`app/(app)/projetos/[id]/page.tsx` + `components/projeto/ProjetoCronograma.tsx` + `components/projeto/ProjetoCascata.tsx`), sem criar um novo sistema de cronograma e sem duplicar a EAP em `planejamento_itens` (essa tabela é exclusiva do Planning de Obras).

## Diagnóstico

`projeto_itens` já tinha a coluna `duracao_dias` (integer, nullable) aplicada diretamente no banco em rodada anterior, mas:

1. **Nenhum dos três arquivos usava o campo.** `ProjetoCascata.tsx` e `ProjetoCronograma.tsx` calculavam a duração exibida *derivando* de `data_prazo - data_inicio` (`calcDurationDays`/`daysBetween`) e, ao editar o campo "Duração", só recalculavam `data_prazo` — nunca liam nem gravavam `duracao_dias`. O tipo `ProjetoItemNode` (fonte única dos dois componentes) nem declarava o campo.
2. **A engine de reagendamento por predecessora** (`scheduleFromDependencies`, dentro de `app/(app)/projetos/[id]/page.tsx`) empurra a data de início de um item dependente para o dia seguinte ao término efetivo da(s) predecessora(s) — isso já está correto e é o comportamento validado (FS = Finish-to-Start, único tipo suportado; `projeto_item_dependencias` nem tem coluna de tipo, então FS é implicitamente o único e o padrão). O problema: quando o item dependente **ainda não tinha nenhuma data própria** (ex.: uma tarefa que só existe hoje como "depende do marco X", sem início/fim definidos), a engine simplesmente cravava `data_prazo = data_inicio` (duração zero) — ignorando qualquer `duracao_dias` já preenchido no item. Ou seja, o fluxo "Marco externo aprovado → dependentes iniciam no dia seguinte → prazo = início + duracao_dias" **não fechava** para esse caso, que é justamente o caso de uso real mais comum (planejar a duração de uma tarefa antes de saber quando ela vai começar, porque depende de uma aprovação externa).
3. **Marco não precisa de duração** já era respeitado indiretamente (marco nunca tinha "Duração" como conceito com sentido), mas não havia nenhuma trava explícita — um marco podia, em tese, ganhar uma duração calculada se alguém preenchesse `data_prazo` diferente de `data_inicio`.
4. **Divergência de controle de versão encontrada (fora do escopo desta mudança):** as tabelas `projeto_itens` e `projeto_item_dependencias` **não têm nenhuma migração de criação no repositório** — foram aplicadas diretamente no banco em algum momento anterior sem migração correspondente commitada. A busca por `create table.*projeto_itens` e por `projeto_item_dependencias` em `supabase/migrations/` não retornou nada. Isso significa que hoje só o banco vivo é a fonte de verdade do schema completo dessas duas tabelas — não apenas de `duracao_dias`. Reconstituir essa migração retroativa (das duas tabelas inteiras) é uma mudança maior e não fazia parte do pedido ("adicionar migração correspondente ao campo `duracao_dias` já aplicado"), então não foi feita aqui; fica registrada como risco/débito técnico.
5. **`lib/projeto-ai-tools.ts` (Luiza/IA) não foi tocado** — o tool `update_item_projeto` já aceita `data_inicio`/`data_prazo`/`is_marco`, mas escreve direto na tabela sem passar pela engine de reagendamento (que é 100% client-side, em `page.tsx`) e não tem parâmetro para `duracao_dias`. Isso é uma limitação pré-existente (edições feitas pela Luiza não disparam o reagendamento por predecessora, com ou sem esta mudança) e não estava na lista de arquivos a inspecionar — não foi alterado, para não sair do escopo pedido.

## Solução

### 1. Tipos (`components/projeto/ProjetoCascata.tsx`)
- `ProjetoItemNode` ganhou `duracao_dias: number | null`.
- `ProjetoItemUpdate` (usado pelos dois componentes e por `page.tsx`) passou a aceitar `duracao_dias` como campo editável.
- Novo helper `effectiveDuracao(item)`: usa `item.duracao_dias` quando presente; senão deriva de `data_inicio`/`data_prazo` (compatibilidade com itens antigos que nunca tiveram o campo preenchido — nenhum dado existente muda de comportamento).

### 2. UI de duração (`ProjetoCascata.tsx` e `ProjetoCronograma.tsx`, desktop + mobile)
Em ambos os componentes, a coluna/campo "Duração":
- Agora **lê e grava `duracao_dias`** (antes só existia como número derivado, nunca persistido).
- Ao editar a **Duração**, grava `duracao_dias` e recalcula `data_prazo = data_inicio + duracao_dias` (quando já existe início).
- Ao editar o **Início**, se o item já tiver `duracao_dias` definido (e não for marco), recalcula automaticamente `data_prazo = novo início + duracao_dias` — mantém a duração ao invés de deixá-la "descolar".
- Ao editar o **Fim** diretamente (continua editável — "preservar data_inicio/data_prazo"), recalcula `duracao_dias = fim - início`, para manter os dois jeitos de editar em sincronia.
- **Marco não mostra duração editável**: campo desabilitado com `—` quando `item.is_marco`.

Nenhuma coluna, filtro, Kanban ou barra do Gantt foi removida ou renomeada — só o campo de duração passou a ser persistido em vez de só calculado on-the-fly.

### 3. Reagendamento por predecessora (`app/(app)/projetos/[id]/page.tsx`, `scheduleFromDependencies`)
Único ponto de mudança de lógica de negócio. No caso em que um item dependente **ainda não tem data efetiva própria** (nem ele, nem — se for um item-pai — nenhum filho seu):
- **Antes:** `data_inicio = data_prazo = diaSeguinteAoFimDaPredecessora` (duração sempre zero nesse caso).
- **Agora:** `data_inicio = diaSeguinteAoFimDaPredecessora`; e **se o item é uma folha, não é marco e tem `duracao_dias` preenchido**, `data_prazo = data_inicio + duracao_dias`. Item-pai (deriva prazo dos filhos) e marco continuam com o comportamento anterior (prazo = início, sem duração).
- O outro caminho da engine — item que **já tinha** início/fim e é empurrado por uma mudança de predecessora — continua deslocando as duas datas pelo mesmo delta (preserva a duração implícita do próprio intervalo já existente); como a UI agora mantém `duracao_dias` sincronizado com esse intervalo em toda edição manual, os dois caminhos convergem para o mesmo resultado.
- `handleUpdateItem` (que persiste qualquer edição vinda dos dois componentes) passou a aceitar `duracao_dias` no payload.

### 4. Migração versionada
Nova migração `supabase/migrations/20260826150000_projeto_itens_duracao_dias.sql`, idempotente (`add column if not exists`), formalizando no repositório o `duracao_dias integer nullable` que já existia no banco. Reaplicada ao vivo via MCP (idempotente — não alterou nenhum dado) para o histórico de migrações do projeto ficar consistente com o repositório.

## Testes

- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — compilado com sucesso, todas as 43 rotas geradas normalmente, incluindo `/projetos/[id]`.
- `npx vitest run` — 170/170 testes passando (nenhum teste existente cobre `scheduleFromDependencies`; não havia suíte prévia para esta função).
- `npm run lint` nos 3 arquivos alterados — nenhum warning/erro novo introduzido; os únicos apontamentos nesses arquivos (`ProjetoCascata.tsx:174`, `ProjetoCronograma.tsx:491/506` e outros) são pré-existentes, em trechos não tocados por esta mudança (confirmado lendo o diff linha a linha).
- **Verificação com dado real (SQL ao vivo, sem escrever nada no projeto real):** o projeto `3d885747-7de6-4fe3-a285-43b5eeccb717` já tem exatamente o cenário do fluxo validado (R0221) hoje no banco:
  - `Marco: Projeto base enviado ao Blanco` → predecessora de →
  - `Marco externo: Projeto base aprovado pelo Blanco` → predecessora de →
  - `Executivo` (disciplina Elétrico) e `Executivo` (disciplina Hidrossanitário), ambos já com `duracao_dias = 7`, mas **sem nenhuma data preenchida ainda**.

  Simulando manualmente `scheduleFromDependencies` com esses dados reais (ex.: marco "enviado" recebendo `data_prazo = 2026-09-01`): marco aprovado → `início = prazo = 2026-09-02` (dia seguinte, duração zero, como esperado de um marco); os dois itens "Executivo" → `início = 2026-09-03` (dia seguinte ao marco aprovado) e **`prazo = 2026-09-10` (início + 7 dias de `duracao_dias`)** — exatamente o fluxo pedido. Antes desta correção, esses dois itens teriam ficado com prazo = início (0 dias), ignorando os 7 dias já configurados.
  - Não foi feita nenhuma escrita neste projeto real durante a verificação (simulação só leu os dados existentes); testar a ponta a ponta pela UI requer navegador, que não está disponível neste ambiente de sessão remota.

## Riscos

- **Itens antigos sem `duracao_dias` preenchido** continuam sendo agendados exatamente como antes (prazo = início na primeira vez, sem duração) — comportamento inalterado, só passou a ser complementado quando o campo existe. Nenhuma regressão esperada em cronogramas já em uso.
- **Divergência de schema sem migração** (`projeto_itens`/`projeto_item_dependencias` como um todo, ver Diagnóstico item 4): continua existindo depois desta mudança. Qualquer alteração futura de schema nessas tabelas deve levar isso em conta — o `list_migrations` do Supabase MCP não reflete o histórico completo dessas duas tabelas.
- **Luiza (IA) não usa `duracao_dias` nem dispara o reagendamento** — pré-existente, não alterado nesta rodada (fora do escopo pedido). Se o usuário pedir isso depois, `lib/projeto-ai-tools.ts` precisará ganhar o parâmetro e algum mecanismo (RPC ou reprocessamento client-side) para acionar `scheduleFromDependencies` fora da tela do Projeto.
- **Duração e Fim editados no mesmo objeto de estado local antes do round-trip ao banco**: como antes, a tela otimisticamente atualiza o estado local (`setItens`) antes da resposta do Supabase; se a escrita falhar, o app já mostra um `alert` de erro (comportamento pré-existente, não alterado).

## Arquivos alterados

- `components/projeto/ProjetoCascata.tsx` — tipos + UI (desktop e mobile) de Início/Duração/Fim.
- `components/projeto/ProjetoCronograma.tsx` — mesma UI de duração na visão Gantt (desktop e mobile) + tipo do `onUpdateItem`.
- `app/(app)/projetos/[id]/page.tsx` — `scheduleFromDependencies` usa `duracao_dias` para definir o prazo de itens-folha sem data efetiva; `handleUpdateItem` aceita `duracao_dias`.
- `supabase/migrations/20260826150000_projeto_itens_duracao_dias.sql` (novo) — migração idempotente documentando `duracao_dias` no repositório.

Nenhuma mudança em `lib/planejamento-progresso.ts`, em qualquer tabela `planejamento_*` (Planning de Obras) ou em `lib/projeto-itens.ts`/`lib/projeto-ai-tools.ts`.
