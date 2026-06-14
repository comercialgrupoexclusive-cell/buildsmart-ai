# SYSTEM_CONTEXT.md — BuildSmart AI

> Gerado em: 14/06/2026  
> Versão do app: 1.2.0 (`lib/version.ts`)  
> Status: MVP funcional com schema drift conhecido (ver seção 8)

---

## 1. Stack e Infraestrutura

### Frameworks e runtime
| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 16.2.7 |
| UI | React | 19.2.4 |
| Linguagem | TypeScript | ^5 |
| CSS | Tailwind CSS | ^4 |
| Compilador | SWC | via `@swc/helpers ^0.5.23` |
| Node types | @types/node | ^20 |

### Dependências principais
| Pacote | Uso |
|--------|-----|
| `@supabase/supabase-js ^2.107.0` | Cliente banco de dados e queries |
| `@supabase/ssr ^0.10.3` | Cliente SSR/Route Handlers |
| `openai ^6.42.0` | SDK do modelo de IA (Luizia usa GPT) |
| `@anthropic-ai/sdk ^0.100.1` | Instalado, **não usado no código de produção** [ver nota abaixo] |
| `recharts ^3.8.1` | Gráficos (AreaChart, PieChart, LineChart) |
| `lucide-react ^1.17.0` | Ícones |
| `xlsx ^0.18.5` | Importação/exportação de planilhas SINAPI |
| `clsx ^2.1.1` | Classes CSS condicionais |

> **[NOTA]** `@anthropic-ai/sdk` aparece no `package.json` mas não é importado em nenhum arquivo `.ts` ou `.tsx` de produção. É mencionado apenas na tela de Configurações como texto informativo de status. O AI real (`lib/luizia-core.ts`) usa `openai` SDK.

### Variáveis de ambiente (`.env.example`)
```
NEXT_PUBLIC_DATA_MODE=local          # "local" → localStorage | "remote" → Supabase
NEXT_PUBLIC_SUPABASE_URL=            # URL do projeto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # Chave anônima do Supabase

OPENAI_API_KEY=                      # Chave OpenAI (sk-...) para ativar Luizia
OPENAI_SIMPLE_MODEL=gpt-4o-mini      # Modelo para perguntas simples
OPENAI_COMPLEX_MODEL=gpt-5-mini      # [INCERTO] não existe no código — código aceita apenas gpt-4o ou gpt-4o-mini

OPENWEATHER_API_KEY=                 # Não usado (app usa Open-Meteo, sem chave)

TWILIO_ACCOUNT_SID=                  # Twilio para WhatsApp
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_LUIZIA_WEBHOOK_URL=https://your-vercel-domain.vercel.app/api/whatsapp/luizia
TWILIO_VALIDATE_SIGNATURE=false      # "true" valida HMAC da Twilio
```

### Modo de dados dual
O app opera em dois modos controlados por `NEXT_PUBLIC_DATA_MODE`:
- `local` → usa `lib/data/local-client.ts` (localStorage + `lib/data/local-seed.ts`)
- `remote` → usa Supabase via `lib/supabase/client.ts` e `lib/supabase/server.ts`

O cliente Supabase tem fallback de URL (`|| 'https://placeholder.supabase.co'`) para não quebrar o build sem env vars.

### Configuração Next.js (`next.config.ts`)
```ts
allowedDevOrigins: ["192.168.0.2"]  // origem local autorizada para dev
images.remotePatterns: https://**   // qualquer host HTTPS permitido para imagens
```

---

## 2. Estrutura de Rotas

