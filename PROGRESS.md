# BuildSmart AI — Progresso do Desenvolvimento

> Última atualização: 06/06/2026  
> Status geral: **MVP funcional — schema do Supabase com DRIFT conhecido (ver seção "⚠️ Schema Drift" abaixo)**

---

## 🗓️ Sessão 06/06/2026 — Correção da tela de Orçamento + limpeza de dados de teste

### Bug crítico corrigido: composições/insumos não apareciam no Orçamento
A query de `loadItens` em `components/obra/ObraOrcamento.tsx` fazia embed de uma
relação **inexistente** `composicao_itens(*)`. O nome real da tabela no banco é
`composicao_insumos`. Isso fazia o PostgREST devolver erro `PGRST200` e a query
inteira falhava silenciosamente — resultado: toda obra mostrava "0 composições" /
"R$ 0,00", inclusive a obra de teste recém-criada.

**Correção aplicada** (linhas ~205, ~217, ~248-258):
- `composicoes_proprias(..., composicao_insumos(*))` no lugar de `composicao_itens(*)`
- Mapeamento `composicao_itens: cp?.composicao_insumos || []` para preservar o nome
  interno usado pelo restante do componente (`getItemTotal`, `custoPorCategoria` etc.)

### Segundo bug corrigido: preço de composições SINAPI não aparecia
A mesma query também fazia embed de `sinapi_composicoes(..., custos)`. A coluna
`custos` (JSONB por UF) **não existe** na tabela real — a coluna real é
`custo_unitario` (número simples, sem variação por UF). Corrigido o `select` para
usar `custo_unitario`, e `getItemCost()` agora também lê esse campo como fallback:
```ts
const getItemCost = (item: { custo_calculado?: number; custos?: Record<string, number>; custo_unitario?: number }) =>
  item.custos?.[obraUf] || item.custo_unitario || item.custo_calculado || 0
```

### ⚠️ Schema Drift — divergência entre `supabase/schema.sql` e o banco real
Durante a investigação, ficou confirmado que o banco Supabase em produção foi
criado a partir de uma versão **mais antiga** do `schema.sql` (lembrando que
`CREATE TABLE IF NOT EXISTS` não aplica colunas novas em tabelas já existentes).
Tabelas afetadas:

| Tabela | Coluna esperada pelo código/`schema.sql` | Realidade no banco |
|---|---|---|
| `obras` | `area_m2 NUMERIC`, `uf CHAR(2)` | **não existem** (insert falha com `42703`) |
| `sinapi_insumos` | `precos JSONB` (mapa por UF), `classificacao`, `origem_preco` | tem `preco_unitario NUMERIC`, `estado`, `categoria` (formato antigo, plano) |
| `sinapi_composicoes` | `custos JSONB`, `situacao`, `mes_referencia` | tem `custo_unitario NUMERIC`, `grupo` (formato antigo, plano) |
| `sinapi_composicao_itens` | tabela inteira | **não existe** |

**Impacto prático:**
- O modal "Nova Obra" tenta salvar `area_m2`/`uf` e o insert falha silenciosamente
  para essas colunas (a obra é criada sem elas).
- `ObraOrcamento` monta um mapa `sinapiInsumoMap` esperando `{classificacao, precos[uf]}`
  de `sinapi_insumos` — como essas colunas não existem, a query auxiliar volta vazia
  e os cards "Custo Material"/"Mão de Obra" ficam zerados (tudo cai em "outros"),
  mesmo quando a composição tem insumos linkados com preço.
- A página **Serviços** (`composicoes_proprias`) calcula `custoTotal` usando
  `sinapi_insumos.precos[uf]` e `classificacao` — por isso aparecem composições
  "sem valor": **não são resquícios de importação**, são composições que (a) não têm
  nenhum `composicao_insumos` vinculado (a maioria dos códigos `1000`...`19001` etc.,
  importados de uma planilha sem o detalhamento analítico) ou (b) têm insumos
  vinculados mas o cálculo de preço depende de colunas que não existem no banco.

