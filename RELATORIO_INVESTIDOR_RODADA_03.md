# Laboratório Investidor — Rodada 3 (Marco 3: Calculadora + Cenários)

## 1. Resumo

Implementado exclusivamente o Marco 3 da especificação: motor de cálculo nativo
(À vista/SAC/PRICE) + CRUD completo de Cenários financeiros dentro da aba
"Análise" da Prospecção. Nada de Marco 4 (Ativos), Marco 5 (Comparador
funcional), Marco 6 (Luiza) foi antecipado.

O usuário anexou a planilha real de referência (`Calculadora do Leilão.xlsx`)
como teste-ouro. Ela foi lida célula a célula (fórmulas, não só valores) com
`openpyxl` e usada como única fonte das fórmulas do motor — nenhum cálculo
foi inventado. Duas inconsistências foram encontradas na própria planilha
(ver seção 5) e corrigidas de forma documentada, não silenciosa.

Escopo entregue:
- `lib/investidor-calculadora.ts`: motor puro (sem I/O) com as 3 modalidades.
- RPC `prospeccao_cenario_definir_principal`: troca atômica do cenário
  principal, respeitando o índice único parcial já existente desde o Marco 1.
- `components/investidor/ProspeccaoCenarios.tsx`: lista de cenários (cards
  com resultado, marcar principal, duplicar, excluir) + editor de premissas
  agrupado por seção (Imóvel / Financiamento / Custos / Extras / Pós-venda /
  Pós-arrematação) com resultado recalculado a cada tecla.
- Aba "Análise" de `/investidor/[id]` passa a renderizar esse CRUD (antes
  era um `EmptyState` de "chega no Marco 3").

## 2. Arquivos alterados

| Arquivo | Natureza |
|---|---|
| `lib/investidor-calculadora.ts` | **novo** — motor de cálculo puro |
| `lib/__tests__/investidor-calculadora.test.ts` | **novo** — 16 testes contra a planilha-ouro |
| `components/investidor/ProspeccaoCenarios.tsx` | **novo** — CRUD de Cenários |
| `app/(app)/investidor/[id]/page.tsx` | **alterado** — aba Análise passa a usar `ProspeccaoCenarios`; comentário de cabeçalho atualizado |
| `supabase/migrations/20260825173123_investidor_marco3_rpc_definir_cenario_principal.sql` | **novo** |

Nenhuma tabela do Marco 1 foi alterada — `prospeccao_cenarios` já tinha todos
os campos de premissa e resultado necessários.

## 3. Migration aplicada

`prospeccao_cenario_definir_principal(p_prospeccao_id uuid, p_cenario_id uuid)`
— `security definer`, `search_path=''`, mesmo padrão de
`orcamento_verificacao_marcar`. Desmarca todos os outros cenários da
prospecção e marca o escolhido, em duas UPDATEs sequenciais dentro da mesma
transação da função (nunca existe um instante com dois principais nem com
zero, exceto se a função inteira falhar antes de terminar — nesse caso a
transação inteira desfaz). Falha explicitamente (`cenario_nao_encontrado`)
se o cenário não pertence à prospecção informada. Grants para
`authenticated`/`anon`, igual ao padrão já usado nas RPCs de conferência do
orçamento.

Aplicada ao vivo via MCP Supabase e espelhada em
`supabase/migrations/`.

## 4. Motor de cálculo — fórmulas extraídas da planilha

A planilha tem 6 abas. As fórmulas relevantes foram lidas com
`openpyxl.load_workbook(..., data_only=False)` (string da fórmula) e
`data_only=True` (valor calculado em cache), célula a célula:

- **"Pagamento à Vista"**: Total de Custos (D31), Valor Real de Venda (D38),
  lucro absoluto (E41) e rentabilidade (D41) — auto-contida, sem dependência
  de outra aba. Usada como está, valores nativos do arquivo confirmam o
  teste (seção 6).