### Páginas (App Router)

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `app/page.tsx` | Seleção e criação/edição de perfis de usuário |
| `/onboarding` | `app/onboarding/page.tsx` | Tela de boas-vindas exibida apenas na primeira entrada |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | KPIs, gráficos Recharts, alertas de materiais, etapas críticas |
| `/obras` | `app/(app)/obras/page.tsx` | Grid de obras com filtros por status e busca por nome/endereço |
| `/obras/[id]` | `app/(app)/obras/[id]/page.tsx` | Detalhe da obra — 5 tabs: Visão Geral, Orçamento, Cronograma, Materiais, Medições |
| `/orcamentos` | `app/(app)/orcamentos/page.tsx` | Listagem de orçamentos |
| `/materiais` | `app/(app)/materiais/page.tsx` | Estoque e lista de compras global |
| `/medicoes` | `app/(app)/medicoes/page.tsx` | Medições / diário de obra global |
| `/servicos` | `app/(app)/servicos/page.tsx` | Composições próprias e insumos próprios da empresa |
| `/sinapi` | `app/(app)/sinapi/page.tsx` | Upload da base SINAPI (XLSX Caixa) + visualização paginada |
| `/cronograma` | `app/(app)/cronograma/page.tsx` | Cronograma Gantt global |
| `/relatorios` | `app/(app)/relatorios/page.tsx` | Relatórios exportáveis |
| `/buildassist` | `app/(app)/buildassist/page.tsx` | Chat com a IA Luizia — contexto injetado automaticamente |
| `/luizia-monitor` | `app/(app)/luizia-monitor/page.tsx` | Logs de interações com a IA |
| `/configuracoes` | `app/(app)/configuracoes/page.tsx` | Perfil, tema, integrações, backup, etapas padrão, usuários |

**Grupo de rota protegida:** `app/(app)/` — wrapper em `app/(app)/layout.tsx` aplica `AppLayout` e `force-dynamic`. Páginas fora do grupo (`/`, `/onboarding`) são públicas.

### API Routes

| Endpoint | Método | Arquivo | Descrição |
|----------|--------|---------|-----------|
| `/api/buildassist` | POST | `app/api/buildassist/route.ts` | Recebe `{messages, complex?, context?}`, chama `askLuizia()`, retorna `{message, mode, model}` |
| `/api/luizia-monitor` | POST | `app/api/luizia-monitor/route.ts` | Persiste log de interação IA no Supabase ou local |
| `/api/weather` | POST | `app/api/weather/route.ts` | Previsão 7 dias via Open-Meteo. Aceita `{cidade?, estado?, lat?, lon?}`. Fallback offline (27°C, 18°C, 20% chuva) |
| `/api/localidades/municipios` | GET | `app/api/localidades/municipios/route.ts` | Retorna municípios por `?uf=XX` consultando IBGE. Cache 7 dias (`revalidate: 604800`) |
| `/api/whatsapp/luizia` | GET + POST | `app/api/whatsapp/luizia/route.ts` | Webhook Twilio WhatsApp. GET = health check. POST = processa mensagem, responde TwiML XML |

---

## 3. Schema do Banco (Supabase/PostgreSQL)

> Fonte: `supabase/schema.sql` v3 — 06/06/2026  
> **ATENÇÃO:** pode haver drift entre o schema abaixo e o banco em produção (ver seção 8).

### Tabelas

#### `profiles`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| name | TEXT NOT NULL | |
| photo_url | TEXT | |
| theme_color | TEXT NOT NULL | padrão `#3B7BF8` |
| dark_mode | BOOLEAN NOT NULL | padrão `true` |
| onboarding_done | BOOLEAN NOT NULL | padrão `false` |
| password_hash | TEXT | |
| created_at | TIMESTAMPTZ NOT NULL | |

> Os campos `tipo`, `apelido`, `descricao`, `cidade`, `estado` existem no tipo TypeScript (`lib/types.ts`) mas **não estão** no `schema.sql` atual — podem ter sido adicionados via migração ou podem ser campos não persistidos no banco [INCERTO].

#### `sinapi_insumos`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| codigo | TEXT NOT NULL | |
| classificacao | TEXT NOT NULL | SERVIÇOS \| MATERIAL \| MAO_DE_OBRA \| EQUIPAMENTO |
| descricao | TEXT NOT NULL | Índice GIN full-text em português |
| unidade | TEXT NOT NULL | |
| origem_preco | TEXT | C = Coletado \| CR = Coef. Representatividade |
| precos | JSONB NOT NULL | `{"AC": 302.08, "SP": 198.69, ...}` |
| mes_referencia | TEXT NOT NULL | Ex: `"04/2026"` |
| created_at | TIMESTAMPTZ NOT NULL | |
| UNIQUE | (codigo, mes_referencia) | |

#### `sinapi_composicoes`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| codigo | TEXT NOT NULL | |
| grupo | TEXT NOT NULL | padrão `GERAL` |
| descricao | TEXT NOT NULL | |
| unidade | TEXT NOT NULL | |
| situacao | TEXT NOT NULL | COM CUSTO \| SEM CUSTO |
| custos | JSONB NOT NULL | `{"AC": 280.81, "SP": 198.69, ...}` |
| mes_referencia | TEXT NOT NULL | |
| created_at | TIMESTAMPTZ NOT NULL | |
| UNIQUE | (codigo, mes_referencia) | |

