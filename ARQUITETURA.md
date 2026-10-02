# BuildSmart — Arquitetura Canônica (Motor de Processos)

> **Este é o documento canônico sobre O QUE o BuildSmart é.** Fonte única da verdade
> da arquitetura. Se qualquer outro arquivo divergir deste, este prevalece.
>
> - **Como trabalhar** (regras de execução): `AGENTS.md`
> - **Estado da última entrega**: `HANDOFF_BUILDSMART.md`
> - **Histórico** (relatórios de rodada, auditorias, planos antigos): `docs/historico/`
>
> Documentos de origem consolidados aqui: `PROCESSO_P2_CONTRATO_MOTOR.md`,
> `PROCESSO_P3_PLANO_ACAO_CLAUDE.md`, `PROCESSO_P3_PADROES_UI.md` (movidos para
> `docs/historico/` — seu conteúdo canônico vive agora neste arquivo).

---

## 0. Por que este motor existe (a visão)

O BuildSmart nasceu como app de **obras**. Em paralelo surgiram apps separados para
**casa**, **contas a pagar** e **compra em leilão / prospecção**. Ter vários apps se
mostrou ineficiente e bagunçado.

**Decisão canônica:** um **único motor adaptável**. Casa, contas a pagar, obra e
prospecção/leilão são o **mesmo motor** — cada uso é um **Template** que liga só os
**módulos** que fazem sentido para ele.

```
            ┌─────────────── MOTOR DE PROCESSOS ───────────────┐
            │  Processo (raiz) + Módulos (liga/desliga) + RLS   │
            └───────────────────────────────────────────────────┘
                 ▲            ▲            ▲             ▲
            Template      Template     Template      Template
             "Obra"       "Casa"     "Contas a      "Leilão /
                                       pagar"       Prospecção"
```

Nenhum uso novo deve virar um app novo ou uma raiz nova. Vira um **Template** sobre o
mesmo motor.

---

## 1. Princípio canônico

- **`Processo` é a raiz única e operacional.** Nunca é alias de `projetos`, nunca é
  `obras` renomeada, nunca depende estruturalmente de nenhuma das duas.
- `projetos` e `obras` são **legado em absorção** — reaproveitar comportamento útil,
  não reaproveitar a ambiguidade estrutural de ter duas raízes.
- **Ontologia operacional:** `Organização → Processo → Módulo → Registro`.
- A IA (Luiza), a UI e a API **resolvem primeiro o Processo**; nunca escolhem entre
  raízes legadas (`obras` vs `projetos`).

---

## 2. Entidade `Processo`

Fonte de verdade do tipo: `lib/processo/domain/types.ts`.

Campos principais: `id`, `organization_id`, `nome`, `tipo`, `cliente_nome`,
endereço estruturado (`cep`, `logradouro`, `numero`, `complemento`, `bairro`,
`cidade`, `uf`), `responsavel_id`, `status`, `capa_url`, `grupo_id`, `template_id`,
`template_key`, `created_at`, `updated_at`, `archived_at`.

**Status canônicos** (nenhum módulo inventa um segundo status raiz):
`ACTIVE` · `ON_HOLD` · `COMPLETED` · `ARCHIVED`.

- **Grupo** (`ProcessoGrupo`) é só um rótulo de listagem — sem hierarquia nem regra
  própria. Um Processo pertence a no máximo um grupo.
- **Uso** (`ProcessoUso`): rastro por (processo, pessoa, módulo) que alimenta a
  ordenação "último uso" e as últimas ações do card.

---

## 3. Módulos

Fonte de verdade: `lib/processo/domain/module-registry.ts` (`PROCESSO_MODULES`).

O **registry é a lista única, no código**, de quais módulos existem e quais ligam por
padrão. O banco (`processo_modulos`) guarda apenas o estado **ligado/desligado + config**
por Processo — **a definição do módulo vive no código, não no banco**. Não é um
framework de plugins: é uma lista tipada e explícita.

Módulos atuais (19) e se nascem ligados por padrão (`enabledByDefault`):

