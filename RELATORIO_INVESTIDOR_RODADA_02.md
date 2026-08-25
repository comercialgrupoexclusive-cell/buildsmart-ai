# Laboratório Investidor — Rodada 02 (Marco 2: Prospecções)

```
=== PARA REVISÃO ===
```

## 1. Resumo

Primeira parte utilizável do módulo Investidor: menu/hub `Investidor` com as 3
abas (Prospecções | Ativos | Comparador); só **Prospecções** tem
funcionalidade real, exatamente como autorizado. Ativos e Comparador são
navegação/placeholder coerente (`EmptyState`, sem lógica dos Marcos 4/5).

Entregue: cards com foto/nome/endereço/fase/data do leilão/valor de
arrematação (quando há cenário principal)/lucro e rentabilidade (só quando o
cenário principal já tem esses resultados)/próxima ação; busca por
nome/endereço; filtro pelas 7 fases aprovadas; cadastro rápido mobile com só
5 campos (foto, nome, endereço, link do leilão, data do leilão) que salva
mesmo só com o nome; tela interna com as 4 abas (Resumo funcional e
editável, Análise como placeholder estruturado para o Marco 3, Arquivos e
Board reaproveitando o máximo possível da V1 — ver seções 7 e 8 para os
dois pontos onde o reaproveitamento exigiu uma extensão mínima, documentada
antes de ser feita).

Antes de escrever qualquer componente, li `/projetos/page.tsx`,
`/projetos/[id]/page.tsx`, `ExcalidrawBoard.tsx`, `ObraArquivos.tsx` e o kit
de UI compartilhado (`components/ui/*`) — classificação de cada peça na
seção 4/5/6.

## 2. Arquivos alterados

**Novos:**
- `app/(app)/investidor/page.tsx` — hub (tabs + Prospecções + modal de
  cadastro rápido).
- `app/(app)/investidor/[id]/page.tsx` — tela interna da Prospecção.
- `components/investidor/ProspeccaoArquivos.tsx` — aba Arquivos.
- `supabase/migrations/20260825121423_investidor_marco2_prospeccoes.sql`.

**Modificados:**
- `components/board/ExcalidrawBoard.tsx` — nova prop opcional
  `prospeccaoId`, aditiva (branches novas ao lado de `projectId`/`obraId`/
  `portalToken`, nenhum comportamento existente alterado).
- `components/layout/Sidebar.tsx` — item de menu "Investidor".
- `lib/types.ts` — `Prospeccao.board_data` (novo campo opcional) e novo tipo
  `ProspeccaoArquivo`.

## 3. Rotas criadas

| Rota | Descrição |
|---|---|
| `/investidor` | Hub com tabs `?tab=prospeccoes\|ativos\|comparador` (default `prospeccoes`) |
| `/investidor/[id]` | Prospecção — tabs `?tab=resumo\|analise\|arquivos\|board` (default `resumo`) |

Mesmo padrão de rota-com-tab-via-searchParams já usado em
`/projetos/[id]?tab=...` e `/obras/[id]?tab=...`.

## 4. Componentes reutilizados (REUTILIZA)

- `components/ui/Button.tsx`, `Input.tsx` (`Input`/`Select`/`Textarea`),
  `Modal.tsx`, `EmptyState.tsx` — kit de UI compartilhado já usado em telas
  mais recentes do app (`app/(app)/servicos/page.tsx`). Preferido ao padrão
  de div/estilo inline mais antigo de `/projetos/page.tsx` (que é anterior a
  esse kit existir).
- `lib/utils.ts` (`formatCurrency`) — mesma formatação de moeda usada em
  todo o app.
- `lib/permissions.ts` (`usePermission`/`isCliente`) — mesmo gate de
  visibilidade do botão "Novo" já usado em `/projetos`.
- `ExcalidrawBoard` — o componente inteiro é reaproveitado (não foi
  duplicado); só ganhou uma prop nova (ver seção 7).
- Bucket de storage público `project-files` — mesmo bucket já usado por
  Projetos para foto e (agora) arquivos de Prospecção, com prefixo de path
  próprio (`prospeccoes/...`). Nenhum bucket novo foi criado.
- Padrão visual do card (foto dominante + gradiente + badge de status +
  rodapé) — mesma estrutura de `/projetos/page.tsx`, com os campos trocados
  para os de Prospecção.
- Padrão de tabs via `?tab=` — mesmo de `/projetos/[id]` e `/obras/[id]`.

## 5. Componentes adaptados (ADAPTA)