#### `sinapi_composicao_itens`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| composicao_codigo | TEXT NOT NULL | FK lógica → sinapi_composicoes.codigo |
| mes_referencia | TEXT NOT NULL | |
| tipo | TEXT NOT NULL | CHECK: INSUMO \| COMPOSICAO |
| item_codigo | TEXT NOT NULL | FK lógica → insumos ou composições |
| item_descricao | TEXT NOT NULL | |
| item_unidade | TEXT NOT NULL | padrão `UN` |
| coeficiente | NUMERIC(14,6) NOT NULL | padrão 1 |
| situacao | TEXT NOT NULL | COM PREÇO |
| UNIQUE | (composicao_codigo, mes_referencia, tipo, item_codigo) | |

#### `composicoes_proprias`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| codigo | TEXT NOT NULL UNIQUE | Ex: `CP-001` |
| descricao | TEXT NOT NULL | |
| unidade | TEXT NOT NULL | padrão `UN` |
| grupo | TEXT NOT NULL | padrão `GERAL` |
| ativo | BOOLEAN NOT NULL | padrão `true` |
| created_at | TIMESTAMPTZ NOT NULL | |

#### `insumos_proprios`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| codigo | TEXT NOT NULL UNIQUE | |
| descricao | TEXT NOT NULL | |
| unidade | TEXT NOT NULL | padrão `UN` |
| categoria | TEXT NOT NULL | MATERIAL \| MAO_DE_OBRA \| EQUIPAMENTO \| SERVICO |
| grupo | TEXT | |
| preco_unitario | NUMERIC(14,4) NOT NULL | padrão 0 |
| ativo | BOOLEAN NOT NULL | padrão `true` |
| created_at | TIMESTAMPTZ NOT NULL | |

#### `composicao_insumos`
Vínculos entre composições próprias e insumos (SINAPI ou próprios).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| composicao_id | UUID NOT NULL | FK → composicoes_proprias(id) CASCADE |
| insumo_id | UUID | FK → sinapi_insumos(id) SET NULL |
| insumo_proprio_id | UUID | FK → insumos_proprios(id) SET NULL |
| coeficiente | NUMERIC(14,6) NOT NULL | padrão 1 |
| created_at | TIMESTAMPTZ NOT NULL | |
| CHECK | insumo_id IS NOT NULL OR insumo_proprio_id IS NOT NULL | obrigatório um dos dois |

#### `obras`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| nome | TEXT NOT NULL | |
| endereco | TEXT NOT NULL | |
| foto_url | TEXT | |
| status | TEXT NOT NULL | CHECK: orcamento \| ativa \| concluida \| paralisada |
| data_inicio | DATE | |
| data_previsao | DATE | |
| responsavel | TEXT | |
| area_m2 | NUMERIC(10,2) | área construída para custo/m² |
| uf | CHAR(2) NOT NULL | padrão `SP` — UF para preços SINAPI |
| created_at | TIMESTAMPTZ NOT NULL | |

#### `orcamentos`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| obra_id | UUID NOT NULL | FK → obras(id) CASCADE |
| tipo | TEXT NOT NULL | executivo \| parametrico |
| bdi_percentual | NUMERIC(5,2) NOT NULL | padrão 25 |
| status | TEXT NOT NULL | rascunho \| ativo \| finalizado |
| versao | INTEGER NOT NULL | padrão 1 |
| created_at | TIMESTAMPTZ NOT NULL | |

#### `etapas`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| obra_id | UUID NOT NULL | FK → obras(id) CASCADE |
| nome | TEXT NOT NULL | |
| data_inicio | DATE | |
| data_fim | DATE | |
| status | TEXT NOT NULL | planejada \| em_andamento \| concluida \| atrasada |
| ordem | INTEGER NOT NULL | padrão 0 |