| Módulo (`key`) | Padrão | Módulo (`key`) | Padrão |
|---|:---:|---|:---:|
| `dados_gerais` | ✅ | `relatorios` | — |
| `projeto_tecnico` | ✅ | `planta_baixa` (Planta 2D/3D) | — |
| `orcamento` | ✅ | `board` | — |
| `planejamento` | ✅ | `caixa_entrada` | ✅ |
| `tarefas` | ✅ | `portal_cliente` | — |
| `execucao` | — | `pesquisa_mercado` | — |
| `medicoes` | — | `tour_360` | — |
| `compras` | — | `eap` (Estrutura) | ✅ |
| `financeiro` | — | | |
| `financiamento` | — | | |
| `rdo` | — | | |

Cada módulo pode ter **opções de config** (`configOpcoes`, boolean) — ex.: `eap` tem
`mostrar_numeracao`. O valor efetivo vem de `processo_modulos.config[key]`, caindo no
default do registry (`lerConfigBool`).

**Reaproveitamento (não reescrever):** `planta_baixa` usa o OpenPlan3D vendorizado;
`board` reusa o Excalidraw; `pesquisa_mercado` reusa o motor do Investidor; `tour_360`
reusa o motor de fotos 360 do Portal.

---

## 4. Templates (dado, não código)

Fonte de verdade: `lib/processo/domain/template.ts` + tabela `processo_templates`.

O **Template é editável pelo usuário** (não é hardcode). Ele define, por tipo de uso:

1. **quais módulos nascem ligados** (`modulos`);
2. **quais campos do cadastro somem** (`campos_ocultos` — só `cliente_nome`,
   `endereco`, `tipo`, `responsavel_id` podem ser ocultados; `nome` e `status` nunca);
3. a **config padrão por módulo** (`config_padrao`), aplicada na criação do Processo
   sobre `processo_modulos.config`. Formato: `{ "<module_key>": { "<opcao>": <valor> } }`.

**É o Template que torna o motor adaptável** (seção 0): "Obra", "Casa", "Contas a
pagar", "Leilão" são cada um um registro de `processo_templates` com um conjunto
diferente de módulos ligados.

---

## 5. Caixa de Entrada — o núcleo do fluxo

Módulo `caixa_entrada` (tabela `processo_caixa_entrada`), ligado por padrão.

É **onde a realidade bruta entra** no Processo — texto, imagem, documento, áudio —
sem organização prévia. O princípio é *"o usuário despeja a realidade e o sistema
trabalha por baixo"*. A triagem transforma uma entrada em **Tarefa por referência**,
não por cópia: `tarefas.origem_entrada_id → processo_caixa_entrada.id`. A entrada
continua sendo a fonte da verdade do que foi dito (append-only); a tarefa carrega a
ação derivada.

---

## 6. Contrato público do Motor

Fonte de verdade: `lib/processo/actions/processo-actions.ts` + `lib/processo/index.ts`.

**Única porta de entrada:** `import { criarProcesso, PROCESSO_MODULES, ... } from '@/lib/processo'`.
UI, API e Luiza chamam **só as Actions** — nunca o Service nem o Repository direto.
Um módulo **não grava na tabela de outro módulo**; todo registro operacional carrega
`processo_id` como contexto canônico.

```
UI / API / Luiza  →  Action (contrato público)  →  Service  →  Repository  →  tabela(s)
```

Actions disponíveis: `criarProcesso`, `obterProcesso`, `listarProcessos`,
`atualizarDadosProcesso`, `alterarStatusProcesso`, `habilitarModulo`,
`desabilitarModulo`, `listarModulosDoProcesso`, `definirConfigModulo`,
`listarModulosDisponiveis`, grupos (`listarGrupos`, `criarGrupo`, `agruparProcessos`),
`duplicarProcesso`, `excluirProcesso`, uso (`registrarUso`, `listarUso`), templates
(`listarTemplates`, `criarTemplate`, `atualizarTemplate`, `excluirTemplate`).

---

## 7. Três eixos independentes (regra de ouro dos indicadores)

Nunca misturar nem derivar um do outro:

1. **Avanço físico** — execução real. Fonte: medições, quantidades executadas,
   etapas/subetapas. **Nunca derivar de pagamento.**
2. **Avanço financeiro** — desembolso/custo realizado. Fonte: compras, materiais,
   mão de obra, serviços. Pode ser comparado ao orçamento, mas é indicador próprio.
