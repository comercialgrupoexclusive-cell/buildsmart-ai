# BuildSmart AI — Contexto do Projeto

**Repositório:** `https://github.com/comercialgrupoexclusive-cell/buildsmart-ai.git`  
**Branch ativa:** `feat/admin-onboarding-clima-melhorias`  
**Diretório local:** `C:\Users\PC\buildsmart-ai`  
**Deploy (produção):** `https://buildsmart-ai-chi.vercel.app`  
**Stack:** Next.js 16 (App Router) + Supabase (PostgreSQL) + Tailwind CSS + TypeScript

---

## Autenticação

- Sem Supabase Auth — login via `app/page.tsx`
- Compara `password_hash` em texto puro na tabela `profiles`
- Perfil ativo salvo no `localStorage` como JSON
- Hook de perfil: `lib/profile-context.tsx` → `useProfile()`
- Hook de permissões: `lib/permissions.ts` → `usePermission()` com `canDelete`, `isAdmin`, `isCliente`, `isPrestador`
- Tipos de acesso: `'admin' | 'usuario' | 'cliente' | 'prestador'` (coluna `tipo_acesso` em `profiles`)

---

## Estrutura de Pastas

```
app/
  page.tsx                          ← Login
  (app)/
    layout.tsx                      ← AppLayout (sidebar + header)
    dashboard/page.tsx
    cadastro/page.tsx               ← Hub unificado Projetos / Obras / Orçamentos
    projetos/
      page.tsx                      ← Lista de projetos
      [id]/page.tsx                 ← Detalhe: abas Estrutura / Cronograma / Dados Gerais
      templates/page.tsx
    obras/
      page.tsx
      [id]/page.tsx                 ← Detalhe da obra (cronograma, orçamento, materiais…)
    orcamentos/page.tsx
    servicos/page.tsx
    materiais/page.tsx
    cronograma/page.tsx
    configuracoes/page.tsx          ← CRUD de usuários + senha + permissões
    canteiro/
      page.tsx
      [id]/page.tsx
    buildassist/page.tsx
    luizia-monitor/page.tsx
    admin-luiza/page.tsx

components/
  layout/
    AppLayout.tsx                   ← Sidebar + header + roteamento por tipo de usuário
    Sidebar.tsx
    Header.tsx
    LuiziaFloatingChat.tsx
  projeto/
    ProjetoCascata.tsx              ← Estrutura 3 níveis (Disciplina/Item/Subitem) com inline edit
    ProjetoCronograma.tsx           ← Kanban + Gantt para projetos
  obra/
    ObraCronograma.tsx              ← Cronograma de obra (Gantt + cascata de etapas)
    CronogramaGantt.tsx             ← SVG Gantt reutilizável
    ObraOrcamento.tsx
    ObraMateriais.tsx
    ObraMedicoes.tsx
    ObraFornecedores.tsx
    ObraArquivos.tsx
    ObraRequisicoes.tsx
  cadastro/
    CadastroCard.tsx                ← Card unificado (projeto/obra/orçamento)
    NovoCadastroModal.tsx           ← Modal único de criação
  dashboard/
    ClimaWidgets.tsx
  ui/
    Button.tsx
    Modal.tsx
    EmptyState.tsx
    Input.tsx
    Badge.tsx

lib/
  supabase/client.ts               ← createClient() para uso no cliente
  permissions.ts                   ← usePermission()
  profile-context.tsx              ← useProfile()
  utils.ts                         ← formatCurrency, formatDate, cn, etc.
```

---

## Banco de Dados (Supabase) — Tabelas Principais

| Tabela | Descrição |
|---|---|
| `profiles` | Usuários: `id, name, apelido, email, tipo_acesso, password_hash, pode_excluir` |
| `obras` | Obras: `id, nome, cliente, endereco, status, foto_url, responsavel` |
| `obra_usuarios` | Responsáveis por obra: `obra_id, profile_id, papel` |
| `etapas` | Etapas de obra/projeto: `id, obra_id, projeto_id, nome, data_inicio, data_fim, percentual_executado, ordem` |
| `projetos` | Projetos: `id, nome, cliente, endereco, status, data_inicio, data_previsao, obra_id, foto_url` |
| `projeto_itens` | Itens de projeto (3 níveis): `id, projeto_id, parent_id, nome, nivel, concluido, ordem, responsavel, data_inicio, data_prazo` |
| `projeto_usuarios` | Responsáveis por projeto: `projeto_id, profile_id, papel` |
| `projeto_templates` | Templates de projeto: `id, nome, itens (jsonb)` |
| `orcamentos` | Orçamentos vinculados a obras |
| `orcamento_itens` | Itens do orçamento |
| `materiais` | Materiais/compras por obra |
| `fornecedores` | Cadastro de fornecedores |
| `rdo` | Relatório Diário de Obra |
| `comunicados_obra` | Comunicados por obra |