#### `orcamento_itens`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| orcamento_id | UUID NOT NULL | FK → orcamentos(id) CASCADE |
| etapa_id | UUID | FK → etapas(id) |
| composicao_id | UUID | FK → composicoes_proprias(id) |
| sinapi_composicao_id | UUID | FK → sinapi_composicoes(id) |
| subetapa | TEXT | agrupamento fino dentro da etapa |
| quantidade | NUMERIC(12,4) NOT NULL | padrão 1 |
| preco_unitario_snapshot | NUMERIC(12,4) NOT NULL | padrão 0 |
| descricao_snapshot | TEXT | |
| codigo_snapshot | TEXT | |
| unidade_snapshot | TEXT | |
| updated_at | TIMESTAMPTZ NOT NULL | |

#### `orcamento_item_insumos`
Permite override de quantidade por insumo sem alterar composição base.

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| orcamento_item_id | UUID NOT NULL | FK → orcamento_itens(id) CASCADE |
| sinapi_codigo | TEXT NOT NULL | referência lógica ao insumo SINAPI |
| quantidade_calculada | NUMERIC(12,4) NOT NULL | |
| quantidade_adotada | NUMERIC(12,4) | NULL = usar calculada |
| preco_unitario_snapshot | NUMERIC(12,4) NOT NULL | |
| UNIQUE | (orcamento_item_id, sinapi_codigo) | |

#### `materiais`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| obra_id | UUID NOT NULL | FK → obras(id) CASCADE |
| etapa_id | UUID | FK → etapas(id) |
| subetapa | TEXT | |
| sinapi_codigo | TEXT NOT NULL | referência lógica ao insumo SINAPI |
| descricao | TEXT NOT NULL | snapshot |
| unidade | TEXT NOT NULL | padrão `UN` |
| quantidade_total | NUMERIC(12,4) NOT NULL | |
| quantidade_comprada | NUMERIC(12,4) NOT NULL | |
| status_compra | TEXT NOT NULL | nao_comprado \| parcial \| comprado |
| data_necessidade | DATE | |

#### `medicoes`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| obra_id | UUID NOT NULL | FK → obras(id) CASCADE |
| etapa_id | UUID | FK → etapas(id) |
| periodo_inicio | DATE NOT NULL | |
| periodo_fim | DATE NOT NULL | |
| percentual_executado | NUMERIC(5,2) NOT NULL | |
| observacao | TEXT | |
| created_at | TIMESTAMPTZ NOT NULL | |

> Os campos `nome`, `fotos`, `updated_at` existem no tipo TypeScript `Medicao` (`lib/types.ts`) mas **não estão** no `schema.sql` — possível drift ou adição via migração [INCERTO].

#### `fornecedores`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| obra_id | UUID | FK → obras(id) CASCADE — NULL = fornecedor geral da empresa |
| nome | TEXT NOT NULL | |
| categoria | TEXT NOT NULL | MATERIAL \| MAO_DE_OBRA \| EQUIPAMENTO \| SERVICO \| MISTO |
| contato | TEXT | |
| telefone | TEXT | |
| email | TEXT | |
| observacoes | TEXT | |
| ativo | BOOLEAN NOT NULL | padrão `true` |
| created_at | TIMESTAMPTZ NOT NULL | |

### Índices relevantes
- `sinapi_insumos.descricao` — GIN full-text (`portuguese`)
- `sinapi_insumos(codigo)`, `sinapi_insumos(mes_referencia)`
- `obras(status)`, `obras(uf)`
- `orcamento_itens(orcamento_id)`, `orcamento_itens(etapa_id)`
- `materiais(obra_id)`, `materiais(status_compra)`
- `fornecedores(obra_id)`

---

## 4. Módulos Existentes