3. **Financiamento** — fonte/liberação/reembolso de recursos (contrato, liberações,
   FGTS, recursos próprios). **Não confundir com custo executado.**

Dashboard e relatórios tratam os três como séries independentes, ainda que
comparáveis numa mesma visão.

---

## 8. Stack & estrutura

- **Next.js 16** (App Router) + **React 19** + **Supabase** (PostgreSQL 17) +
  **Tailwind** + **TypeScript**.
- ⚠️ Next 16 tem breaking changes — ver `node_modules/next/dist/docs/` antes de
  escrever código (regra do `AGENTS.md`).

```
app/            rotas (App Router). (app)/ = área logada; api/ = route handlers
components/     UI (components/ui/ = kit de sistema — ver seção 10)
lib/            domínios: processo, caixa-entrada, investidor, orcamento,
                organizacao, portal, dashboard, auth, pdf, settings, supabase, data
supabase/       migrations/ (fonte canônica do schema), seed, config
```

Domínios em `lib/` hoje: `processo` (o motor), `caixa-entrada`, `investidor`,
`orcamento`, `organizacao`, `portal`, `dashboard`, `auth`, `pdf`, `settings`,
`supabase`, `data`.

---

## 9. Banco de dados

- **Fonte canônica do schema = as migrations** (`supabase/migrations/`,
  incrementais e reversíveis). **Não** existe mais um `schema.sql` único como verdade.
- **Multi-organização com RLS.** Toda tabela operacional é isolada por organização
  via funções `current_organization_id()` / `current_profile_id()` e políticas
  `to authenticated`.
- **SQL / migrations — depende da FASE:**
  - **Fase ATUAL (teste/dev, sem dados reais):** aplicar SQL/migrations **direto no banco**
    (via MCP Supabase) é **permitido** para agilidade — de preferência idempotente,
    reversível e verificado. Sempre gravar a migration no repo (`supabase/migrations/`)
    como espelho.
  - **PRODUÇÃO (futuro — regra do dev, SPEC V0-09):** migrations versionadas, fluxo
    **preview → merge → produção**, **sem SQL livre** e sem IA com acesso direto
    irrestrito ao banco. Schema = **alto risco**.
  *(A regra "sem SQL livre" da SPEC V0-09 é da era de produção; não vale na fase de teste atual.)*

---

## 10. UI — disciplina de componentes

Antes de criar qualquer elemento (botão, campo, seletor, modal, card, badge de
status, cabeçalho, filtro), **verificar `components/ui/` primeiro**:

1. Já existe → usa (não recria estilo inline).
2. Não existe mas é reaproveitável → extrai para `components/ui/`.
3. Genuinamente específico de uma tela → fica local.

Kit atual: `Button`, `Input`/`Select`/`Textarea`, `Badge`, `Modal`, `EmptyState`,
`InsightCard` (`MetricCard`/`StatusItemCard`), `PageHeader`, `SearchInput`,
`FilterTabs`. Classes globais reaproveitáveis em `app/globals.css`: `.card`,
`.input-base`. Tema claro/escuro via CSS custom properties (`var(--bg-card)`,
`var(--accent)` = `#3B7BF8`, etc.).

---

## 11. Rotas canônicas

`/processos` · `/processos/novo` · `/processos/[id]` (módulos abaixo do contexto do
Processo). `/obras` e `/projetos` **não devem ser caminhos de criação de novas raízes**.

---

## 12. Legado em absorção

- Não transformar `projetos.id` nem `obras.id` em Processo disfarçado.
- Features novas **nunca** gravam direto por `obra_id` / `projeto_id` — usam
  `processo_id`.
- Capacidades presas a `obra_id`/`projeto_id` migram para `processo_id` por etapas,
  com teste. Legado só é removido depois de substituído e provado sem dependências.

---

## 13. Pirâmide de documentação canônica

```
AGENTS.md / CLAUDE.md   → COMO trabalhar (governança, gates, pacote funcional)
ARQUITETURA.md (este)   → O QUE o sistema é (motor de processos, módulos, contratos)
HANDOFF_BUILDSMART.md   → estado da última entrega (atualizar, nunca duplicar)
SETUP.md / README.md    → como rodar
ROADMAP.md              → próximos passos de implementação (o alvo + a fila)
docs/historico/         → relatórios de rodada, auditorias e planos antigos (consulta)
```