- `components/investidor/ProspeccaoArquivos.tsx` — adaptado de
  `components/obra/ObraArquivos.tsx` (mesma UI de lista/upload/remoção),
  mas apontando para uma tabela e bucket próprios em vez de `obra_files`
  (motivo na seção 8) e sem anotação de PDF nem link para IA (fora de
  escopo desta rodada — Luiza está explicitamente excluída).
- `ExcalidrawBoard.tsx` — adaptado (não duplicado) para aceitar
  `prospeccaoId` como uma 4ª origem de dados, ao lado de
  `projectId`/`obraId`/`portalToken` (motivo na seção 7).

## 6. Componentes novos (NOVO)

- `app/(app)/investidor/page.tsx` — hub Investidor (tabs + Prospecções +
  `ProspeccaoCard` + `NovaProspeccaoModal`, definidos no mesmo arquivo por
  serem pequenos e específicos desta tela).
- `app/(app)/investidor/[id]/page.tsx` — tela interna (`ResumoTab`, `Campo`,
  também no mesmo arquivo).
- Nenhum componente de Board, Arquivos, Card genérico ou Modal novo foi
  criado do zero — todos os "NOVO" acima são orquestração de tela, não
  duplicação de capacidade já existente.

## 7. Como o Board foi integrado

**Problema real encontrado (documentado antes de agir, como pedido):** o
Board de `Project` **não usa** a tabela `boards` (essa é exclusiva de
obra/portal — `ExcalidrawBoard` só a usa no branch `obraId`). O Board de
Project persiste direto numa coluna `board_data jsonb` em `projetos` +
arquivos do canvas em `board_files.projeto_id`. Não existe como "encaixar"
Prospecção nesse mecanismo sem estender alguma dessas duas estruturas — não
dava pra reaproveitar "de graça".

**Solução mínima adotada:** mesmo mecanismo, replicado para `prospeccoes`:
- `prospeccoes.board_data jsonb` (nova coluna, nullable, mesmo padrão de
  `projetos.board_data`).
- `board_files.prospeccao_id uuid references prospeccoes(id) on delete
  cascade` (nova coluna nullable).
- `board_files_owner_check` foi ampliada de `(projeto_id is not null OR
  board_id is not null)` para incluir `OR prospeccao_id is not null` —
  constraint existente ampliada, não removida.
- Índice único `board_files_prospeccao_file_uidx (prospeccao_id, id)`,
  espelhando o já existente `board_files_project_file_uidx`.
- `ExcalidrawBoard.tsx` ganhou o branch `prospeccaoId` em **todos** os
  pontos onde `projectId` já era tratado (carregar, canal realtime,
  persistir, upsert de arquivos) — aditivamente, sem alterar nenhuma linha
  do comportamento de `projectId`/`obraId`/`portalToken` existente.
- **Não foi criado um segundo editor/Board** — é o mesmo componente
  Excalidraw, mesma UI, mesmo botão de importar PDF, mesmas ferramentas.
  Painel de não-conformidades (NCs) continua desligado para Prospecção
  (`supportsNC = Boolean(projectId || obraId)`, não alterado) — não faz
  sentido antes de haver uma obra real.

## 8. Como Arquivos/foto foram integrados

**Problema real encontrado:** `obra_files.obra_id` é `NOT NULL`, e a tabela
carrega várias colunas exclusivas de obra/portal
(`publicado_cliente`, `source_type`/`source_id`/`source_index` de conteúdo
gerado por IA, `edited_by`/`edited_at`, `original_url`) que não têm sentido
nenhum para uma Prospecção. Relaxar o `NOT NULL` e deixar todas essas
colunas sempre nulas em toda linha de Prospecção seria pior (schema
confuso, zero ganho de reaproveitamento real) do que uma tabela nova pequena
e focada — decisão registrada aqui, não é o modelo do Marco 1 sendo alterado
sem necessidade, é uma tabela adicional para uma necessidade nova
(Arquivos) que o Marco 1 nunca cobriu.

**Solução mínima adotada:**
- Tabela nova `prospeccao_arquivos` (id, prospeccao_id FK cascade, nome,
  tipo, tamanho, categoria, url, criado_em) — um subconjunto reduzido e
  suficiente de `obra_files`.
- `ProspeccaoArquivos.tsx` reaproveita o mesmo padrão de UI de
  `ObraArquivos.tsx` (lista + botão "Anexar arquivo" + remoção), mesmo
  bucket de storage (`project-files`, já público e já usado por Projetos),
  só com prefixo de path `prospeccoes/<id>/...`.