| Módulo | Status | Arquivo principal | Observação |
|--------|--------|-------------------|-----------|
| Seleção de perfis | ✅ Funcionando | `app/page.tsx` | Multi-perfil sem auth Supabase |
| Onboarding | ✅ Funcionando | `app/onboarding/page.tsx` | Exibido uma vez por perfil |
| Dashboard | ✅ Funcionando | `app/(app)/dashboard/page.tsx` | KPIs, gráficos, alertas |
| Gestão de obras | ✅ Funcionando | `app/(app)/obras/` | CRUD completo |
| Orçamento executivo | ✅ Funcionando | `components/obra/ObraOrcamento.tsx` | BDI editável, versionamento |
| Cronograma | ✅ Funcionando | `components/obra/ObraCronograma.tsx` | Linha do tempo 30 dias + tabela |
| Materiais / estoque | ⚠️ Parcial | `components/obra/ObraMateriais.tsx` | Col. `subetapa` pendente de migração |
| Medições / diário | ⚠️ Parcial | `components/obra/ObraMedicoes.tsx` | Col. `nome`/`fotos` pendentes de migração |
| Orçamento paramétrico | ❌ Não implementado | — | Listado em pendências |
| Fornecedores da obra | ✅ Funcionando | `components/obra/ObraFornecedores.tsx` | Vínculo obra ↔ fornecedor |
| Arquivos da obra | ✅ Funcionando | `components/obra/ObraArquivos.tsx` | Gestão de documentos/fotos |
| Base SINAPI | ✅ Funcionando | `app/(app)/sinapi/page.tsx` | Upload XLSX + visualização paginada |
| Composições próprias | ✅ Funcionando | `app/(app)/servicos/page.tsx` | CRUD + custo calculado em runtime |
| Insumos próprios | ✅ Funcionando | `app/(app)/servicos/page.tsx` | Cadastro de insumos fora do SINAPI |
| Chat IA (Luizia) | ✅ Funcionando | `app/(app)/buildassist/page.tsx` | Contexto injetado automaticamente |
| WhatsApp Luizia | ✅ Funcionando | `app/api/whatsapp/luizia/route.ts` | Via Twilio, resposta TwiML |
| Clima / tempo | ✅ Funcionando | `app/api/weather/route.ts` | Open-Meteo, fallback offline |
| Cronograma Gantt | ✅ Funcionando | `components/obra/CronogramaGantt.tsx` | Componente visual Gantt |
| Relatórios | ✅ Funcionando | `app/(app)/relatorios/page.tsx` | Exportáveis |
| Monitor IA | ✅ Funcionando | `lib/luizia-monitor.ts` + página | localStorage + Supabase |
| Backup / restore | ✅ Funcionando | `components/ui/BackupRestauracaoModal.tsx` | — |
| Import/export orçamento | ✅ Funcionando | `lib/import-export-orcamento.ts` | Excel/XLSX |
| Import/export templates | ✅ Funcionando | `lib/import-export-templates.ts` | — |
| Import base antiga | ✅ Funcionando | `lib/import-base-antiga.ts` | Migração de planilhas antigas |
| Localidades BR | ✅ Funcionando | `lib/brasil-localidades.ts` | Lista estática de estados/cidades |

---

## 5. Integrações Ativas

| Serviço | Como é usado | Variáveis necessárias | Auth |
|---------|-------------|----------------------|------|
| **Supabase** | Banco de dados principal. Cliente browser (`lib/supabase/client.ts`) e servidor (`lib/supabase/server.ts`). | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (sem Row Level Security configurado) |
| **OpenAI** | Modelo de IA da Luizia. `lib/luizia-core.ts` usa `openai` SDK. Modelos: `gpt-4o-mini` (simples) e `gpt-4o` (complex). | `OPENAI_API_KEY` | Bearer token |
| **Twilio** | WhatsApp webhook. `app/api/whatsapp/luizia/route.ts` recebe POST da Twilio, valida HMAC opcional, responde TwiML. | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | HMAC-SHA1 opcional (`TWILIO_VALIDATE_SIGNATURE`) |
| **Open-Meteo** | Previsão do tempo 7 dias. Gratuito, sem chave. `app/api/weather/route.ts`. Geocodificação pelo próprio Open-Meteo. | — | Público |
| **IBGE** | Municípios por UF. `app/api/localidades/municipios/route.ts`. Cache 7 dias no Next.js. | — | Público |

**Não encontrado no código:** n8n, Z-API, Evolution API, Stripe, Firebase, Redis.

**`@anthropic-ai/sdk`:** instalado no `package.json` mas **não importado** em nenhum arquivo de lógica. Apenas mencionado como texto na tela de configurações (`app/(app)/configuracoes/page.tsx`).

---

## 6. Componentes Principais

### Layout (`components/layout/`)
| Componente | Descrição |
|-----------|-----------|
| `AppLayout.tsx` | Container raiz: sidebar fixa + header + área de conteúdo. Redireciona para `/` se sem perfil. |
| `Sidebar.tsx` | Menu lateral fixo. Itens de navegação com ícone e label. Item ativo destacado em accent color. |
| `Header.tsx` | Topo de página: título + avatar do perfil clicável (abre seleção de perfil) + toggle dark/light. |
| `WelcomeGuide.tsx` | Guia de boas-vindas inline (exibido na primeira sessão, desabilitável nas configurações). |
| `LuiziaFloatingChat.tsx` | Botão/chat flutuante da Luizia disponível globalmente. |