**Migração proposta (requer Supabase SQL Editor — não pode ser rodada via REST com a
chave `anon`, é necessário `service_role` ou o painel do Supabase):**
```sql
ALTER TABLE obras ADD COLUMN IF NOT EXISTS area_m2 NUMERIC(10,2);
ALTER TABLE obras ADD COLUMN IF NOT EXISTS uf CHAR(2) NOT NULL DEFAULT 'SP';

ALTER TABLE sinapi_insumos ADD COLUMN IF NOT EXISTS precos JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sinapi_insumos ADD COLUMN IF NOT EXISTS classificacao TEXT NOT NULL DEFAULT 'MATERIAL';
ALTER TABLE sinapi_insumos ADD COLUMN IF NOT EXISTS origem_preco TEXT;
-- migrar dados antigos pro novo formato:
UPDATE sinapi_insumos SET precos = jsonb_build_object(estado, preco_unitario) WHERE precos = '{}';
UPDATE sinapi_insumos SET classificacao = categoria WHERE categoria IS NOT NULL;

ALTER TABLE sinapi_composicoes ADD COLUMN IF NOT EXISTS custos JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sinapi_composicoes ADD COLUMN IF NOT EXISTS situacao TEXT NOT NULL DEFAULT 'COM CUSTO';
ALTER TABLE sinapi_composicoes ADD COLUMN IF NOT EXISTS mes_referencia TEXT;
UPDATE sinapi_composicoes SET custos = jsonb_build_object('SP', custo_unitario) WHERE custos = '{}';

CREATE TABLE IF NOT EXISTS sinapi_composicao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_codigo TEXT NOT NULL,
  mes_referencia TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('INSUMO', 'COMPOSICAO')),
  item_codigo TEXT NOT NULL,
  item_descricao TEXT NOT NULL,
  item_unidade TEXT NOT NULL DEFAULT 'UN',
  coeficiente NUMERIC(14,6) NOT NULL DEFAULT 1,
  situacao TEXT NOT NULL DEFAULT 'COM PREÇO'
);
```
> Até essa migração ser aplicada, o sistema funciona em "modo degradado": os preços
> caem no fallback `custo_unitario`/`preco_unitario` (sem variação por UF) e a
> categorização Material/Mão de obra/Equipamento não fica 100% precisa nos cards
> de KPI (cai tudo em "outros" quando o `sinapiInsumoMap` vem vazio).

### Dados de teste populados (schema REAL, sem precisar da migração)
Para o usuário testar o fluxo "composição → insumos → custo no orçamento":

**`composicoes_proprias` + `composicao_insumos`** (linkados a `sinapi_insumos` reais):
- `CP-001` — Fundação em concreto armado FCK 25 MPa (M3): cimento 320kg, areia 0,5m³,
  brita 0,8m³, aço CA-50 80kg, pedreiro 1,2h, servente 2,0h
- `CP-003` — Reboco interno argamassa industrializada (M2): argamassa colante 0,3un,
  pedreiro 0,5h, servente 0,5h

**`sinapi_composicoes`** (2 linhas no formato real — `custo_unitario` plano, sem JSONB):
- `92269` — Alvenaria de vedação blocos cerâmicos 9x19x39cm e=9cm (M2) — R$ 62,30
- `88309` — Execução de passeio/piso em concreto usinado e=8cm (M2) — R$ 74,85

### Limpeza de dados
Removidas as obras de teste antigas "casa 42m²" e "residência 1" (e seus orçamentos/
etapas/itens em cascata via `ON DELETE CASCADE`). Restou apenas:
- `Obra Teste - Simulacao` (`814d5a73-6d7c-40cf-ac9d-c608e9027bf4`) — obra de
  referência para validar o fluxo de orçamento.

---

## ✅ O que foi implementado

### Infraestrutura & Setup
- [x] Projeto Next.js 16 (App Router) com TypeScript
- [x] Tailwind CSS v4 configurado
- [x] Dependências instaladas: `@supabase/supabase-js`, `@supabase/ssr`, `lucide-react`, `recharts`, `@anthropic-ai/sdk`, `clsx`
- [x] Design system completo (`globals.css`) com CSS custom properties:
  - Paleta dark mode (padrão) + light mode alternável por `[data-theme="light"]`
  - Fontes: DM Serif Display (títulos), DM Sans (corpo), JetBrains Mono (códigos SINAPI)
  - Componentes CSS base: `.card`, `.btn-primary`, `.input-base`, `.animate-enter`, `.table-zebra`
- [x] Supabase clients configurados (browser + server SSR)
- [x] TypeScript types completos para todas as entidades (`lib/types.ts`)
- [x] Utilitários: `formatCurrency`, `formatDate`, `diasAteData`, mapeamentos de status (`lib/utils.ts`)
- [x] Contexto global de perfil com persistência em `localStorage` (`lib/profile-context.tsx`)
- [x] Build de produção funcionando sem erros TypeScript
- [x] Repositório Git inicializado com primeiro commit

