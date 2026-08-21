# Tarefas V1 — Relatório Técnico

## Estado anterior encontrado

A tabela `public.tarefas` já existia no banco (vazia), com o schema exatamente descrito no pedido: `id, titulo, descricao, obra_id, projeto_id, responsavel_id, responsavel_nome, status, prioridade, data_prazo, concluida, concluida_em, created_at, updated_at`. FKs para `obras` (ON DELETE CASCADE), `projetos` (sem ação) e `profiles`. RLS `allow_all` (padrão interno do BuildSmart, mesmo usado por `etapas`/`orcamento_itens`/etc — sem autenticação real de app).

Mais importante: **o frontend já tinha uma feature de tarefas quase pronta, mas nunca conectada**:
- `lib/types.ts` já tinha o tipo `Tarefa`.
- `components/obra/ObraTarefas.tsx` (434 linhas) era um CRUD completo (lista + kanban + modal), só para `obra_id`, mas **nunca era importado em lugar nenhum** — dead code.
- `components/dashboard/MinhasTarefasWidget.tsx` já existia, já funcionava, já linkava para `/obras/{id}?tab=tarefas` — mas essa tab **não existia** em `app/(app)/obras/[id]/page.tsx`, então o link não levava a lugar nenhum.

Ou seja: a maior parte do trabalho desta V1 foi **terminar** uma feature que já estava 70% construída, não começar do zero.

### Viabilidade — investigação obrigatória

Busquei em todo o repositório (migrations, `lib/types.ts`, `app/`, `components/`) por "viabilidade" (case-insensitive). **Não existe em lugar nenhum** — nem como coluna, nem como valor de `status`/`fase_ciclo`, nem como tabela, nem como rota, nem como rascunho/comentário. Confirmei também via SQL: nenhuma tabela `%viabil%` no schema `public`, e os únicos campos de fase/status em `projetos` são:
- `status`: `aguardando | em_andamento | concluido | suspenso`
- `fase_ciclo`: `projeto | em_obra | entregue`

**Decisão**: não inventei tabela, coluna ou rota para Viabilidade. Como instruído, parei essa integração específica. Tarefas relacionadas a viabilidade devem ser criadas vinculadas ao `projeto_id` correspondente (via a aba "Tarefas" do Projeto) — é o contexto real mais próximo disponível hoje. Se no futuro "Viabilidade" virar uma fase real de `projetos.fase_ciclo` ou uma tabela própria, o motor de tarefas já suporta o vínculo (`projeto_id` já existe) sem nenhuma mudança de schema.

## Arquivos alterados

**Novos:**
- `lib/tarefas.ts` — constantes (labels/cores de prioridade e status), `isAtrasada()`, `ordenarTarefas()` (regra de ordenação única usada em toda a feature), `hojeISO()`, `TAREFAS_ABERTAS`.
- `components/tarefas/LinhaTarefa.tsx` — linha de lista reutilizável (check rápido, título, prazo, prioridade, chip de contexto opcional).
- `components/tarefas/TarefaModal.tsx` — modal única de criar/editar (título obrigatório; responsável/prazo/prioridade imediatos; status só no editar).
- `components/tarefas/ContextoTarefas.tsx` — painel de tarefas de um contexto (Obra OU Projeto), substitui `ObraTarefas.tsx`.
- `app/(app)/tarefas/page.tsx` — motor global: Inbox / Minhas tarefas / Hoje / Próximas / Aguardando / Todas (discreta).
- `supabase/migrations/20260821021241_tarefas_status_aguardando_e_indices.sql`

**Modificados:**
- `lib/types.ts` — `Tarefa.status` ganha `'aguardando'`; `Tarefa` ganha `projeto?: { nome: string }`.
- `components/layout/Sidebar.tsx` — item "Tarefas" no menu principal (ícone `ClipboardList`, entre Dashboard e Projetos).
- `app/(app)/obras/[id]/page.tsx` — nova aba "Tarefas" (`ContextoTarefas obraId={id}`) — é o que faz o link do `MinhasTarefasWidget` (que já existia) passar a funcionar.
- `app/(app)/projetos/[id]/page.tsx` — nova aba "Tarefas" (`ContextoTarefas projetoId={projeto.id}`).
- `components/dashboard/MinhasTarefasWidget.tsx` — link "Ver todas" para `/tarefas`; corrigido um lint pré-existente (`setState` síncrono em efeito) já que o arquivo foi tocado mesmo assim.