- **"Pagamento Financiado" + "SAC" + "PRICE"**: o motor real de financiamento.
  "SAC" e "PRICE" são tabelas de amortização mês a mês (500+ linhas) com as
  fórmulas clássicas:
  - SAC: amortização constante = empréstimo/prazo; juros do mês =
    taxa_mensal × saldo devedor anterior; parcela = amortização + juros.
  - PRICE: parcela constante = `P × i × (1+i)^n / ((1+i)^n − 1)`; juros do
    mês = taxa_mensal × saldo devedor anterior; amortização = parcela − juros.
  - `taxa_mensal = (1 + taxa_anual)^(1/12) − 1` em ambas.
  - A aba "Pagamento Financiado" soma as parcelas pagas até o mês do
    `prazo_venda_meses` (via `INDIRECT(ADDRESS(...))`, uma fórmula matricial)
    e lê o saldo devedor remanescente nesse mesmo mês — isso vira
    "Total a Pagar do Financiamento" e "Saldo Devedor do Financiamento".
  - Custo base de IR sobre ganho de capital exclui "outros custos" e
    "advogado/desocupação" (confirmado em D35 da aba à vista e F43/G43 da
    aba financiada) — reproduzido fielmente no motor.

Essas fórmulas foram implementadas literalmente em
`lib/investidor-calculadora.ts` (`calcularVista` e `calcularFinanciado`),
sem nenhuma fórmula "inventada" — cada linha de código cita, em comentário,
a célula de origem.

## 5. Correções encontradas na planilha de referência (documentadas)

A regra da especificação é clara: "não inventar fórmulas — a planilha real é
o teste-ouro". Duas coisas na planilha, porém, são defeitos comprovados de
fórmula, não regras de negócio, e foram corrigidas — cada uma citada em
comentário no código-fonte:

1. **Saldo devedor "-" em vez de 0.** Se a venda ocorre depois de o
   financiamento já estar quitado (`prazo_venda_meses > prazo_financiamento_meses`),
   a fórmula da planilha (`IFERROR(...,"-")`) retorna o texto "-" em vez do
   número 0, porque a tabela de amortização não tem linhas além do prazo
   financiado. Isso é uma limitação do array-formula, não uma regra
   financeira — o motor usa 0.
2. **Bug de copiar/colar em "% de Lucro" do cenário SAC.** Na aba "Pagamento
   Financiado", a célula `G52` (rentabilidade do cenário SAC) referencia por
   engano as células da coluna F (PRICE): `=IFERROR(($F$47-$F$39)/($F$39),0)`
   em vez de `($G$47-$G$39)/($G$39)`. Confirmado comparando com a célula de
   lucro absoluto ao lado (`G51`), que já usa a coluna G corretamente, e com
   o padrão idêntico usado na aba "à vista" (D41 usa sempre os próprios
   valores). O motor usa os totais da própria modalidade em ambos os casos —
   um teste (`investidor-calculadora.test.ts`) existe especificamente para
   não deixar essa regressão voltar (SAC e PRICE não podem empatar por acaso
   com os mesmos insumos).

Também identificado, apenas como nota (não corrigido, pois não afeta o
resultado): as abas de exemplo "Pagamento Financiado_SAC" e
"Pagamento Financiado_PRICE" estão desconectadas — a tabela de amortização
que elas exibem (E37/E46) é alimentada pelos inputs da aba "Pagamento
Financiado" (que fica zerada no arquivo original), não pelos próprios
valores de exemplo dessas abas. Por isso não puderam ser usadas como
teste-ouro; usei em vez disso a aba "Pagamento à Vista" (auto-contida, valor
nativo do arquivo) e a combinação "Pagamento Financiado"+"SAC"+"PRICE"
(motor real), com os cenários de teste derivados executando essas mesmas
fórmulas diretamente.

## 6. Validação contra a planilha-ouro (testes automatizados)

`lib/__tests__/investidor-calculadora.test.ts`, 16 testes, `vitest`:

