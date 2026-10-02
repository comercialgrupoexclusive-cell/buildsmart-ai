# BuildSmart — Relatório de Componentes (nova organização)

> Deliverable pedido: **componentes criados e reutilizáveis, sem cópias.**
> Atualizado durante a sessão autônoma de 02/out/2026. Arquitetura canônica: `ARQUITETURA.md`.

## 1. Design system — os componentes reutilizáveis (`components/ui/`)
As "peças base". Reuso real = nº de arquivos que importam:

| Componente | Reuso | Papel |
|---|---:|---|
| `Button` | **59×** | botões (variantes, tamanhos, loading, ícone) |
| `Input` (+ Select, Textarea) | **42×** | campos de formulário (label/erro/hint) |
| `EmptyState` | **39×** | estado vazio |
| `Modal` | **35×** | modal central (portal, ESC, clique-fora) |
| `Badge` | 5× | pílula de status |
| `ComboboxCriavel` | 5× | select com criação inline |
| `PageHeader` | 4× | cabeçalho de listagem |
| `InsightCard` (MetricCard/StatusItemCard) | 4× | cards de métrica/status |
| `Tabs` | 2× | abas |
| `SearchInput` | 2× | busca com ícone |
| `FilterTabs` | 1× | filtro em pílulas |
| `HierarchyTree` | 1× | **árvore/EAP reutilizável** (ver §2) |
| `SortableList` | 0× diretos | DnD (usado internamente pelo HierarchyTree) |

**Leitura:** a base (Button/Input/Modal/EmptyState) é **muito reutilizada** — o sistema já
tem um design system sólido. As peças mais novas têm pouco alcance porque só as telas novas
as usam; as **legadas reimplementam inline** (é aí que mora a dívida — §4).

## 2. Primitivas de composição (o "componente aninhado")
- **`HierarchyTree`** — a árvore genérica (hierarquia, níveis, expandir, reordenar,
  numeração, seleção). Recebe o conteúdo via **render-prop**; as regras do domínio ficam
  **fora**. É o modelo certo de reutilização. Hoje usada pela **EAP**; alvo: Orçamento e
  Cronograma passarem a **compô-la** (Fase 2), em vez de ter árvore própria.
- `ComboboxCriavel`, `SortableList` — demais peças de composição.

## 3. "Visão Geral": 3 componentes — e **NÃO são cópias**
Auditado (pedido explícito de não carregar duplicação):

| Arquivo | O que é | Veredito |
|---|---|---|
| `components/processo/ProcessoVisaoGeral.tsx` (92 l) | aba de dados do processo (já reusa `ProcessoDadosForm`) | feature própria ✅ |
| `components/dashboard/VisaoGeral.tsx` (237 l) | **dashboard configurável** por widgets (registry + reordenar/ocultar) | **exemplo-modelo** de reutilização/aninhamento ✅ |
| `components/obra/ObraVisaoGeral.tsx` (265 l) | overview da obra legada (progresso, fornecedores) | legado (Fase 2) |

→ **Comportamentos distintos → mantidas separadas.** Não é cópia; unificar seria
**abstração forçada** (que não queremos). O `dashboard/VisaoGeral` já é a referência de
como fazer: dados entram por props, widgets compostos por um registry + `RenderWidget`.

## 4. Duplicação real: onde está (e onde NÃO está)
- **Nível de arquivo:** nenhuma — não há componente com nome repetido em pastas diferentes.
- **A dívida real está DENTRO do legado** (`components/obra/*`, `components/projeto/*`):
  reimplementam inline o que o `components/ui/` já oferece (cards, inputs, badges) e têm
  **árvores próprias** (`ObraOrcamento`, `ObraCronograma`) em vez do `HierarchyTree`.
  → Resolve-se na **Fase 2** (refazer os módulos nativos **compondo** o design system),
  **não** copiando o legado pra pastas novas.

## 5. Feito nesta sessão autônoma (organização)
- **Motor limpo:** `eap`, `caixa-entrada`, `clientes`, `planta-baixa`, `orcamento` saíram
  de `lib/processo/` → suas casas `lib/<m>/`. `lib/processo/` = só o núcleo
  (`domain/ actions/ service/ repository/ index/ context`). Verificado (tsc + app).
- **Casas de módulo consolidadas** (lib espalhada → 1 pasta por módulo; tsc + app a cada passo):
  - `lib/orcamento/` (processo, arvore, buscar-catalogo, inserir-item, vinculos, export,
    import-export, ai, import-export-templates)
  - `lib/investidor/` (ai-tools, calculadora, oportunidade, venda + carteira)
  - `lib/portal/` (+ admin-client)
- **Bug de frontend corrigido:** `<a>` aninhado no `ProcessoCard` (hydration error) → `<span>`.
- **Deixado de propósito p/ você:** cluster Luiza/IA (13 arquivos `luizia-*` soltos) —
  organizá-lo é decisão da camada de IA; legados `obra-*`/`projeto-*` saem na Fase 2.

## 6. Recomendação para a Fase 2 (refazer os 4 módulos acoplados)
Cada módulo legado, ao virar nativo no Processo, deve **compor** (não recriar):
- estrutura/árvore → **`HierarchyTree`**
- botões / campos / modais / estado-vazio → **`components/ui/*`**
- cabeçalho / busca / filtro → `PageHeader` / `SearchInput` / `FilterTabs`
- métrica / status → `InsightCard` / `Badge`

Módulos a refazer (hoje "casca sobre obra legado"): **planejamento · medições · financeiro
· compras/requisições**. É trabalho grande e sensível (mexe em telas): recomendo fazer
**tela a tela, com alinhamento**, não em bloco único.