**Removido:**
- `components/obra/ObraTarefas.tsx` — dead code nunca importado, substituído por `ContextoTarefas.tsx` (que suporta Obra e Projeto).

## Migrations realizadas

`20260821021241_tarefas_status_aguardando_e_indices.sql`:
- Estende `tarefas_status_check` para incluir `'aguardando'` (mantendo `pendente|em_andamento|concluida|cancelada`) — mudança compatível, tabela estava vazia.
- Índices em `obra_id`, `projeto_id`, `responsavel_id`, `status`, `data_prazo` (parciais, `where ... is not null` onde aplicável) para as consultas filtradas do motor global.

Nenhuma migration mexeu em `orcamentos`, `etapas`, `orcamento_itens`, `medicoes`, `compras`, Portal ou qualquer tabela fora de `tarefas`.

## Decisões tomadas

1. **Inbox = sem responsável, não um status novo.** "Triagem" foi modelada como `responsavel_id is null` (dentro dos status abertos), não como um status `'triagem'` extra — evita inflar o enum sem necessidade real, e "atribuir alguém" já É o ato de triar.
2. **`aguardando` é status, não coluna nova.** Não criei uma coluna "aguardando de quem" (cliente/prefeitura/fornecedor/etc) — o texto do título/descrição carrega isso. Se o uso real mostrar necessidade de filtrar por "aguardando de quem", isso é uma extensão pontual futura, não algo a adivinhar agora.
3. **Hoje/Próximas/Aguardando são pessoais (escopadas ao usuário atual).** Só Inbox é global (não tem dono ainda). O exemplo do pedido ("tarefas do Projeto R0224 aparecem em Minhas/Hoje/Próximas") só faz sentido nessa leitura — são as MINHAS tarefas vistas por prazo, venham elas de onde vierem.
4. **Criação rápida nunca expõe obra/projeto como campo.** Contexto é sempre herdado (da aba Obra/Projeto) ou ausente (criação pela tela global = tarefa "solta", cai na Inbox se sem responsável). Isso é literal ao pedido ("o usuário não escolhe onde a tarefa mora").
5. **Sem duplicação por construção, não por convenção.** Todas as visões (contexto e global) fazem `select` na mesma tabela `tarefas` com filtros diferentes — não existe nenhuma tabela de junção, cache ou cópia. Validei isso com dados reais (ver Testes).
6. **`ContextoTarefas` generaliza o `ObraTarefas` já existente** em vez de criar um componente do zero — reaproveita 100% do padrão visual (kanban, filtros Pendentes/Concluídas, modal) que já era usado e testado no app.

## Funcionalidades entregues

- Criar tarefa: globalmente, dentro de Obra, dentro de Projeto — todas herdam contexto automaticamente quando aplicável.
- Edição completa (título, descrição, responsável, prazo, prioridade, status).
- Conclusão/reabertura mantendo `status`/`concluida`/`concluida_em` sempre consistentes entre si.
- Exclusão (mesmo padrão já usado no app: `confirm()` + delete direto, sem soft-delete — igual ao que já existia).
- Filtros globais: Inbox, Minhas tarefas, Hoje (vencidas + hoje), Próximas, Aguardando, Todas (discreta).
- Ordenação única (`ordenarTarefas`) aplicada em toda a feature: atrasadas → urgente/alta → prazo mais próximo → sem prazo por último. Atraso nunca depende só de cor (usa ícone `AlertTriangle` + texto).
- Chip de contexto (Obra/Projeto) clicável nas linhas da tela global, levando direto para a aba Tarefas daquele contexto.
- Mobile: alvo de toque do check aumentado (`-m-2 p-2`, ~34px), prioridade sempre visível (chip compacto no mobile, badge no desktop), tab bar da tela global com scroll horizontal.

## Testes executados

Executados via SQL direto contra o banco de produção (`begin; ... rollback;`), reproduzindo exatamente as mesmas queries que o frontend faz — sem navegador real disponível neste ambiente (sandbox sem rede para `*.supabase.co`, mesma limitação de rodadas anteriores documentada em `HANDOFF_BUILDSMART.md`).

