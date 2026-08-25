# Laboratório Investidor — Rodada 01 (Marco 1: Banco e domínio)

```
=== PARA REVISÃO ===
```

## 1. Resumo do que foi implementado

Fundação de banco/domínio para o Laboratório Investidor, exatamente no escopo
autorizado (Marco 1 — nada de frontend, Luiza, comparador, comercialização,
rotinas/skills/agentes, nem antecipação dos Marcos 2–8):

- Tabela `prospeccoes` — entidade leve, anterior ao Project, com as 7 fases
  aprovadas e vínculo futuro (nullable) com `projetos`.
- Tabela `prospeccao_cenarios` — múltiplos cenários financeiros por
  prospecção, com constraint real de "no máximo um principal", premissas
  explícitas (campos semânticos, não JSON) e colunas de resultado que ficam
  `null` até o motor de cálculo do Marco 3 (não implementado nesta rodada,
  como pedido).
- Tabela `prospeccao_evidencias` — evidências com distinção
  observado/inferido/estimado, campos semânticos simples.
- Coluna `projetos.contexto` (`projeto` | `investimento`), default `projeto`,
  sem alterar `status` nem `fase_ciclo`.
- Tipos TypeScript correspondentes em `lib/types.ts` (nenhum uso em
  frontend ainda — só o domínio).

Antes de tocar em qualquer coisa, inspecionei o schema real ao vivo no
projeto Supabase (`jwezrjyatfjvvsugtugo`): colunas/constraints/policies de
`projetos`, o padrão de migrations do repositório, e os tipos TypeScript
relacionados a Project — não assumi nenhuma estrutura.

## 2. Arquivos alterados

- `lib/types.ts` — adicionados `ProspeccaoFase`, `Prospeccao`,
  `ProspeccaoCenario`, `ProspeccaoEvidencia` no final do arquivo, seguindo o
  padrão de seções já existente (`// ─── Nome ───`). Nenhum tipo existente
  foi alterado.
- `supabase/migrations/20260825113807_investidor_marco1_fundacao.sql`
  (novo).