- **À vista** — usa os valores já calculados e salvos no próprio arquivo
  (arrematação R$ 225.000, venda R$ 400.000, comissão leiloeiro 5%, ITBI 3%,
  registro R$ 5.000, reforma R$ 10.000, outros R$ 22.000, prazo venda 6
  meses, condomínio R$ 400/mês): Total de Custos = R$ 282.400,00, Valor Real
  de Venda = R$ 358.300,00, lucro = R$ 75.900,00, rentabilidade =
  26,87677054% — bate exatamente com D31/D38/E41/D41 do arquivo.
- **SAC/PRICE** — arrematação R$ 100.000, venda R$ 200.000, entrada 20%,
  taxa 6% a.a., prazo financiamento 12 meses, prazo venda 12 meses, demais
  custos conforme a planilha de exemplo. Como as abas de exemplo estão
  desconectadas (seção 5), os valores esperados foram derivados executando
  em Python, separadamente do TypeScript, as mesmas fórmulas literais
  extraídas do arquivo (tabela SAC/PRICE mês a mês + fórmulas da aba
  "Pagamento Financiado"). Resultado: SAC → investimento R$ 119.331,13,
  venda líquida R$ 176.799,67, lucro R$ 57.468,54, rentabilidade 48,16%;
  PRICE → investimento R$ 119.353,66, venda líquida R$ 176.803,05, lucro
  R$ 57.449,39, rentabilidade 48,13%. O motor TypeScript bate com esses
  valores dentro de tolerância de centavos.
- **Casos de borda**: financiamento quitado antes da venda (saldo devedor
  tratado como 0, não trava em `-`/`NaN`); cenário 100% vazio não gera
  `NaN`/`Infinity` (guarda de divisão por zero).

Resultado: **16/16 passando.**

## 7. RPC de cenário principal — teste ao vivo

Testado diretamente contra produção com fixture temporária
(`QA R3 TESTE (temporário — apagar)`, apagada ao final):
- Criei 2 cenários, o primeiro já `principal=true`.
- Chamei a RPC apontando o segundo → segundo virou `true`, primeiro virou
  `false` (nunca dois nem zero principais).
- Chamei a RPC com um `cenario_id` inexistente → erro
  `cenario_nao_encontrado`, sem alterar nada.
- `delete from prospeccoes` (cascade) removeu a fixture e os cenários
  associados — confirmado com contagem zero ao final.

## 8. UI: CRUD de Cenários (aba Análise)

`components/investidor/ProspeccaoCenarios.tsx`:
- **Lista**: cards por cenário (nome, modalidade, estrela do principal,
  Investimento total / Valor líquido de venda / Lucro / Rentabilidade — só
  aparecem quando já existe resultado calculado e salvo; senão mostra
  "Preencha as premissas para calcular o resultado"). Ações por card:
  Editar, Duplicar, Excluir, "Marcar principal" (chama a RPC da seção 3).
- **Editor**: campos agrupados exatamente como as seções da planilha —
  Imóvel; Estrutura do financiamento (só aparece se modalidade ≠ à vista);
  Custos da arrematação; Extras pós imissão; Pós arrematação; Pós venda —
  mais um painel de Resultado no topo, recalculado a cada tecla chamando o
  mesmo `calcularCenario()` usado para persistir (sem duplicar lógica entre
  preview e salvamento).
- Campos percentuais (comissão do leiloeiro, ITBI, corretagem, IR sobre
  ganho de capital, % de entrada, taxa de juros) são editados como número
  "5" = 5% na tela e convertidos para fração (0,05) só no cálculo/gravação —
  o banco continua guardando fração, igual ao valor bruto da célula da
  planilha (D15 = 0,05).
- Duplicar copia a linha inteira (premissas + resultado já calculado),
  renomeia para "{nome} (cópia)" e nasce com `principal=false` — não
  recalcula, porque as premissas não mudaram.
- Excluir usa `confirm()` simples com o nome do cenário, igual ao padrão já
  usado em `ProspeccaoArquivos`. Se o cenário excluído era o principal,
  nenhum outro é promovido automaticamente — o usuário escolhe o próximo
  principal manualmente (mesma filosofia de "nenhuma propagação automática"
  adotada no hotfix de conferência do orçamento).