### Componentes UI Reutilizáveis (`components/ui/`)
- [x] `Button.tsx` — variantes: primary, secondary, ghost, danger; tamanhos: sm, md, lg; estado loading
- [x] `Input.tsx` — Input, Select, Textarea com label, error, hint
- [x] `Modal.tsx` — overlay com backdrop, fechar por ESC ou clique fora, tamanhos configuráveis
- [x] `Badge.tsx` — variantes de cor: default, success, warning, danger, info
- [x] `EmptyState.tsx` — estado vazio com ícone, título, descrição e ação opcional

### Layout Global (`components/layout/`)
- [x] `Sidebar.tsx` — menu fixo lateral com 5 itens, logo, item ativo destacado em accent
- [x] `Header.tsx` — título da página, botão dark/light mode, avatar do perfil clicável (troca de perfil)
- [x] `AppLayout.tsx` — wrapper com redirect para `/` se não houver perfil logado

### Telas Implementadas

#### Página inicial — Seleção de Perfis (`app/page.tsx`)
- [x] Grid de cards de perfil com avatar (foto ou inicial colorida)
- [x] Clique no card → entra no sistema (direto ao dashboard ou onboarding)
- [x] Hover mostra botões de editar e remover perfil
- [x] Modal inline para criar/editar perfil: nome, cor de destaque (8 opções), toggle dark mode
- [x] Botão "Novo perfil" com ícone "+"

#### Onboarding (`app/onboarding/page.tsx`)
- [x] Exibido apenas na primeira entrada do perfil
- [x] 3 cards explicativos: Obras, Controle Preditivo, BuildAssist IA
- [x] Checkbox "Não exibir novamente" (marca `onboarding_done = true` no banco)
- [x] Botão "Começar a usar" → redireciona para `/dashboard`

#### Dashboard (`app/(app)/dashboard/page.tsx`)
- [x] 3 KPI cards: Obras Ativas, Orçamentos em Andamento, Alertas do Dia
- [x] Gráfico Recharts `AreaChart` — Consumo vs Estoque (15 dias) com gradientes
- [x] Painel "Próximos 7 dias" — etapas críticas com contador de dias colorido
- [x] Card de alertas de materiais pendentes (borda laranja, ícone alerta)
- [x] Card de obras recentes com link para cada uma
- [x] Loading state (spinner centralizado)

#### Obras — Lista (`app/(app)/obras/page.tsx`)
- [x] Grid responsivo de cards com foto, nome, endereço, status badge, data previsão
- [x] Filtros por status (todas/ativa/orçamento/concluída/paralisada)
- [x] Busca por nome/endereço com debounce visual
- [x] Modal "Nova Obra": nome, endereço, responsável, data início, previsão, URL da foto
- [x] Ao criar obra: gera orçamento executivo vinculado automaticamente (versão 1, rascunho)
- [x] Redirect automático para a página interna após criar

#### Obra — Detalhe (`app/(app)/obras/[id]/page.tsx`)
- [x] Header da obra com foto, nome, endereço, responsável, previsão
- [x] Dropdown de status inline (muda status no banco ao selecionar)
- [x] 5 tabs: Visão Geral, Orçamento, Cronograma, Materiais, Medições
- [x] Breadcrumb "← Obras"

#### Tab: Orçamento (`components/obra/ObraOrcamento.tsx`)
- [x] Carrega orçamento executivo mais recente da obra
- [x] Tabela com: Código | Descrição | Unid. | Qtd. | Unitário | Total
- [x] BDI editável com atualização no banco ao perder foco
- [x] Rodapé: Subtotal | BDI | **Total Geral** em destaque (accent)
- [x] Botão "Adicionar item": modal com busca de composições próprias, seleção e quantidade
- [x] Preço unitário calculado dinamicamente (Σ coeficiente × preço SINAPI)
- [x] Botão "Finalizar" → congela valores, muda status para `finalizado`, tela somente leitura
- [x] Botão "Reabrir" → cria nova versão (v2, v3...) copiando itens da versão anterior
- [x] Botão de remover item (lixeira) apenas em orçamentos não finalizados

#### Tab: Cronograma (`components/obra/ObraCronograma.tsx`)
- [x] Linha do tempo visual dos próximos 30 dias com borda accent nos críticos
- [x] Ícone de alerta para etapas com início ≤ 7 dias
- [x] Tabela completa de todas as etapas com dropdown de status inline
- [x] Modal "Nova Etapa": nome, data início, data fim, status inicial
- [x] Ordem automática (max + 1)

