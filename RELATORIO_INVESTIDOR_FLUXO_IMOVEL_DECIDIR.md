# Relatório — Investidor: fluxo Imóvel → Pesquisa de mercado → Viabilidade → Decidir

Rodada de ajuste de fluxo do módulo Investidor, mantendo a estrutura existente (mesmas 6 abas, mesmo motor de cálculo, mesmas tabelas). Objetivo: tornar a sequência de uso intuitiva e corrigir um bug real de resultado financeiro inválido.

## 1. Abertura da prospecção

**Antes:** ao abrir uma prospecção, a tela caía direto na aba "Decidir".
**Agora:** abre por padrão na aba "Imóvel" — reflete a lógica real de uso ("achei um imóvel → pesquisei quanto vale → estimei quanto gasto → vejo quanto ganho → decido").

- `app/(app)/investidor/[id]/page.tsx`: `tab` default mudou de `'decidir'` para `'ficha'`.
- Ordem das abas mantida sem alteração: Imóvel, Pesquisa de mercado, Viabilidade, Decidir, Arquivos, Board.

## 2. Bug corrigido: resultado financeiro inválido quando falta valor de venda/aquisição

**Causa raiz:** o motor de cálculo (`lib/investidor-calculadora.ts`) usa um helper `n(v)` que converte `null`/`undefined` em `0` para todas as premissas — comportamento correto para campos genuinamente opcionais (reforma, IPTU, registro...), mas **errado** para `valor_arrematacao` e `valor_venda_estimado`: nesses dois campos, ausência não significa "zero", significa "ainda não sei".

**Caso real confirmado (prospecção "Bella teste pesquisa"):** `valor_arrematacao = 379900`, `valor_venda_estimado = null` → o motor calculava a venda como R$ 0 e chegava a `lucro = -332602,45` / `rentabilidade = -85%`, um resultado sem sentido exibido como se fosse válido.

**Correção:**
- `calcularCenario()` agora aplica um gate explícito sobre o resultado bruto:
  - `investimento_total`: fica `null` se faltar `valor_arrematacao` (não depende de venda).
  - `valor_liquido_venda`, `lucro`, `rentabilidade`: ficam `null` se faltar `valor_arrematacao` **ou** `valor_venda_estimado`.
- Novo tipo público `ResultadoCenario` com os 4 campos calculados como `number | null` (era `number`).
- Novas funções exportadas:
  - `pendenciasCenario(premissas)` → lista quais dos dois campos estão faltando.
  - `resultadoCenarioValido(cenario)` → guarda "legacy-safe": revalida pelas premissas brutas, não só por `lucro`/`rentabilidade` serem não-nulos no banco — importante porque linhas gravadas *antes* deste hotfix podem ter valores numéricos incorretos (não `NULL`) por causa do bug antigo.
- Correção adicional, mesma causa raiz: a base de cálculo do imposto de ganho de capital (`baseGanhoCapital`) agora é sempre `Math.max(0, ...)` em `calcularVista` e `calcularFinanciado` — uma venda abaixo do custo total não pode gerar "imposto negativo" inflando artificialmente o valor líquido de venda.

**Call sites atualizados para o novo formato nullable** (nenhum duplica lógica — todos chamam o mesmo `calcularCenario`):
- `components/investidor/ProspeccaoCenarios.tsx` — mostra "Viabilidade incompleta" com o campo faltante, em vez do número inválido.
- `lib/investidor-ai-tools.ts` — `descricaoResultado()` (usado pela Luiza ao propor cenários) usa `pendenciasCenario()` para descrever o resultado corretamente em vez de ler `lucro`/`rentabilidade` cegamente.
- `app/(app)/investidor/page.tsx` (cards da listagem) e `components/investidor/ProjetoResumoInvestimento.tsx` (resumo do Imóvel) — trocaram o check antigo (`lucro != null || rentabilidade != null`) por `resultadoCenarioValido()`, para nunca mais exibir lucro/rentabilidade calculado a partir de dado incompleto.

