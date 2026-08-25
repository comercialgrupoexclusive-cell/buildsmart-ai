# Laboratório Investidor — Rodada 5 (Marco 5: Comparador)

## 1. Resumo

Implementado exclusivamente o Marco 5: Comparador funcional de Prospecções.
Nenhuma tabela nova, nenhum score/ranking proprietário — o Comparador só lê
`prospeccoes` + `prospeccao_cenarios` já existentes e apresenta lado a lado,
exatamente como a especificação exige ("Comparador lê dados existentes; não
é nova entidade"). Nada de Marco 6 (Luiza) foi antecipado.

Escopo entregue, dentro da aba "Comparador" do hub `/investidor`:
- Seleção de 2 ou mais Prospecções (só aparecem as que já têm pelo menos um
  cenário financeiro), com escolha de qual cenário usar quando a Prospecção
  tem mais de um.
- Desktop: tabela lado a lado com todas as selecionadas simultaneamente
  (`overflow-x-auto` se não couberem).
- Mobile: 2 por vez, com paginação (◀ Anterior / Próximo ▶) quando mais de 2
  foram selecionadas.
- Indicadores: avaliação, aquisição, investimento total, venda estimada
  líquida, lucro, rentabilidade, prazo até a venda.
- Destaque visual (verde) no melhor valor de cada indicador financeiro
  claro (investimento total menor, venda líquida/lucro/rentabilidade
  maiores) — sem nenhum score composto ou ranking.

## 2. Arquivos alterados

| Arquivo | Natureza |
|---|---|
| `app/(app)/investidor/page.tsx` | **alterado** — `ComparadorTab` substitui o `EmptyState`; tipos/constantes de indicadores |
| `components/investidor/ProspeccaoCenarios.tsx` | **alterado** — `MODALIDADE_LABEL` passou a ser exportado (reaproveitado pelo Comparador, evita duplicar o mapeamento) |

Nenhuma migration nesta rodada — confirma o princípio #9 da especificação
("Comparador lê dados existentes; não é nova entidade").

## 3. Mapeamento dos indicadores da especificação para o schema real

A especificação (seção 3.3) lista: avaliação, aquisição, investimento total,
venda estimada, lucro, rentabilidade, prazo. O Marco 1 não tem um campo
"avaliação" nem dois campos distintos de "venda estimada" — mesma situação
de interpretação já documentada na Rodada 2 para a tela de Resumo. Decisão
adotada, consistente com aquela:

| Indicador da spec | Campo real usado | Por quê |
|---|---|---|
| Avaliação | `valor_venda_estimado` (premissa) | O que se acha que o imóvel vale — mesmo mapeamento já usado no Resumo da Prospecção (Rodada 2) |
| Aquisição | `valor_arrematacao` | Valor pago/a pagar no leilão |
| Investimento total | `investimento_total` (resultado do motor, Marco 3) | — |
| Venda estimada (líquida) | `valor_liquido_venda` (resultado do motor) | Diferente da avaliação bruta: já desconta comissão, IR sobre ganho de capital e saldo devedor — rotulado "Venda estimada líquida" na tela para deixar essa diferença explícita ao usuário |
| Lucro | `lucro` | — |
| Rentabilidade | `rentabilidade` | — |
| Prazo | `prazo_venda_meses` (premissa) | — |

Nenhum campo novo foi criado para isso — todos já existiam desde o Marco 1/3.

## 4. Seleção e escolha de cenário

`ComparadorTab` (`app/(app)/investidor/page.tsx`) carrega todas as
`prospeccoes` com `prospeccao_cenarios(*)` embutido e filtra no cliente só
as que têm `prospeccao_cenarios.length > 0`. Cada linha da lista de seleção
é um checkbox; ao marcar, o cenário padrão escolhido é o `principal` (ou o
primeiro, se não houver principal ainda) — e, se a Prospecção tiver mais de
um cenário, aparece um `<select>` para trocar qual cenário usar na
comparação, sem afetar qual é o "principal" real da Prospecção (isso
continua sendo decidido só na aba Análise, Marco 3).

## 5. Desktop vs. mobile

- **Desktop** (`hidden md:block`): uma única tabela HTML com
  `overflow-x-auto`, uma coluna por selecionada — todas ao mesmo tempo,
  como a especificação pede ("desktop lado a lado").
- **Mobile** (`md:hidden`): grid de 2 colunas fixas mostrando sempre um par
  da lista de selecionadas (`selecionadas.slice(parIndex, parIndex + 2)`).
  Se houver só 2 selecionadas, não aparece paginação. Se houver 3+, aparece
  a barra "◀ Anterior · N–M de T · Próximo ▶", andando de 2 em 2 — reproduz
  literalmente "mobile inicialmente 2 por vez" da especificação sem
  limitar quantas Prospecções podem ser selecionadas ao mesmo tempo.

## 6. Destaque visual — regra usada (sem score/ranking)

Por indicador, calculado só sobre as Prospecções atualmente exibidas (nunca
sobre o catálogo inteiro): investimento total → destaca o **menor** valor;
venda estimada líquida, lucro e rentabilidade → destacam o **maior** valor.
Avaliação, aquisição e prazo não recebem destaque — não há uma direção
"melhor" universalmente óbvia para eles (pagar menos na aquisição não é
necessariamente "melhor" isolado do resto do cenário), e a especificação
pede explicitamente para não inventar um score/ranking próprio. O destaque é
puramente visual, célula a célula, recalculado a cada seleção — não persiste
em lugar nenhum nem é lido por outra tela.

## 7. Comportamento mobile — validação visual

Mockup estático (mesma paleta de `globals.css`) via Playwright a 375px,
reproduzindo exatamente 2 cenários reais (o de à vista e o de SAC usados
como teste-ouro no Marco 3) lado a lado com os destaques de investimento
total, venda líquida, lucro e rentabilidade visíveis — enviado ao usuário
junto com este relatório.

## 8. Testes executados

- Fixture SQL ao vivo (`QA R5 A/B/C`, apagada ao final):
  - Prospecção A: 1 cenário (à vista, valores-ouro do Marco 3).
  - Prospecção B: 2 cenários (SAC principal + PRICE alternativo).
  - Prospecção C: sem nenhum cenário.
  - Confirmado, via `LEFT JOIN` agregado, que A tem 1 cenário, B tem 2 e C
    tem 0 — a mesma condição que o filtro `prospeccao_cenarios?.length > 0`
    do componente usa para excluir C da lista de seleção (no PostgREST real,
    uma Prospecção sem cenários retorna `prospeccao_cenarios: []`, não uma
    linha nula como no `LEFT JOIN` bruto do teste — verificado o
    comportamento do embed do Supabase, não só a relação SQL crua).
  - Conferido manualmente que, comparando A e o cenário principal de B: A
    vence em venda líquida e lucro (maiores), B vence em investimento total
    (menor) e rentabilidade (maior) — direção de destaque correta nos dois
    sentidos (maior/menor).
  - Exclusão da fixture e confirmação de contagem zero ao final.

## 9. TypeScript / build / lint

- `npx tsc --noEmit -p .`: **sem erros**.
- `npm run build` (Next.js 16 + Turbopack): **compilado com sucesso**.
- `npx vitest run`: **100/100 passando**, nenhuma regressão (esta rodada não
  mexeu no motor de cálculo do Marco 3).
- `npx eslint app/(app)/investidor/page.tsx components/investidor/ProspeccaoCenarios.tsx`:
  **0 erros** de código novo. Restam 2 ocorrências do aviso
  `react-hooks/set-state-in-effect` no padrão "buscar ao montar" — uma já
  existente em `AtivosTab` (Rodada 4) e uma nova, idêntica, em
  `ComparadorTab`. **Mesma inconsistência de lint já documentada nas
  Rodadas 2 e 4**: o padrão idêntico já dispara esse aviso em código
  pré-existente (`ObraArquivos.tsx`, `ProspeccaoArquivos.tsx`) e não em
  outros (`/projetos/page.tsx`) — não é um defeito desta rodada, é uma regra
  de lint inconsistente já tolerada no restante do código.

## 10. Problemas encontrados

Nenhum problema de schema, RLS ou dado real. Único ponto técnico é o aviso
de lint da seção 9, já esperado.

## 11. Diferenças entre especificação e implementação

Nenhuma diferença de escopo. A única decisão de interpretação foi a da
seção 3 (mapeamento de "avaliação"/"venda estimada" para os campos reais),
consistente com a decisão já tomada e documentada na Rodada 2 para a mesma
ambiguidade.

## 12. Decisões deliberadamente adiadas para o Marco 6+

- Qualquer leitura/uso do Comparador pela Luiza (consulta, análise
  comparativa via chat): Marco 6.
- Comparar Ativos (Projects de investimento) além de Prospecções: não
  pedido no Marco 5, que fala especificamente em comparar Prospecções e
  seus cenários.
- Persistir ou compartilhar uma comparação (ex.: link, exportação): não
  pedido, mantido como estado local da sessão.
- Score/ranking proprietário: explicitamente fora de escopo pela própria
  especificação.

## 13. Commit SHA final

Branch de trabalho: `previsoes/prazo-fornecimento-material`.
HEAD antes desta rodada: `e9c07aa` (fecho da Rodada 4).
Commit e push preenchidos após concluir o commit desta rodada (ver
`git log --oneline -5`).