#### Tab: Materiais (`components/obra/ObraMateriais.tsx`)
- [x] Tabela: Status emoji | Insumo | Etapa | Qtd Total | Comprado | Falta | Data Necessidade | Ação
- [x] Filtro por etapa (botões pill)
- [x] Banner de alerta se houver materiais pendentes
- [x] Alerta inline para datas de necessidade urgentes (≤ 7 dias)
- [x] Botão "Comprado" inline → atualiza `status_compra` e `quantidade_comprada` no banco

#### Tab: Medições (`components/obra/ObraMedicoes.tsx`)
- [x] Painel esquerdo: barras de progresso por etapa (cor varia por %)
- [x] Painel direito: histórico de medições com período e observação
- [x] Modal "Nova Medição": etapa (opcional), período início/fim, percentual, observação
- [x] Progresso calculado pela última medição de cada etapa

#### Base SINAPI (`app/(app)/sinapi/page.tsx`)
- [x] **Aba Insumos SINAPI**: tabela paginada (50/página), busca por código/descrição com debounce, filtro por categoria
- [x] Exibe: código (fonte mono), descrição, unidade, preço (verde), categoria badge, mês de referência
- [x] Paginação com botões Anterior/Próxima
- [x] **Aba Composições Próprias**: listagem com código auto-sequencial (COMP-001...), custo calculado em tempo real
- [x] Modal "Nova Composição": descrição, unidade, grupo
- [x] Modal "Adicionar insumo": busca SINAPI, seleção, coeficiente → calcula custo automaticamente
- [x] Exibe insumos de cada composição com coeficiente e custo parcial
- [x] Botão remover composição com confirmação

#### BuildAssist IA (`app/(app)/buildassist/page.tsx`)
- [x] Interface de chat com histórico de mensagens e scroll automático
- [x] Mensagem de abertura proativa contextual (etapas próximas + materiais pendentes)
- [x] Painel direito com 3 cards de insights automáticos (Suprimentos, Equipe, Clima)
- [x] Clicar no insight preenche o input com a pergunta
- [x] Integração com Claude API via route `/api/buildassist`
- [x] System prompt com contexto injetado: obras, etapas próximas, materiais pendentes
- [x] Estado de loading (spinner), botão "Nova conversa"
- [x] Formatação de markdown básica (negrito, itálico, quebras de linha)

#### Configurações (`app/(app)/configuracoes/page.tsx`)
- [x] Edição de nome do perfil com save no banco
- [x] Seleção de cor de destaque (8 opções, aplica em tempo real via CSS var)
- [x] Toggle dark/light mode com switch visual animado
- [x] Painel de integrações: Supabase, Claude API, OpenWeather (status)
- [x] Info sobre como configurar `.env.local`

### Backend & API
- [x] `/api/buildassist` — Route handler que injeta contexto de obras e chama Claude API
- [x] Schema SQL completo (`supabase/schema.sql`) com todas as tabelas, índices e constraints
- [x] Dados de exemplo SINAPI para desenvolvimento (`supabase/schema.sql` — INSERT ao final)
- [x] Seed SQL opcional (`supabase/seed.sql`) com perfil e obra de exemplo

---

## 🔄 O que estava em andamento no momento do save

- **Verificação visual do UI**: o servidor dev estava rodando em `localhost:3001` mas o preview do Chrome não estava conectado — a interface não foi visualizada após o build. O build de produção passou sem erros TypeScript.
- **Push para GitHub**: o repositório GitHub ainda não foi criado/conectado. O git local tem 1 commit (`18cea1e`). O remote precisa ser configurado.

---

## ⏳ Próximos passos pendentes

