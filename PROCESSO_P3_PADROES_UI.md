# BuildSmart — Padrões de UI (a partir do Motor de Processo, P3)

Status: regra ativa a partir desta rodada, para todo trabalho novo no BuildSmart — não só o Motor de Processo.

## Origem

Durante a P3.2, as telas de `/processos` foram construídas reinventando markup/estilo inline (header, card, badge de status, campo de busca, filtro em pílulas) — exatamente o mesmo padrão visual que já existia, duplicado, em `app/(app)/projetos`, `app/(app)/orcamentos` e `app/(app)/investidor`. Investigando, existia desde antes um kit de componentes em `components/ui/` (`Button`, `Input`/`Select`/`Textarea`, `Badge`, `Modal`, `EmptyState`, `InsightCard`) já usado em dezenas de arquivos — só não tinha sido consultado antes de escrever as páginas novas.

Regra, a partir de agora: **antes de criar qualquer elemento de UI (botão, campo, seletor, modal, card, badge de status, cabeçalho de página, filtro), verificar `components/ui/` primeiro.**

## Como decidir

1. **Já existe em `components/ui/`?** Usa. Não recria estilo equivalente na página.
2. **Não existe, mas é claramente reaproveitável** (vai aparecer em mais de uma tela — do mesmo módulo ou de outro)? Extrai para `components/ui/` como componente novo, documentado com um comentário curto dizendo de onde veio o padrão. É isso que promove um elemento a "componente de sistema".
3. **É genuinamente específico de uma tela** (um layout que não se repete em nenhum outro lugar)? Fica local na página — não força tudo a virar componente sem necessidade.

Um componente promovido a `components/ui/` vira o jeito padrão de fazer aquilo — não criar uma segunda versão parecida em outra tela depois. Se o padrão precisar mudar, muda no componente, não numa cópia local.

## Inventário atual de `components/ui/`

| Componente | Uso |
|---|---|
| `Button.tsx` | Botões (`variant`: primary/secondary/ghost/danger; `size`: sm/md/lg; suporta `loading`/`icon`) |
| `Input.tsx` | `Input`, `Select`, `Textarea` — todos com `label`/`error`/`hint` |
| `Badge.tsx` | Pílulas de status (`variant`: default/success/warning/danger/info) |
| `Modal.tsx` | Modal centralizado com portal, fecha no Esc/clique fora |
| `EmptyState.tsx` | Estado vazio (ícone + título + descrição + ação) |
| `InsightCard.tsx` | `MetricCard`/`StatusItemCard` — cards de métrica/item com `Tone` (accent/success/warning/danger/neutral) |
| `PageHeader.tsx` *(novo, P3.2)* | Cabeçalho de listagem: título + subtítulo + ações |
| `SearchInput.tsx` *(novo, P3.2)* | Campo de busca com ícone — existia duplicado em `projetos`/`investidor` |
| `FilterTabs.tsx` *(novo, P3.2)* | Filtro em pílulas (segmented control) — existia duplicado em `projetos`/`orcamentos`/`investidor` |

Estilos globais reaproveitáveis (não são componentes React, são classes em `app/globals.css`): `.card` (container padrão com fundo/borda/sombra) e `.input-base` (usado internamente por `Input`/`Select`/`Textarea` — não precisa ser reescrito à mão).

## O que NÃO fazer nesta rodada

- **Não** retroalimentar `projetos`/`obras`/`investidor` para usar os componentes novos (`PageHeader`, `SearchInput`, `FilterTabs`) só por consistência — essas telas já funcionam, testadas, em uso real; trocar a UI delas sem um pedido específico é risco de regressão visual sem benefício imediato. Migração desses call sites fica como oportunidade futura, tela por tela, não como tarefa desta rodada.
- **Não** unificar `Badge` (variant: default/success/warning/danger/info) com o `Tone` de `InsightCard` (accent/success/warning/danger/neutral) — são dois vocabulários de cor que já convivem no app; forçar os dois a serem um só é um refactor maior, fora do escopo de "criar um padrão para o que estou construindo agora".

## Aplicação nesta rodada

`app/(app)/processos/page.tsx`, `app/(app)/processos/novo/page.tsx` e `app/(app)/processos/[id]/page.tsx` foram reescritas para usar só os componentes acima — nenhum estilo de card/input/badge/header foi reinventado inline. Daqui pra frente (P3.3 em diante), toda tela nova do Motor de Processo segue esta mesma disciplina.