---

## Módulo Projetos — Lógica Central

### `components/projeto/ProjetoCascata.tsx`

Estrutura de 3 níveis em cascata com edição inline.

```ts
type ProjetoItemNode = {
  id: string
  projeto_id: string
  parent_id: string | null
  nome: string
  nivel: number        // 1=disciplina  2=item  3=subitem
  concluido: boolean
  ordem: number
  responsavel: string | null
  data_inicio: string | null
  data_prazo: string | null
  children?: ProjetoItemNode[]
}
```

**Funções importantes:**
- `buildProjetoTree(flat[])` — converte lista plana em árvore
- `effectiveDates(node)` — folhas usam próprias datas; pais calculam `min(início) → max(fim)` dos filhos
- `calcStatus(node)` → `'pendente' | 'em_andamento' | 'atrasado' | 'concluido'`

**UX das datas:**
- Nivel 1 (disciplina) e nivel 2 (item) têm datas editáveis diretamente
- Padrão click-to-edit: mostra texto `14/06/26` → clique → `<input type="date">` → blur/Enter fecha

**Grid da linha:**
```
gridTemplateColumns: '1fr 130px 110px 110px'
// Nome + badge status | Responsável | Início | Fim
```

---

### `components/projeto/ProjetoCronograma.tsx`

Sub-tabs: **Kanban** e **Gantt**.

**Kanban:**
- Cards apenas para itens `nivel >= 2`
- 4 colunas: Pendente / Em andamento / Atrasado / Concluído
- Botões nos cards para mover entre colunas

**Gantt (SVG):**
```ts
const ROW_H   = 48
const HDR_H   = 48
const LEFT_W  = 220
const PAD_DAY = 12
const PX_PER_DAY = 18

const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
// IMPORTANTE: não usar toLocaleDateString() — produz resultado errado no Vercel

const GANTT_COLORS = ['#3B7BF8','#8B5CF6','#10B981','#F59E0B','#06B6D4','#EC4899','#84CC16','#F97316']
// Cada disciplina recebe uma cor; itens filhos herdam a cor com 65% de opacidade
```

- Linha topo: "Projeto (total)" usa rollup das disciplinas
- Demais linhas: usam `data_inicio` / `data_prazo` direto do item (não rollup)
- Painel esquerdo: nome + inputs de data editáveis para nivel <= 2
- Cascata inicia fechada; botão ▶/▼ expande

---

### `app/(app)/projetos/[id]/page.tsx`

```ts
// 3 abas
type Tab = 'estrutura' | 'cronograma' | 'dados'

// Handler de update (otimista)
async function handleUpdateItem(itemId: string, fields: Partial<Pick<ProjetoItemNode, 'responsavel' | 'data_inicio' | 'data_prazo'>>) {
  // 1. Atualiza estado local imediatamente
  // 2. supabase.from('projeto_itens').update(fields).eq('id', itemId)
  // 3. alert() se error
}
```

---

## Padrões de Código

### Atualização otimista
```ts
// Sempre: atualiza UI primeiro, persiste depois, alerta se erro
setItens(updated)
setTree(buildProjetoTree(updated))
const { error } = await supabase.from('tabela').update(fields).eq('id', id)
if (error) alert('Erro ao salvar: ' + error.message)
```

### Supabase client-side
```ts
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```

### CSS Variables (tema claro/escuro)
```
var(--bg-card)
var(--bg-secondary)
var(--border)
var(--accent)           ← azul principal #3B7BF8
var(--text-primary)
var(--text-secondary)
```

### SQL — regra crítica
**Nunca rodar SQL automaticamente.** Sempre postar o SQL no chat para o usuário copiar e colar no painel do Supabase.

---

## WhatsApp / Luizia

- IA WhatsApp via **Z-API** (não Twilio)
- `app/api/whatsapp/webhook/route.ts` — recebe mensagens
- `app/api/whatsapp/dispatch/route.ts` — envia mensagens
- `app/api/whatsapp/luizia/route.ts` — lógica da IA
- `app/(app)/luizia-monitor/page.tsx` — painel de monitoramento
- `app/(app)/admin-luiza/page.tsx` — configurações da Luizia
- Env vars em `.env.local` e no painel Vercel (nunca hardcoded)

---

## Commits Recentes

```
43ccc80 feat(projetos): inline click-to-edit dates, gantt colors per disciplina, fix month labels
7e9ce36 debug: log resultado do sendZApi
dc7b25b debug: adiciona logs em cada etapa do webhook
c7b5400 debug: rota temporaria debug-zapi para diagnostico Z-API
c0933f2 debug: log bruto no webhook + webhook configurado via Z-API API
7a62ff7 feat: webhook Z-API + painel admin Luizia WhatsApp
```