**Deliberadamente NÃO alterado:** os tipos locais `Projeto` definidos dentro
de páginas (`app/(app)/projetos/page.tsx` e outros 6 arquivos) — cada um é um
view-model que só seleciona as colunas que a tela usa; nenhum deles usa
`contexto` ainda porque não há frontend nesta rodada. Adicionar o campo lá
seria código morto e uma alteração fora do escopo ("não implementar
frontend", "evitar refatorações amplas").

## 3. Migration criada

`supabase/migrations/20260825113807_investidor_marco1_fundacao.sql`
(aplicada ao projeto Supabase `jwezrjyatfjvvsugtugo` via migração
administrativa nomeada `investidor_marco1_fundacao`, mesmo mecanismo já
usado nesta sessão para as migrações anteriores).

Conteúdo: criação de `prospeccoes`, `prospeccao_cenarios`,
`prospeccao_evidencias` (com índices, comentários e RLS) e o
`alter table projetos add column contexto`. Texto completo no arquivo do
repositório — não duplicado aqui para evitar divergência.

## 4. Schema final das novas estruturas

### `prospeccoes`
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| nome | text | não | — |
| endereco | text | sim | — |
| foto_url | text | sim | — |
| link_leilao | text | sim | — |
| data_leilao | date | sim | — |
| fase | text | não | `'nova'` |
| responsavel | text | sim | — |
| proxima_acao | text | sim | — |
| observacao | text | sim | — |
| project_id | uuid | sim | — |
| created_at | timestamptz | não | `now()` |
| updated_at | timestamptz | não | `now()` |

`fase` — CHECK: `nova, em_analise, aprovada, em_disputa, adquirida, descartada, nao_adquirida`.
Índices: `idx_prospeccoes_fase`, `idx_prospeccoes_project_id` (parcial, `where project_id is not null`).

### `prospeccao_cenarios`
| Coluna | Tipo | Nullable |
|---|---|---|
| id | uuid | não (PK) |
| prospeccao_id | uuid | não (FK) |
| nome | text | não |
| modalidade | text | não — CHECK `vista, sac, price` |
| principal | boolean | não, default `false` |
| valor_arrematacao, valor_venda_estimado, comissao_leiloeiro, itbi, registro, advogado_desocupacao, reforma, outros_custos | numeric | sim |
| prazo_venda_meses | integer | sim |
| iptu, condominio | numeric | sim |
| corretagem, imposto_ganho_capital | numeric | sim |
| entrada, percentual_financiado, valor_financiado, taxa_juros | numeric | sim |
| prazo_financiamento_meses | integer | sim |
| investimento_total, valor_liquido_venda, lucro, rentabilidade | numeric | sim (resultados — sempre `null` nesta rodada) |
| created_at, updated_at | timestamptz | não, default `now()` |

Índices: `idx_prospeccao_cenarios_prospeccao_id`; índice único parcial
`prospeccao_cenarios_unico_principal` em `(prospeccao_id) where principal`
— garante no máximo 1 cenário principal por prospecção.

### `prospeccao_evidencias`
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| prospeccao_id | uuid | não | — |
| informacao | text | não | — |
| tipo | text | sim | — |
| fonte | text | sim | — |
| url | text | sim | — |
| data_evidencia | date | sim | — |
| natureza | text | não | `'observado'` |
| created_at, updated_at | timestamptz | não | `now()` |

`natureza` — CHECK: `observado, inferido, estimado`.
Índice: `idx_prospeccao_evidencias_prospeccao_id`.

### `projetos` (alteração)
Nova coluna `contexto text not null default 'projeto' check (contexto in ('projeto','investimento'))`.
`status` (`aguardando|em_andamento|concluido|suspenso`) e `fase_ciclo`
(`projeto|em_obra|entregue`) **não foram tocados** — confirmado lendo os
CHECK constraints reais (`projetos_status_check`, `projetos_fase_ciclo_check`)
antes e depois da migração: idênticos.

## 5. Constraints e FKs adotadas

- `prospeccoes.project_id → projetos(id) ON DELETE SET NULL` — mesmo padrão
  já usado em `obras.projeto_id → projetos` (vínculo opcional entre
  agregados independentes). Excluir o projeto nunca apaga a prospecção.
- `prospeccao_cenarios.prospeccao_id → prospeccoes(id) ON DELETE CASCADE` —
  mesmo padrão de `orcamento_itens.orcamento_id → orcamentos` (filho
  pertence ao pai; cenário sem prospecção não tem sentido).
- `prospeccao_evidencias.prospeccao_id → prospeccoes(id) ON DELETE CASCADE`
  — mesma lógica.
- `prospeccao_cenarios_unico_principal` — índice único parcial, não uma
  CHECK constraint (Postgres não permite CHECK que enxergue outras linhas da
  mesma tabela) — é a forma padrão e correta do Postgres para "no máximo um
  X por grupo".
- `projetos.contexto` — CHECK simples de 2 valores, sem FK.

Nenhuma FK nova aponta para `profiles`/usuários — `responsavel` em
`prospeccoes` é texto livre, espelhando `obras.responsavel` e
`projetos.responsavel` (ambos já são texto livre no schema real, não FK).

## 6. Política de exclusão adotada e justificativa

- **Prospecção → Projeto (SET NULL):** a especificação exige explicitamente
  "evitar cascade destrutivo que possa apagar histórico de Prospecção
  acidentalmente". Excluir um Project/Ativo nunca deve levar junto o
  histórico de análise da prospecção que o originou. Testado: apagar o
  projeto vinculado preserva a prospecção e todos os seus cenários/evidências
  (só `project_id` vira `null`).
- **Cenário/Evidência → Prospecção (CASCADE):** esses registros só existem
  em função da prospecção; não há cenário ou evidência "órfã" com sentido de
  negócio. Excluir a prospecção remove seu histórico de cenários/evidências
  junto — comportamento esperado, testado e confirmado.
- Nenhuma tabela usa `ON DELETE RESTRICT`/`NO ACTION` nesta rodada — não há
  nenhuma outra tabela existente apontando para `prospeccoes` ainda (o
  vínculo Prospecção→Ativo é o único, e ele é o lado FK em `prospeccoes`,
  não o inverso).

## 7. Compatibilidade com Projects existentes

- `contexto` é `NOT NULL DEFAULT 'projeto'` — o Postgres aplica o default a
  todas as linhas existentes na mesma operação de metadados (não precisa de
  UPDATE em massa nem migração manual de dados).
- Testado ao vivo: criar um projeto novo sem especificar `contexto` resulta
  em `contexto = 'projeto'`, com `status`/`fase_ciclo` inalterados
  (`em_andamento`/`projeto`, os defaults de sempre).
- No momento desta rodada a tabela `projetos` de produção está com 0 linhas
  (a base operacional foi zerada numa rodada anterior desta mesma sessão,
  para o laboratório da Allegra) — não havia "projetos existentes" reais
  para testar no banco de produção, então a garantia foi validada
  estruturalmente (default aplicado à coluna) e com um projeto sintético de
  QA, removido ao final.

## 8. RLS / Policies

Seguido exatamente o padrão de segurança real e mais recente já em uso no
banco (confirmado consultando `pg_policies` antes de escrever qualquer
coisa, não assumido): RLS habilitado nas 3 tabelas novas, cada uma com uma
única policy permissiva:

```sql
create policy <tabela>_all on public.<tabela> for all using (true) with check (true);
```

Esse é o mesmo padrão de `projeto_itens` (`projeto_itens_all`) e
`luizia_wa_phone_rules` (`wa_rule_all`) — as tabelas mais recentes e
análogas do schema. O BuildSmart V1 não tem sessão/autenticação real por
linha (confirmado nesta mesma sessão em rodada anterior, ao investigar o
hotfix de privacidade da Luiza: `currentProfile` é só um valor de
localStorage, sem JWT/RLS por usuário) — abrir uma policy mais restritiva
para as tabelas novas criaria uma inconsistência de segurança dentro do
próprio domínio Investidor (ex.: usuário consegue editar `projetos` livremente
mas não `prospeccoes`), sem nenhum ganho real de segurança, já que o
mesmo cliente anônimo/autenticado tem acesso equivalente a todo o resto do
schema. Isso é uma limitação já existente do MVP, documentada (não nova
desta rodada, e não é papel desta rodada resolvê-la) — não desabilitei RLS
em lugar nenhum, e não criei acesso mais aberto do que o padrão já vigente.

## 9. Testes executados e resultados

Todos executados diretamente contra o banco de produção
(`jwezrjyatfjvvsugtugo`) via SQL, usando registros sintéticos claramente
identificados (`QA ... TESTE (temporário — apagar)`), removidos ao final —
base voltou a 0 linhas em todas as tabelas novas e em `projetos`, igual ao
estado antes do teste.

| # | Teste | Resultado |
|---|---|---|
| 1 | Migration aplicada | OK — `investidor_marco1_fundacao` presente em `list_migrations` |
| 2 | Projetos existentes continuam válidos | OK — 0 linhas reais no momento, garantia validada estruturalmente (default de coluna) |
| 3 | Default `contexto='projeto'` | OK — projeto criado sem especificar `contexto` retornou `'projeto'`, `status`/`fase_ciclo` inalterados |
| 4 | Criar Prospecção | OK — `fase='em_analise'` (explícita), `project_id=null` |
| 5 | Múltiplos Cenários numa Prospecção | OK — 2 cenários criados (`vista` e `sac`) |
| 6 | Constraint de cenário principal | OK — marcar um 2º cenário como principal disparou `duplicate key value violates unique constraint "prospeccao_cenarios_unico_principal"`; o fluxo correto (desmarcar o antigo, depois marcar o novo) funcionou normalmente |
| 7 | Evidências | OK — 2 evidências criadas, uma `observado` outra `estimado` |
| 8 | Vínculo nullable Prospecção→Project | OK — `UPDATE prospeccoes SET project_id = <projeto investimento>` funcionou; um projeto com `contexto='investimento'` foi usado no teste |
| 9a | Excluir o Project vinculado | OK — prospecção sobreviveu com `project_id=null`, `fase` preservada (`adquirida`), 2 cenários e 2 evidências intactos |
| 9b | Excluir a Prospecção | OK — cascade correto: 0 cenários e 0 evidências restantes (comportamento esperado de filho-do-pai, não "destrutivo indevido") |

## 10. Build/TypeScript/Lint/Testes

- `npx tsc --noEmit` — limpo, sem erros.
- `npm run build` (Next 16.2.7/Turbopack) — sucesso, 40 rotas geradas.
- `npm run lint` (eslint) — 2106 problemas (392 erros, 1714 warnings) — **idênticos
  antes e depois desta mudança**, comparado via `git stash` (mesma técnica
  usada em rodadas anteriores desta sessão). Todos vêm de um arquivo com
  linhas de dezenas de milhares de colunas (característica de arquivo
  minificado/gerado, não de código-fonte desta rodada) — pré-existente, não
  relacionado, **não corrigido** conforme instrução explícita desta rodada
  ("NÃO CORRIGIR problemas não relacionados... Apenas registrar"). Lint
  isolado em `lib/types.ts` (único arquivo de código-fonte alterado): 0
  problemas.
- `npm test` (vitest) — 8 arquivos, 84/84 testes passando, sem alteração em
  relação ao estado anterior (nenhum teste existente toca nesta área).

## 11. Problemas encontrados

- O eslint do projeto reporta ~2100 problemas pré-existentes vindos de um
  arquivo com conteúdo minificado/gerado (linhas de dezenas de milhares de
  colunas) incluído no lint — não identifiquei qual arquivo é exatamente
  (não investiguei a fundo por estar fora do escopo desta rodada), só
  confirmei que é 100% pré-existente e não relacionado a esta mudança.
  **Registrado, não corrigido**, conforme instrução.
- A tabela `projetos` (e todo o restante da base operacional) está
  zerada em produção no momento desta rodada — consequência de uma limpeza
  administrativa feita numa rodada anterior desta mesma sessão (preparação
  para o cadastro real da Allegra). Isso não é um problema desta rodada, mas
  limitou a validação do item 7 do critério de aceite ("confirmar que
  registros existentes de projetos continuam válidos") a uma verificação
  estrutural + sintética, já que não havia projetos reais para reconferir.

## 12. Decisões deliberadamente adiadas para próximas rodadas

- Motor de cálculo dos cenários (Marco 3) — nenhuma fórmula foi implementada;
  as colunas de resultado (`investimento_total`, `valor_liquido_venda`,
  `lucro`, `rentabilidade`) existem só como destino futuro, sempre `null`.
- Ação de conversão Prospecção → Ativo (Marco 4) — só a possibilidade
  estrutural do vínculo (`project_id` nullable) foi criada; nenhum
  trigger/RPC de conversão, nenhuma validação cruzada obrigando
  `projetos.contexto = 'investimento'` quando `prospeccoes.project_id` está
  setado (isso exigiria um trigger, já que CHECK não enxerga outra tabela —
  decisão de fazer isso pertence à rodada que implementar a conversão real).
- Nenhum campo de `prospeccao_cenarios` foi acoplado por CHECK ao valor de
  `modalidade` (ex.: exigir `entrada`/`taxa_juros` só quando
  `modalidade in ('sac','price')`) — é uma regra de validação de negócio,
  não de schema, e pertence ao Marco 3 junto com o motor de cálculo.
- Frontend, Luiza, Comparador, Comercialização, Rotinas/Skills/Agentes —
  fora de escopo desta rodada, nada foi criado.
- Não toquei nos tipos `Projeto` locais de página nem em nenhuma tela — zero
  mudança visual ou funcional na V1.

## 13. Commit SHA final

Ver mensagem de commit desta rodada no histórico do repositório
(`previsoes/prazo-fornecimento-material`, depois mesclado em `main`) — o SHA
exato é reportado pelo Git ao final da execução desta rodada.