---

## 14. Glossário canônico (fonte única de vocabulário)

Vocabulário oficial do projeto. Usado por pessoas e por qualquer IA que trabalhe aqui,
para falar a mesma língua. A analogia de origem é o **SketchUp** (componente × grupo):

- **Componente** (SketchUp: editou um, mudam todos) → **componente reutilizável /
  compartilhado**, regido por **fonte única da verdade** (*Single Source of Truth*) e
  **DRY** (*Don't Repeat Yourself*).
- **Grupo** (SketchUp: cópia independente) → **duplicação de código** (anti-padrão a
  evitar; apelido informal "copy-paste" / "reinventar a roda").

| Termo leigo (SketchUp) | Nome real na programação | Significado |
|---|---|---|
| "editou um, muda tudo" | **Fonte única da verdade** / **DRY** | UM lugar canônico; mudou lá, mudou em todos |
| "componentes aninhados" | **Composição** (*composition*) | Montar telas combinando componentes dentro de componentes |
| "a casca é a mesma, o conteúdo muda" | **Render prop** / componente **headless** / **props** | Estrutura reutilizável; o conteúdo específico entra por fora |
| "a peça base" | **Primitiva de UI / componente genérico** | Tijolo reutilizável sem regra de negócio (ex.: `HierarchyTree`, `SortableList`) |
| "o kit de peças" | **Design System** (`components/ui/`) | Biblioteca oficial de componentes |
| "fez de novo / cópia" | **Duplicação de código** | O erro a evitar (ex.: as 3 `VisaoGeral` separadas) |

**Regra prática (repetir em qualquer instrução):** *"Reusa o componente compartilhado
— não duplica. Tem que ser fonte única da verdade (DRY). Compõe passando as partes
específicas por props/render-prop. Antes de criar qualquer coisa, confere o
`components/ui/` primeiro."*

Primitivas compartilhadas já em uso: `HierarchyTree` (árvore/EAP), `SortableList`
(arraste), `ComboboxCriavel`, `SearchInput`, `Input`/`Select`/`Textarea`, `Modal`,
`EmptyState`, `PageHeader`, `StatusBadge`. Regra: **repetiu em 2 lugares → vira
componente compartilhado.**

---

## 15. Harness e qualidade (gate de merge)

> Fonte canônica: **"SPEC V0 — 09 Harness e Qualidade"** do dev (Drive `00 - CENTRAL`),
> mais a série SPEC V0 / Arquitetura V0 / Constituição de Engenharia. Toda IA de código
> (Claude e Codex) segue este harness.
>
> **Fase atual (teste):** o harness é o **padrão-alvo de produção**. Na fase de teste, a
> aplicação ao banco é mais livre (ver §9); os gates de qualidade (TS, lint, testes,
> build, isolamento/RLS) seguem valendo como boa prática.

- **GitHub é a fonte canônica do código.** `main` = estável; trabalho em branches;
  migrations versionadas no repo; dev/preview/produção separados; **zero secret** no
  código ou no Git.
- **Antes de alterar:** ler a SPEC/doc aplicável, conferir o código existente, declarar o
  que vai mudar, **não ampliar escopo sem aprovação**.
- **Ciclo obrigatório:** `SPEC → implementação → testes → relatório → revisão`.
- **Gate de PASS para merge** (falhou um item, não passa): SPEC atendida · TypeScript OK ·
  lint OK · testes OK · build OK · isolamento multi-org (RLS) OK · segurança OK ·
  **preview validado**. *Nada é "pronto" só por estar codificado — tem que estar
  especificado, testado, revisado, isolado e validado em preview.*
- **Testes mínimos:** regras de domínio · permissões · isolamento entre organizações /
  RLS · IA sem acesso cruzado entre tenants · cálculos financeiros · claro/escuro ·
  mobile e desktop · fluxo principal da operação.
- **Segurança:** auth real · RLS ativa · menor privilégio · secrets em env · logs sem
  tokens/dados sensíveis · **nenhuma IA com acesso direto irrestrito ao banco, sem SQL
  livre** (ver §9).
- **Frontend aprovado é protegido:** não redesenhar telas sem necessidade; preservar
  linguagem visual, responsividade e componentes compartilhados (§10 e §14).
- **Ao fim de cada rodada, registrar:** o que foi feito, arquivos alterados, migrations,
  testes executados, resultado do build, pendências e riscos (vai no `HANDOFF_BUILDSMART.md`).

---

## 16. Era anterior × regra atual (desembaraçando o canônico)

Os docs do dev no Drive têm **duas eras**. **Em conflito, a regra ATUAL prevalece.**

| Tema | Regra ANTERIOR (superada) | Regra ATUAL (vale) |
|---|---|---|
| Apps | 3–4 apps separados (obra, casa, leilão) | **Um motor único** (Processo), ainda mais versátil; cada uso é um template |
| Raiz | "Projeto central" (Arquitetura V0) | **Processo** é a raiz (Motor de Processo, P2/P3) |
| Componentes | estilo duplicado por tela | **Componentes compartilhados / render-prop** (§14) |
| SQL / banco | sem SQL livre (era de produção) | **SQL direto permitido na fase de teste** (§9) |
| Orçamento | módulo preso à obra | motor fará o **orçamento genérico** (civil e além) como capacidade do Processo |

Os 3–4 apps antigos continuam no GitHub como **legado já auditado**, a serem **absorvidos**
pelo motor — nunca ressuscitados como raízes concorrentes.

---

## 17. Governança e autoridade (quem faz o quê)

- **Autoridade canônica:** as regras **desta fase** (este conjunto de docs do repo —
  `ARQUITETURA.md`, `ROADMAP.md`, `AGENTS.md`) são o que **vale**. Os docs do dev no
  Drive (`00 - CENTRAL`) são **referência fundacional**; onde conflitarem com as regras
  atuais, **as atuais prevalecem**.
- **Quem constrói:** **Claude executa** a implementação; **GPT apoia** (coordenação,
  revisão de código e de canonicidade).
- **Visão/produto:** do usuário (Luiz) — define o alvo e verifica alinhamento; delega o "como".
- **Gate de segurança:** o **dev faz a verificação de segurança no final**, antes de
  iniciarmos os testes. Até lá, não é bloqueio de cada passo.

---

## 18. Padrão de módulo (a "casa" de cada módulo)

**Meta: uma casa por módulo.** Hoje os módulos estão **fragmentados** (ex.: Orçamento em
4 lugares — `lib/processo/orcamento.ts` + `lib/orcamento/` + `components/processo/orcamento/`
+ `components/obra/ObraOrcamento.tsx`) e o motor está **contaminado** com arquivos de
módulo vazados (`eap.ts`, `orcamento.ts`, `caixa-entrada.ts`, `clientes.ts`, `planta-baixa.ts`).
O padrão reúne cada módulo num lugar só e deixa o motor fininho.

Estrutura canônica de um módulo `<m>` (segue a convenção que o projeto **já usa** — sem
inventar uma árvore `lib/modules/` nova; respeita "não reorganizar tudo por hipótese"):

    lib/<m>/                 → o cérebro do módulo (tipos, lógica, acesso a dados)
       actions.ts           → contrato público (a ÚNICA porta; UI/IA/API chamam só isto)
    components/processo/<m>/ → as telas do módulo (compondo HierarchyTree, Button, Modal…)
    supabase/migrations/…    → tabelas do módulo (sempre com processo_id)

Regras:
- Um módulo **nunca importa a entranha de outro** — só fala via `processo_id` / contrato.
- O motor (`lib/processo/`) fica só com o núcleo (`domain/ actions/ service/ repository/
  index/ context`); arquivos de módulo que vazaram pra lá (`eap.ts`, `caixa-entrada.ts`,
  `clientes.ts`, `planta-baixa.ts`) migram para `lib/<m>/`.
- **Adicionar** módulo = pasta `lib/<m>/` + migration + linha no registry. **Remover** =
  apaga a pasta + tira do registry. Nada mais quebra.
- A migração é **organizacional** (mover/reunir, não reescrever), **tela a tela**, com
  teste, sem quebrar o app rodando.
- **Piloto: Orçamento** — cérebro consolidado em `lib/orcamento/` (✅ `orcamento.ts` do
  motor → `lib/orcamento/processo.ts`); telas em `components/processo/orcamento/`.