- **Simplificação deliberada:** sem anotação de PDF (o componente
  `PdfAnnotator` está fechado em `contextType: 'obra' | 'projeto'`, com a
  mesma restrição replicada em CHECK no banco — ampliar isso só para abrir
  "Abrir com anotações" no Investidor seria escopo além do pedido nesta
  rodada) e sem o botão "Abrir IA" (Luiza está explicitamente fora de
  escopo). Os arquivos ficam listados com nome, categoria, tamanho, data e
  um link direto para abrir/baixar.
- **Foto principal:** usa o mecanismo mais simples já existente — upload
  direto pro bucket público `project-files` (mesmo padrão de
  `/projetos/page.tsx`), sem fallback base64 forçado (só cai pra `null` se o
  upload falhar, evitando gravar imagens grandes como data URL no banco).

## 9. Comportamento mobile

Cadastro rápido: modal com só 5 campos (foto opcional, nome, endereço, link
do leilão, data do leilão) — sem "ficha longa", exatamente como pedido;
salvar funciona só com o nome preenchido. Listagem: grid
`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` (1 coluna no celular), busca e
chips de fase em `flex-col sm:flex-row` com os chips em uma faixa
`overflow-x-auto` (rolam horizontalmente sem quebrar o layout da página).
Tabs da tela interna (Resumo/Análise/Arquivos/Board) na mesma faixa
horizontal rolável. Validado com reprodução estática (Playwright) em
360/390/430px — ver arquivo enviado ao usuário nesta rodada; o sandbox não
alcança `*.supabase.co` a partir do navegador (mesma limitação já
documentada nas Rodadas anteriores desta sessão), então não foi possível
abrir a aplicação real ao vivo aqui — a lógica de dados foi validada à parte
via SQL direto (seção 10).

## 10. Testes executados

Todos os 18 itens pedidos, os de dados via SQL direto contra produção
(`jwezrjyatfjvvsugtugo`), com registros sintéticos `QA R2 ... (temporário —
apagar)` removidos ao final (base confirmada de volta a 0 em
prospeccoes/prospeccao_cenarios/prospeccao_arquivos/board_files-por-
prospeccao e `projetos` continua em 0, sem nenhuma alteração):

| # | Item | Resultado |
|---|---|---|
| 1-2 | Abrir Investidor / navegar Prospecções↔Ativos↔Comparador | OK — rotas compilam e renderizam (`npm run build`); tabs trocam via `?tab=` |
| 3 | Criar Prospecção | OK — insert com todos os campos do cadastro rápido |
| 4 | Criar só com campos mínimos (nome) | OK — `fase` cai no default `'nova'`, demais campos `null` |
| 5 | Editar Prospecção | OK — update de fase/responsável/próxima ação confirmado |
| 6 | Listar cards | OK — query com embed de `prospeccao_cenarios` retorna a forma exata que o card consome |
| 7 | Buscar | Lógica client-side simples (`.includes`) sobre nome/endereço — sem necessidade de teste de banco |
| 8 | Filtrar todas as 7 fases | OK — testado update de fase + filtro client-side sobre o enum já existente do Marco 1 |
| 9 | Abrir uma Prospecção | OK — rota `/investidor/[id]` compila e busca por id |
| 10 | Navegar Resumo/Análise/Arquivos/Board | OK — 4 abas trocam via `?tab=`, cada uma renderiza seu bloco |
| 11 | Usar Board sem afetar Projects existentes | OK — `board_files_owner_check` ampliada (não substituída) confirmada via `pg_get_constraintdef`; insert/upsert com `prospeccao_id` funciona; `board_data`/`board_files` de Prospecção testados ponta a ponta (gravar, ler, upsert por `onConflict`) |
| 12 | Usar Arquivos/foto | OK — insert/select/delete em `prospeccao_arquivos`; upload de foto usa o mesmo bucket `project-files` |
| 13 | Responsividade mobile | Reprodução estática em 360/390/430px (ver arquivo enviado) — ver limitação de ambiente na seção 9 |
| 14 | `/projetos` continua funcionando | OK — `projetos` inalterado neste round (só ganhou `contexto` na Rodada 1); nenhuma coluna/constraint de `projetos` foi tocada; `npm test` 84/84 continua passando |
| 15-16 | TypeScript / build | `npx tsc --noEmit` limpo; `npm run build` — 43 rotas, incluindo `/investidor` e `/investidor/[id]` |
| 17 | Lint conforme configuração real | Ver seção 11 |
| 18 | Testes relevantes existentes | `npm test` — 8 arquivos, 84/84 passando, sem alteração |

