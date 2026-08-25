# Laboratório Investidor — Rodada 4 (Marco 4: Ativos)

## 1. Resumo

Implementado exclusivamente o Marco 4: conversão de uma Prospecção adquirida
em um Ativo, sem recadastro. Nenhuma tabela nova foi criada — o Marco 1 já
tinha tudo que o Marco 4 precisava (`projetos.contexto` e
`prospeccoes.project_id`), confirmando que a arquitetura de reuso definida
nas rodadas anteriores estava correta. Nada de Marco 5 (Comparador
funcional) ou Marco 6 (Luiza) foi antecipado.

Escopo entregue:
- Botão **"Converter em Ativo"** na aba Resumo da Prospecção (só aparece
  quando `fase = 'adquirida'` e ainda não há `project_id`) — cria um
  `Project` com `contexto='investimento'` e vincula `prospeccoes.project_id`.
  Quando já convertida, mostra "Ver Ativo →" em vez do botão.
- Aba **Investimento** dentro de `/projetos/[id]`, visível só quando
  `contexto='investimento'` — mostra o vínculo com a Prospecção de origem e
  o resultado do cenário principal (mesmos números do Marco 3, sem recalcular
  nada).
- **"Fase operacional específica do ativo"**: mesmo campo `fase_ciclo` já
  existente, com rótulo diferente quando o contexto é investimento
  (Adquirido/Em reforma/Pronto em vez de Projeto/Em obra/Entregue) — decisão
  deliberada de não criar um novo campo/enum (ver seção 6).
- Aba **Ativos** do hub `/investidor` deixou de ser um placeholder: lista de
  verdade dos Projects com `contexto='investimento'`, cada card abrindo a
  própria `/projetos/[id]` — reaproveitando 100% da tela (Estrutura,
  Orçamento, Cronograma, Board, Tour, Dados, Assistente IA, Tarefas), como a
  especificação pede.

## 2. Arquivos alterados

| Arquivo | Natureza |
|---|---|
| `components/investidor/ProjetoResumoInvestimento.tsx` | **novo** |
| `app/(app)/projetos/[id]/page.tsx` | **alterado** — `contexto` no tipo local, aba "Investimento" condicional, rótulo de fase específico do ativo |
| `app/(app)/investidor/[id]/page.tsx` | **alterado** — botão/link de conversão na aba Resumo |
| `app/(app)/investidor/page.tsx` | **alterado** — aba Ativos real (`AtivosTab`/`AtivoCard`), substitui o `EmptyState` |

Nenhuma migration nesta rodada.

## 3. Migrations

Nenhuma. `projetos.contexto` (Marco 1) e `prospeccoes.project_id`
(Marco 1, FK `ON DELETE SET NULL`) já cobriam tudo que o Marco 4 precisa.
Confirmado ao vivo antes de escrever qualquer código
(`pg_get_constraintdef` nas duas tabelas — seção 7).

## 4. Conversão Prospecção → Ativo

Fluxo implementado em `ResumoTab` (`app/(app)/investidor/[id]/page.tsx`):

1. Botão só aparece para quem não é cliente (`usePermission().isCliente`),
   quando `prospeccao.fase === 'adquirida'` e `prospeccao.project_id` é nulo.
2. `confirm()` explica o que vai acontecer (mesmo padrão de confirmação
   simples já usado em exclusões nesta e em rodadas anteriores).
3. `insert` em `projetos`: `nome`, `endereco` e `foto_url` copiados da
   prospecção; `contexto: 'investimento'`; `status: 'em_andamento'` (mesmo
   valor-padrão usado em toda criação de Project no app, incluindo
   `NovoCadastroModal.tsx`); `fase_ciclo` fica no default `'projeto'` do
   banco.
4. `update` em `prospeccoes.project_id` apontando para o novo Project. A
   Prospecção **não é apagada** — continua acessível e editável em
   `/investidor/{id}`.
5. Redireciona para `/projetos/{novoId}`, já na tela real de Project.

Não há RPC/transação: são duas chamadas sequenciais, igual ao padrão já
usado no botão "Duplicar" de `/projetos/page.tsx` (que também faz
`insert` do projeto seguido de múltiplos `insert`s de itens sem
transação explícita). Se o segundo passo falhar, o Ativo já criado fica sem
vínculo automático e o usuário recebe um alerta explícito para vincular
manualmente — mesmo nível de robustez já aceito em outros fluxos do app,
não um retrocesso.