**Dados reais corrigidos no banco** (Supabase, `prospeccao_cenarios`) — apenas valores derivados recalculados a partir das mesmas premissas já existentes, nenhum dado novo inventado:
| Prospecção / cenário | Antes | Depois |
|---|---|---|
| Bella teste pesquisa — Base | `lucro=-332602.45`, `rentabilidade=-85` (venda=null) | `valor_liquido_venda`, `lucro`, `rentabilidade` → `null`; `investimento_total=391297` preservado |
| Francisco Bernardes — Alpes do Vale (venda) — Base | `investimento_total/lucro/rentabilidade=0` (arrematação e venda=null) | todos os 4 campos → `null` |
| Francisco Bernardes — Alpes do Vale (venda) — Base (cópia) | idem acima | idem acima |

Conferido também o cenário "São Manoel — Base" (único com os dois valores presentes, `valor_arrematacao=355000`/`valor_venda_estimado=430000`): reproduzida a fórmula manualmente — `baseGanhoCapital = 38550` já era positiva antes do clamp — resultado permanece inalterado (`lucro=32767.5`, `rentabilidade≈8.96%`).

## 3. Aba "Decidir" simplificada

**Antes:** funcionava como mais uma etapa de preenchimento.
**Agora:** vira resumo final de leitura, com atalhos para o que falta:

- Veredito reorganizado em 3 checks — **Imóvel** (ficha completa), **Pesquisa de mercado** (analisada), **Viabilidade** (`resultadoCenarioValido`) — cada item incompleto ganha um link "Completar →" direto para a aba correspondente (`?tab=ficha|mercado|analise`).
- Nova seção "Resumo" com os campos pedidos, na ordem: situação dos dados do imóvel, valor estimado de mercado, cenário principal, valor de aquisição, investimento estimado, valor estimado de venda, lucro, rentabilidade.
- Nova seção "Decisão": só libera o troca-fase/registro de decisão quando os três checks acima estão OK; enquanto isso, mostra a mensagem do que falta em vez do formulário.
- Botão "Criar imóvel"/"Abrir imóvel" movido do cabeçalho para dentro da seção de Decisão (mesmo comportamento, lugar mais coerente com "resumo final → ação").

## 4. O que foi preservado (conforme pedido)

- Nenhuma tabela ou módulo novo — só uma correção pontual no motor de cálculo já existente.
- Cenário "Base" automático e reaproveitamento de dados já coletados: intocados.
- As 6 abas, os componentes `ProspeccaoFicha`/`ProspeccaoMercado`/`ProspeccaoCenarios`: intocados na estrutura, só ajustes internos mínimos.
- `lib/investidor-calculadora.ts` continua sendo a única fonte de cálculo, consumida igualmente por frontend e Luiza — nenhuma lógica duplicada.

## 5. Testes adicionados

`lib/__tests__/investidor-calculadora.test.ts` (29 testes, todos passando):
- Corrigidas 2 referências que quebravam com o novo tipo nullable (asserções `!` em casos onde o resultado é comprovadamente válido).
- Caso de borda "100% vazio": agora espera `null` nos 4 campos (antes esperava `0`).
- Novo `describe` reproduzindo o bug real (Bella): sem venda → `investimento_total` continua válido mas os outros 3 ficam `null`; sem aquisição → os 4 ficam `null`; com os dois → volta a calcular normalmente.
- Novo `describe` para o clamp da base de ganho de capital: venda abaixo do custo não gera IR negativo.
- Novo `describe` para `pendenciasCenario`/`resultadoCenarioValido`, incluindo o caso de dado legado corrompido (lucro/rentabilidade numéricos com premissa ausente) — confirma que a guarda rejeita esse formato mesmo sem ser `NULL`.

## 6. Validação

- `npx tsc --noEmit` — sem erros.
- `npx vitest run` — 200/200 testes passando (14 arquivos).
- `npx eslint` nos arquivos alterados — 0 erros, só warnings pré-existentes (`<img>`/`exhaustive-deps`, não relacionados a esta rodada).
- `npm run build` — build de produção concluído com sucesso (43 rotas).
- Correção de dados aplicada e conferida ao vivo via Supabase MCP contra o projeto real.