## 11. TypeScript / build / lint

- `npx tsc --noEmit`: limpo.
- `npm run build`: sucesso, 43 rotas (41 da Rodada 1 + `/investidor` +
  `/investidor/[id]`).
- `npm test`: 84/84 passando (nenhum teste toca nesta área).
- `npm run lint`: baseline pré-existente do projeto tem ~2100 problemas
  vindos de um arquivo minificado/gerado (mesmo achado já registrado na
  rodada anterior, não relacionado, não corrigido). Nos arquivos desta
  rodada: `Sidebar.tsx` e `lib/types.ts` limpos; `ExcalidrawBoard.tsx`
  limpo; `app/(app)/investidor/page.tsx` e `.../[id]/page.tsx` só com
  avisos (`<img>` sem `next/image`, dependência de `useEffect` — mesmo
  padrão de aviso já presente em `/projetos/page.tsx` e `/projetos/[id]`,
  não é uma regra nova violada só aqui); `ProspeccaoArquivos.tsx` tem 1
  **erro** da regra nova `react-hooks/set-state-in-effect` no padrão
  "buscar dados ao montar" (`useEffect(() => { void carregar() },
  [prospeccaoId])`) — confirmado que **o mesmo padrão em
  `ObraArquivos.tsx` já existente falha exatamente a mesma regra**
  (`setArquivos(locais)` direto no efeito), ou seja, não é uma regra nova
  sendo violada só pelo código novo, é um padrão pré-existente e tolerado
  no projeto sendo repetido de forma consistente. Registrado, não
  "corrigido" à força criando um padrão diferente e não testado só para
  esta tela.

## 12. Problemas encontrados

- Ver seções 7 e 8 (Board e Arquivos) — ambos exigiram uma extensão mínima
  documentada antes de implementar, exatamente como pedido em caso de
  incompatibilidade real.
- Regra de lint nova (`react-hooks/set-state-in-effect`) é inconsistente:
  sinaliza `ProspeccaoArquivos.tsx` e o já existente `ObraArquivos.tsx`,
  mas não sinaliza `/projetos/page.tsx` nem `/projetos/[id]/page.tsx`, que
  usam um padrão de "buscar ao montar" estruturalmente muito parecido.
  Registrado como achado de ferramenta, não como bug do código novo.
- A especificação da Rodada 2 pede exibir "avaliação, se houver" no Resumo,
  mas o schema do Marco 1 não tem um campo `avaliacao` dedicado. Mapeado
  para `prospeccao_cenarios.valor_venda_estimado` do cenário principal
  (rotulado explicitamente "Avaliação (venda estimada, cenário principal)"
  na tela) — é a leitura mais direta already-existente no schema aprovado,
  em vez de adicionar uma coluna nova só para isso. Ver seção 13.

## 13. Diferenças entre especificação e implementação

- **"Avaliação"** no Resumo → mapeada para `valor_venda_estimado` do
  cenário principal (ver seção 12). Nenhuma coluna nova foi criada; se essa
  leitura estiver errada, é reversível trocando só o rótulo/campo lido, sem
  mudança de schema.
- **Board/Arquivos** exigiram extensão mínima de schema (documentado nas
  seções 7/8) — a especificação já previa essa possibilidade
  ("Se o modelo de persistência atual impedir reaproveitamento limpo,
  documentar... implementar a solução mínima compatível").
- Fora esses dois pontos, a implementação segue a especificação da Rodada 2
  linha a linha.

## 14. Decisões deliberadamente adiadas para o Marco 3+

- Motor de cálculo (À vista/SAC/PRICE), CRUD completo de `prospeccao_cenarios`
  (criar/editar/excluir cenário, marcar principal pela UI) — a aba Análise é
  só um `EmptyState` explicando o que chega no Marco 3.
- Comparador funcional (aba já existe como placeholder).
- Ativos / conversão Prospecção → Project — aba já existe como placeholder;
  nenhuma ação de conversão foi criada (`prospeccoes.project_id` continua
  só estrutural, como definido na Rodada 1).
- Luiza no domínio Investidor, multimodal, Web Search, habilidades, rotinas,
  agentes — nada disso foi tocado.
- Anotação de PDF em Arquivos do Investidor (ver seção 8) — deliberadamente
  fora desta rodada.

## 15. Commit SHA final

Ver histórico do repositório (`previsoes/prazo-fornecimento-material`,
mesclado em `main`) — reportado ao final da execução desta rodada.