## 5. Aba "Investimento" em `/projetos/[id]`

`components/investidor/ProjetoResumoInvestimento.tsx`: busca a `prospeccoes`
cujo `project_id` é o Project atual (relação inversa), e o seu cenário com
`principal=true`. Mostra: link de volta para a Prospecção, valor de
arrematação, valor de venda estimado e — só quando já calculados — lucro e
rentabilidade (mesmo critério condicional já usado no card de Prospecção e
no Resumo dela). Nenhuma lógica de cálculo própria: os números são os que já
estão gravados em `prospeccao_cenarios` pelo motor do Marco 3. Um aviso no
rodapé deixa explícito que "financeiro real" (comprometido/pago da obra) e
Comercialização chegam em marcos futuros — não foram implementados aqui.

## 6. "Fase operacional específica do ativo" — decisão técnica

A especificação pede uma fase operacional própria do Ativo, mas os
princípios da arquitetura proíbem criar campo/tabela sem necessidade
demonstrada. `projetos.fase_ciclo` já é um enum de 3 valores
(`projeto`/`em_obra`/`entregue`) que descreve exatamente o mesmo ciclo de
vida que um imóvel de investimento percorre (adquirido → em reforma →
pronto). Em vez de duplicar esse conceito com um novo campo, criei apenas um
segundo **rótulo de apresentação** (`FASE_LABEL_ATIVO`, local ao componente)
usado só quando `contexto='investimento'`:

| `fase_ciclo` | Rótulo Project comum | Rótulo Ativo |
|---|---|---|
| `projeto` | Projeto | Adquirido |
| `em_obra` | Em obra | Em reforma |
| `entregue` | Entregue | Pronto |

Os botões de transição de fase existentes (`IniciarObraButton`,
"Entregar chaves"/`entregarObra`) não foram tocados — continuam chamando as
mesmas RPCs (`iniciar_obra`, `entregar_obra`) que todo Project já usa,
preservando a máquina de estados existente sem risco de regressão em
Projects comuns.

## 7. Inspeção do schema real (antes de codar)

Consultado ao vivo, via MCP Supabase, antes de qualquer alteração:
- `information_schema.columns` de `projetos`: confirmado `contexto text not
  null default 'projeto'` e `fase_ciclo text not null default 'projeto'`
  já existentes (Marco 1), nenhuma coluna nova necessária.
- `pg_constraint` de `projetos`: `projetos_contexto_check` (`projeto`/
  `investimento`), `projetos_fase_ciclo_check` (`projeto`/`em_obra`/
  `entregue`), `projetos_status_check`.
- `pg_constraint` de `prospeccoes`: `prospeccoes_project_id_fkey ...
  ON DELETE SET NULL` — confirma que apagar um Ativo nunca apaga ou quebra a
  Prospecção original (preserva histórico, como a especificação exige).
- `pg_policies` de `projetos`: `projetos_all — ALL using(true) with
  check(true)` — mesmo padrão permissivo de todo o resto do app; inserção
  direta do cliente é o padrão já usado, não uma exceção criada aqui.

## 8. Comportamento mobile