## 9. Comportamento mobile

Mesmo padrão de grid já usado em `ResumoTab`/`ProspeccaoArquivos`
(`grid-cols-1 sm:grid-cols-2`) — empilha em 1 coluna abaixo de 640px, 2
colunas a partir daí. O painel de Resultado usa `grid-cols-2 sm:grid-cols-4`
(2 métricas por linha no celular, 4 no desktop). Testado visualmente com
mock estático (mesma paleta de `globals.css`) via Playwright a 375px — ver
screenshot enviado ao usuário. Botões Cancelar/Salvar ficam lado a lado no
rodapé em qualquer largura, sem quebrar.

## 10. Testes executados

- `npx vitest run` completo: **100/100 passando** (16 novos + 84 já
  existentes, nenhuma regressão).
- Fixture SQL ao vivo (`QA R3 TESTE`): criação de prospecção + 2 cenários
  (SAC com resultado pré-calculado pelo mesmo motor, à vista sem resultado);
  consulta simulando exatamente o `select` embutido usado pelas telas
  (`prospeccoes` + `prospeccao_cenarios`) confirmando que o card só mostra
  lucro/rentabilidade quando o principal já tem resultado; troca de
  principal via RPC; exclusão em cascata confirmada com contagem zero.
- Confirmado `select count(*) from projetos` e cenários residuais = 0 ao
  final — nenhum dado de `/projetos` ou de rodadas anteriores foi tocado.

## 11. TypeScript / build / lint

- `npx tsc --noEmit -p .`: **sem erros**.
- `npm run build` (Next.js 16 + Turbopack): **compilado com sucesso**,
  `/investidor` e `/investidor/[id]` presentes na tabela de rotas.
- `npx eslint components/investidor/ProspeccaoCenarios.tsx "app/(app)/investidor/[id]/page.tsx" lib/investidor-calculadora.ts lib/__tests__/investidor-calculadora.test.ts`:
  **0 erros**. 2 warnings pré-existentes em `[id]/page.tsx` (dependência de
  `useEffect` e `<img>` vs `next/image`), ambos em linhas não tocadas nesta
  rodada — confirmado via `git diff --stat` (só esse arquivo mudou, 10
  inserções/12 remoções, nenhuma delas nas linhas dos warnings).

## 12. Problemas encontrados

- As duas inconsistências da planilha original, documentadas na íntegra na
  seção 5.
- Nenhum problema novo de schema, RLS ou tipos — o Marco 1 já previu todos
  os campos necessários para o Marco 3.

## 13. Diferenças entre especificação e implementação

Nenhuma diferença de escopo. A única decisão de interpretação foi técnica,
não de produto: usar a combinação "Pagamento Financiado"+"SAC"+"PRICE" como
motor canônico de financiamento (em vez das abas de exemplo desconectadas
"_SAC"/"_PRICE"), pelos motivos da seção 5 — mesma matemática, mesma
planilha, apenas a aba efetivamente "ligada" foi escolhida como referência.

## 14. Decisões deliberadamente adiadas para o Marco 4+

- Conversão Prospecção → Ativo (Project com `contexto=investimento`): Marco 4.
- Comparador funcional lendo múltiplos cenários lado a lado: Marco 5.
- Qualquer uso do motor de cálculo pela Luiza: Marco 6 (o motor já nasce
  como módulo puro reutilizável exatamente para isso).
- Promoção automática de um novo cenário principal quando o principal atual
  é excluído: não pedido nesta rodada, mantido manual.
- Histórico/versionamento de cenários (ex.: "cenário na data da compra vs.
  hoje"): não existe no modelo do Marco 1, fora de escopo aqui.

## 15. Commit SHA final

Branch de trabalho: `previsoes/prazo-fornecimento-material`.
HEAD antes desta rodada: `40eadd7c2504bdef97cbe404ed375fd555d7ccfc`.
SHA desta rodada preenchido após o commit (ver mensagem de commit no
histórico do git — `git log --oneline -5`).