### Dashboard (`components/dashboard/`)
| Componente | Descrição |
|-----------|-----------|
| `ClimaWidgets.tsx` | Widget de clima exibido no dashboard. Consulta `/api/weather`. |

### Obra (`components/obra/`)
| Componente | Descrição |
|-----------|-----------|
| `ObraOrcamento.tsx` | Tab orçamento executivo: tabela de itens, BDI, subtotal/total, modal de adição, versionamento. |
| `ObraCronograma.tsx` | Tab cronograma: linha do tempo 30 dias + tabela de etapas + modal nova etapa. |
| `ObraMateriais.tsx` | Tab materiais: tabela de insumos por status de compra, filtro por etapa, ação "Comprado". |
| `ObraMedicoes.tsx` | Tab medições: barras de progresso por etapa + histórico de medições. |
| `ObraFornecedores.tsx` | Tab fornecedores: vínculo obra ↔ fornecedor por grupo (mão de obra / demais). |
| `ObraArquivos.tsx` | Tab arquivos: upload e listagem de documentos/fotos da obra. |
| `CronogramaGantt.tsx` | Componente visual Gantt reutilizável. |
| `ImportarExportarOrcamentoModal.tsx` | Modal de importação/exportação de orçamento (Excel). |

### Serviços (`components/servicos/`)
| Componente | Descrição |
|-----------|-----------|
| `ImportarBaseAntigaModal.tsx` | Modal para importar planilhas de base de composições antigas. |

### UI (`components/ui/`)
| Componente | Descrição |
|-----------|-----------|
| `Button.tsx` | Variantes: primary, secondary, ghost, danger. Tamanhos: sm, md, lg. Estado loading. |
| `Input.tsx` | Input, Select, Textarea — com label, error hint, helper text. |
| `Modal.tsx` | Overlay com backdrop. Fecha com ESC ou clique fora. Tamanhos configuráveis. |
| `Badge.tsx` | Variantes: default, success, warning, danger, info. |
| `EmptyState.tsx` | Estado vazio com ícone, título, descrição e ação opcional. |
| `ImportExportModal.tsx` | Modal genérico de import/export de dados. |
| `BackupRestauracaoModal.tsx` | Modal de backup e restauração do sistema. |

---

## 7. Decisões Arquiteturais

| Decisão | Implementação | Motivo |
|---------|--------------|--------|
| **App Router Next.js** | Sem Pages Router | Padrão moderno; Server Components disponíveis |
| **Modo dual de dados** | `NEXT_PUBLIC_DATA_MODE=local\|remote` | MVP roda sem Supabase; produção usa remote |
| **Multi-perfil sem auth Supabase** | Seleção por `localStorage` + `ProfileContext` | Simplifica o MVP; auth pode ser adicionado depois |
| **`force-dynamic` no layout** | `app/(app)/layout.tsx` exporta `export const dynamic = 'force-dynamic'` | Supabase client não pode ser instanciado no prerender estático sem env vars |
| **Preço calculado em runtime** | `Σ(coeficiente × preco_sinapi[uf])` no frontend | `custo_calculado` não existe no banco — calculado via join em runtime |
| **CSS custom properties para tema** | `globals.css` com `var(--accent)`, `[data-theme="light"]` | Dark/light mode por perfil sem duplicar classes Tailwind |
| **Fallback de URL do Supabase** | `|| 'https://placeholder.supabase.co'` em `lib/supabase/config.ts` | Build de produção não quebra sem env vars |
| **Route group `(app)`** | `app/(app)/` | Separa páginas públicas (`/`, `/onboarding`) das protegidas |
| **AI core centralizado** | `lib/luizia-core.ts` | Chat web e webhook WhatsApp usam a mesma função `askLuizia()` |
| **Monitor de IA sem quebrar fluxo** | Try-catch silencioso em `lib/luizia-monitor.ts` | Falha no log não deve derrubar a resposta da IA |
| **Nomenclatura** | Português BR em rotas e negócio; inglês em infraestrutura | Clareza para o domínio; consistência com ecossistema JS |
| **Código auto-sequencial para composições** | `COMP-001`... via `COUNT(*)` | Simples e legível para o usuário final |
| **Preços SINAPI por UF em JSONB** | `precos: {"AC": 302.08, "SP": 198.69, ...}` | Uma linha por insumo/mês em vez de uma linha por insumo/mês/UF |