Reaproveita componentes e padrões de grid já validados nas rodadas
anteriores (`ResumoTab`, `ProspeccaoCard`) sem introduzir nenhum layout
novo: o botão de conversão empilha ao lado do botão "Editar" no cabeçalho da
aba Resumo (`flex items-center gap-2`, quebra naturalmente em telas
estreitas por já estar dentro de um `flex flex-col sm:flex-row` mais
externo do `card`); o card de Ativo é literalmente a mesma estrutura visual
do card de Prospecção (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`), já
comprovada responsiva na Rodada 2. Não foi necessário um novo mockup
estático — nenhum componente visual novo foi inventado.

## 9. Testes executados

- Fixture SQL ao vivo (`QA R4 TESTE`, apagada ao final):
  1. Criada prospecção com `fase='adquirida'` + cenário principal com
     resultado (mesmos valores-ouro do Marco 3: investimento R$ 282.400,00,
     lucro R$ 75.900,00, rentabilidade 26,88%).
  2. Simulado exatamente o que o botão faz: `insert` em `projetos` com
     `contexto='investimento'` — confirmado `status='em_andamento'` e
     `fase_ciclo='projeto'` (defaults corretos).
  3. `update prospeccoes.project_id` apontando para o novo Ativo —
     confirmado `fase` permanece `'adquirida'`.
  4. Reproduzida a query exata da aba "Investimento" (`prospeccoes` filtrada
     por `project_id`, join com o cenário principal) — retornou o vínculo e
     os números corretos.
  5. Reproduzida a query exata da aba "Ativos" (`projetos` filtrada por
     `contexto='investimento'`) — retornou só o Ativo criado.
  6. Confirmado `select count(*) from projetos where contexto='projeto'` =
     0 — nenhum Project comum foi afetado ou apareceria por engano na lista
     de Ativos.
  7. Exclusão da fixture (prospecção primeiro, depois o projeto) e
     confirmação de contagem zero em ambas as tabelas ao final.

## 10. TypeScript / build / lint

- `npx tsc --noEmit -p .`: **sem erros** (checado três vezes, a cada
  arquivo alterado).
- `npm run build` (Next.js 16 + Turbopack): **compilado com sucesso**,
  `/investidor`, `/investidor/[id]` e `/projetos/[id]` presentes na tabela
  de rotas.
- `npx vitest run`: **100/100 passando**, nenhuma regressão (esta rodada não
  alterou o motor de cálculo do Marco 3).
- `npx eslint` nos 4 arquivos desta rodada: **0 erros** depois de corrigir
  um problema real de hoisting (`load` acessado antes de declarado em
  `AtivosTab` e em `ProjetoResumoInvestimento` — corrigido movendo a
  declaração da função antes do `useEffect`, mesmo fix já usado no Marco 2).
  Restam 2 ocorrências do aviso `react-hooks/set-state-in-effect` nesses
  dois mesmos locais — **mesma inconsistência de lint já documentada no
  RELATORIO_INVESTIDOR_RODADA_02.md**: confirmado que o padrão idêntico de
  "buscar dados ao montar" já dispara esse aviso em `ObraArquivos.tsx` e
  `ProspeccaoArquivos.tsx` (código pré-existente, não desta rodada), então
  não é um defeito introduzido agora — é uma regra de lint inconsistente já
  tolerada no restante do código.

## 11. Problemas encontrados

Nenhum problema de schema, RLS ou dado real. O único ponto técnico foi o
aviso de lint da seção 10, já era esperado por já ter aparecido em rodadas
anteriores no mesmo tipo de padrão de código.

## 12. Diferenças entre especificação e implementação

Nenhuma diferença de escopo. A única decisão de interpretação foi a da
seção 6 (reaproveitar `fase_ciclo` com rótulo específico em vez de criar um
novo campo) — decisão técnica alinhada ao princípio #4 da especificação
("não criar tabela, campo, processo ou regra sem necessidade demonstrada").

## 13. Decisões deliberadamente adiadas para o Marco 5+

- Comparador funcional lendo múltiplos Ativos/Prospecções lado a lado:
  Marco 5.
- Financeiro real do Ativo (comprometido/pago da obra comparado com o
  previsto do cenário): mencionado na especificação como parte futura de
  "Ativo", mas fora do escopo explícito do Marco 4 — a aba Investimento
  deixa isso textualmente claro para o usuário.
- Comercialização (venda do Ativo, fechamento do ciclo de investimento):
  fora de escopo, spec reserva isso para marcos futuros.
- Qualquer ação de conversão ou leitura de Ativo pela Luiza: Marco 6.
- Filtro/busca na aba Ativos: não pedido nesta rodada; a lista de Ativos
  tende a ser pequena no início do uso real, então não foi antecipado.

## 14. Commit SHA final

Branch de trabalho: `previsoes/prazo-fornecimento-material`.
HEAD antes desta rodada: `b33ba14` (fecho da Rodada 3).
Commit desta rodada: `f1650f4` (branch de trabalho) / `5a2aae2` (merge
`--no-ff` em `main`). Ambos os branches foram reconstruídos (`tsc` + build)
e enviados para o `origin`.