| Cenário | Esperado | Obtido | Resultado |
|---|---|---|---|
| Criar tarefa global (sem obra/projeto/responsável) | aparece na Inbox | apareceu, e só ela | PASSOU |
| Criar tarefa na Obra Allegra, responsável Luiz, prazo hoje | aparece em Minhas(Luiz), Hoje(Luiz) e no contexto da Obra — mesma linha | confirmado, mesmo `id` nas 3 consultas | PASSOU |
| Criar tarefa no Projeto R0220, responsável Gabriel, prazo amanhã | aparece em Próximas(Gabriel) e no contexto do Projeto — mesma linha, não em Minhas(Luiz) | confirmado | PASSOU |
| Criar tarefa status `aguardando`, responsável Luiz | aparece só em Aguardando(Luiz) | confirmado | PASSOU |
| Criar tarefa com prazo ontem, responsável Luiz | aparece em Hoje(Luiz) (atrasada conta como hoje) | confirmado | PASSOU |
| Duplicação | mesma tarefa nunca aparece como registro duplicado entre contexto e global | confirmado — sempre o mesmo `id`, `select`s diferentes na mesma tabela | PASSOU |
| Concluir tarefa | `status='concluida'`, `concluida=true`, `concluida_em` preenchido | confirmado | PASSOU |
| Reabrir tarefa concluída | `status='pendente'`, `concluida=false`, `concluida_em=null` | confirmado | PASSOU |
| Ordenação (`ordenarTarefas`) | atrasada > urgente/alta > prazo próximo > sem prazo | testado isoladamente em Node com 5 tarefas variadas — ordem exata esperada | PASSOU |
| `npx tsc --noEmit` | 0 erros | 0 erros | PASSOU |
| `npx eslint` nos arquivos novos/alterados da feature | 0 erros, 0 warnings | 0 erros, 0 warnings (inclusive corrigi 1 erro pré-existente em `MinhasTarefasWidget.tsx` já que toquei o arquivo) | PASSOU |
| `npm run build` | build limpo, rota `/tarefas` gerada | compilado com sucesso, `○ /tarefas` na lista de rotas | PASSOU |
| Estado do banco após os testes | zero linhas de teste remanescentes | `select count(*) from tarefas` → `0` | PASSOU |
| Regressão em Obras/Projetos | páginas continuam funcionando, só ganharam uma aba | `obras/[id]/page.tsx` e `projetos/[id]/page.tsx` compilam e tipam limpo; nenhuma lógica de Orçamento/Planejamento/Portal foi tocada | PASSOU |

### Validação mobile (390px)

Feita por revisão de código (mesma limitação de rede do sandbox — sem navegador real para screenshot):
- Tab bar da tela global usa `overflow-x-auto`, mesmo padrão já validado em produção na página de Relatórios.
- `LinhaTarefa`: título trunca (`truncate`), meta-informações (responsável/prazo/contexto/prioridade) ficam num `flex flex-wrap`, então quebram linha em vez de estourar a largura.
- Modal usa `size="md"` com `max-w-md` e `overflow-y-auto` interno — mesmo componente `Modal` já usado em todo o app em telas pequenas.
- Botão de concluir com alvo de toque ampliado (era ~18px, agora ~34px efetivos via `-m-2 p-2`).

## Pendências / limitações conhecidas

1. **Sem teste em navegador real** — só revisão de código + testes de dados via SQL direto. Mesma limitação já documentada nas rodadas anteriores desta sessão.
2. **Viabilidade não integrada** — por não existir como entidade persistente (ver acima). Tarefas de viabilidade usam `projeto_id` por enquanto.
3. **`tarefas_projeto_id_fkey` não tem `ON DELETE` definido** (diferente de `obra_id`, que é `CASCADE`) — pré-existente, não mexi nisso porque está fora do escopo pedido e não bloqueia nenhum teste da V1. Se um projeto com tarefas vinculadas for excluído, a exclusão falhará por FK — comportamento a decidir numa rodada futura caso vire problema real.
4. **"Aguardando de quem"** (cliente/prefeitura/fornecedor/etc) não tem campo estruturado — fica no texto da tarefa. Documentado como decisão deliberada acima.

## Itens deixados fora da V1 (conforme pedido)

IA criando tarefas, automações, recorrência, subtarefas, comentários/chat, anexos complexos, dependências avançadas, Gantt, calendário próprio, Kanban complexo (o kanban existente em `ContextoTarefas` é o simples que já existia, não um novo), notificações sofisticadas, novo sistema de permissões, refatoração geral de Projetos/Obras, biblioteca genérica de workflow.

## Riscos / regressões

Nenhuma regressão identificada. `ObraTarefas.tsx` foi removido, mas era código morto (zero imports antes desta rodada) — sua remoção não afeta nada em produção. As duas páginas de detalhe (Obra, Projeto) só ganharam uma aba nova; nenhuma aba existente foi alterada.