### Estrutura de fontes (design system `app/globals.css`)
- **Títulos:** DM Serif Display
- **Corpo:** DM Sans
- **Códigos SINAPI:** JetBrains Mono
- **Classes base:** `.card`, `.btn-primary`, `.input-base`, `.animate-enter`, `.table-zebra`

---

## 8. Pendências, Bugs e Schema Drift

### ⚠️ Schema Drift (crítico)

O banco Supabase em produção pode ter sido criado com uma versão **mais antiga** do `schema.sql`. Como `CREATE TABLE IF NOT EXISTS` não adiciona colunas novas em tabelas existentes, as seguintes divergências foram identificadas:

| Tabela | Coluna esperada pelo código | Realidade no banco antigo |
|--------|----------------------------|--------------------------|
| `obras` | `area_m2`, `uf` | **não existem** — insert falha silenciosamente |
| `sinapi_insumos` | `precos JSONB`, `classificacao`, `origem_preco` | tem `preco_unitario NUMERIC`, `estado`, `categoria` (formato plano) |
| `sinapi_composicoes` | `custos JSONB`, `situacao`, `mes_referencia` | tem `custo_unitario NUMERIC` (sem variação por UF) |
| `sinapi_composicao_itens` | tabela inteira | **não existe** |

**Impacto em modo degradado:**
- Modal "Nova Obra": `area_m2` e `uf` não são persistidos
- Orçamento: cards "Material/Mão de obra/Equipamento" ficam zerados (fallback para `custo_unitario`)
- Serviços: composições com insumos SINAPI mostram custo R$ 0,00

**Migração necessária:** `supabase/fix_2026_06_08_supabase_v1_2_columns.sql` (rodar no SQL Editor do Supabase com `service_role`).

### Migrações pendentes

| Arquivo | O que faz |
|---------|-----------|
| `supabase/fix_2026_06_08_supabase_v1_2_columns.sql` | Adiciona col. `subetapa` em `materiais`, `medicoes`, `orcamento_itens` |
| `supabase/migration_pendente_rodar_agora.sql` | Migração geral pendente (ver arquivo para detalhes) |

Enquanto não rodadas: agrupamento por `subetapa` está desabilitado em `ObraMateriais`, `ObraMedicoes` e `ObraOrcamento`.

### TODOs e funcionalidades não implementadas

| Item | Status |
|------|--------|
| Orçamento paramétrico (EVF) | ❌ Não implementado |
| Upload real de fotos (Supabase Storage) | ❌ Aceita apenas URL |
| Exportar orçamento para Excel | ❌ Pendente |
| Importação SINAPI real (XLSX Caixa mensal) | ❌ Apenas 3 insumos de exemplo no seed |
| Alerta preditivo automático (job/cron) | ❌ Verificado apenas ao abrir dashboard |
| Etapas vinculadas ao orçamento (geração automática de materiais) | ❌ Não implementado |
| Geração automática de lista de compras pela IA | ❌ Não implementado |
| Toast de feedback em ações | ❌ Não implementado |
| Validação robusta de formulários (react-hook-form) | ❌ Não implementado |
| Tratamento de erro global sem Supabase configurado | ❌ Não implementado |
| Responsive mobile testado | ❌ Não validado |

### Outros pontos a verificar

- `OPENAI_COMPLEX_MODEL=gpt-5-mini` no `.env.example` — `lib/luizia-core.ts` valida o modelo contra `['gpt-4o-mini', 'gpt-4o']` e usa `gpt-4o` como fallback se o valor não for reconhecido. O env var efetivamente não funciona com `gpt-5-mini`. **[INCERTO se existe esse modelo]**
- `@anthropic-ai/sdk` instalado no `package.json` mas não usado no código de IA.
- Campos `tipo`, `apelido`, `descricao`, `cidade`, `estado` em `Profile` (TypeScript) não aparecem em `schema.sql` — provavelmente adicionados via migração fora do arquivo principal.
- Campos `nome`, `fotos`, `updated_at` em `Medicao` (TypeScript) não aparecem em `schema.sql`.
