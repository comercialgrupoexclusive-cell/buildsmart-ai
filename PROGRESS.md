# BuildSmart AI — Progresso do Desenvolvimento

> Última atualização: 05/06/2026  
> Status geral: **MVP funcional — aguardando configuração do Supabase**

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