### Configuração obrigatória (fora do código)
- [ ] Criar repositório `buildsmart-ai` no GitHub
- [ ] `git remote add origin <url>` + `git push -u origin main`
- [ ] Criar projeto no [Supabase](https://supabase.com)
- [ ] Executar `supabase/schema.sql` no SQL Editor do Supabase
- [ ] Preencher `.env.local` com URL/chave Supabase + chave Anthropic API

### Módulos pendentes (do roadmap original)
- [ ] **Orçamento Paramétrico (EVF)** — formulário: área m², padrão (simples/médio/alto), localização, tipologia → estimativa com variação ±15%
- [ ] **Relatórios & BI** — tela com métricas de desempenho, gráfico de produtividade, previsão de conclusão, botão "Gerar PDF Executivo"
- [ ] **Upload de foto** — atualmente só aceita URL de imagem. Implementar upload real para Supabase Storage
- [ ] **Integração OpenWeather** — alertas climáticos no BuildAssist (card "CLIMA" no painel de insights)
- [ ] **Geração de lista de compras** — BuildAssist gerar automaticamente lista de compras formatada
- [ ] **Exportar orçamento para Excel** — botão "Exportar SINAPI (Excel)"
- [ ] **Importação SINAPI real** — atualmente há 15 registros de exemplo. Implementar importação de planilha SINAPI oficial (XLSX mensal da Caixa)
- [ ] **Alerta preditivo automático** — job ou webhook para verificar diariamente etapas ≤ 7 dias com materiais pendentes (atualmente verificado apenas ao abrir o dashboard)
- [ ] **Etapas vinculadas ao orçamento** — ao criar etapa, poder vincular composições do orçamento para gerar materiais automaticamente

### Melhorias identificadas
- [ ] Validação de formulários mais robusta (react-hook-form ou similar)
- [ ] Toast de feedback nas ações (salvar, deletar, etc.)
- [ ] Tratamento de erro global (sem Supabase configurado)
- [ ] Responsive mobile testado e ajustado
- [ ] Paginação no gráfico de tendências (dados reais do banco)
- [ ] Modo offline / fallback quando Supabase estiver indisponível

---

## 🗒️ Decisões importantes registradas

| Decisão | Motivo |
|---------|--------|
| Multi-perfil sem autenticação (MVP) | Simplifica o MVP, evita configuração de Auth Supabase. Fácil de adicionar autenticação depois. |
| `dynamic = 'force-dynamic'` no layout e páginas principais | Necessário porque o Supabase client não pode ser instanciado durante prerender estático sem env vars válidas |
| Preço dinâmico calculado no frontend via join | O campo `custo_calculado` não existe no banco — é calculado via Σ(coeficiente × preco_sinapi) em tempo real |
| CSS custom properties ao invés de Tailwind classes para o tema | Permite dark/light mode via `[data-theme]` sem duplicar classes. Mais fácil de personalizar por perfil |
| Supabase client com fallback de URL | `client.ts` usa `|| 'https://placeholder.supabase.co'` para não quebrar o build de produção sem env vars |
| Route group `(app)` para layout protegido | Separa as páginas públicas (/, /onboarding) das páginas que requerem perfil logado |
| Composições próprias com código auto-sequencial | `COMP-001`, `COMP-002`... gerado via `COUNT(*)` — simples e legível para o usuário |

---

## 📁 Estrutura de arquivos

```
buildsmart-ai/
├── app/
│   ├── (app)/                    # Páginas protegidas (requerem perfil)
│   │   ├── layout.tsx            # Wrapper com ProfileProvider + AppLayout
│   │   ├── buildassist/page.tsx  # Chat IA
│   │   ├── configuracoes/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── obras/page.tsx        # Lista de obras
│   │   └── obras/[id]/page.tsx   # Detalhe com 5 tabs
│   │   └── sinapi/page.tsx
│   ├── api/buildassist/route.ts  # Claude API route handler
│   ├── onboarding/page.tsx
│   ├── globals.css               # Design system completo
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Seleção de perfis
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx         # Container com sidebar + header
│   │   ├── Header.tsx            # Topo: título + avatar + dark mode
│   │   └── Sidebar.tsx           # Menu lateral fixo
│   ├── obra/
│   │   ├── ObraCronograma.tsx    # Tab cronograma
│   │   ├── ObraMateriais.tsx     # Tab materiais
│   │   ├── ObraMedicoes.tsx      # Tab medições
│   │   └── ObraOrcamento.tsx     # Tab orçamento executivo
│   └── ui/
│       ├── Badge.tsx
│       ├── Button.tsx
│       ├── EmptyState.tsx
│       ├── Input.tsx             # Input, Select, Textarea
│       └── Modal.tsx
├── lib/
│   ├── profile-context.tsx       # Estado global do perfil logado
│   ├── supabase/
│   │   ├── client.ts             # Browser client (com fallback)
│   │   └── server.ts             # Server client (SSR/Route handlers)
│   ├── types.ts                  # Todos os tipos TypeScript
│   └── utils.ts                  # Formatadores, constantes de status
├── supabase/
│   ├── schema.sql                # Schema completo + dados SINAPI de exemplo
│   └── seed.sql                  # Dados opcionais de teste
├── .env.example                  # Template de variáveis de ambiente
├── .env.local                    # Variáveis locais (NÃO vai para o git)
├── next.config.ts
├── package.json
├── SETUP.md                      # Guia de setup completo
└── PROGRESS.md                   # Este arquivo
```
