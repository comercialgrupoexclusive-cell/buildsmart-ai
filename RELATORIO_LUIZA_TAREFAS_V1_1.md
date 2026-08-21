# Relatório — Luiza × Tarefas V1.1 (Rodada de Hardening)

Rodada exclusiva de correção de riscos estruturais encontrados na integração Luiza↔Tarefas (V1), antes do teste end-to-end real via WhatsApp. Nenhuma funcionalidade nova de produto; nenhuma mudança em Orçamento/Planejamento/Qualidade/Portal.

Commit base desta rodada: `dbe780af2f6af8728211f1e226c51a80f4a087f1`.

---

## 1. Problemas encontrados (antes de qualquer alteração)

| # | Problema | Evidência |
|---|---|---|
| 1 | `luizia_wa_users` continua sem uso real para identidade — não existe vínculo estrutural telefone→profile em lugar nenhum | leitura de `lib/tarefas-ai-tools.ts`, `app/api/whatsapp/dispatch/route.ts` |
| 2 | Resolução fuzzy de obra/projeto/responsável fazia `ilike(...).limit(1)` (com `order by` determinístico desde a rodada anterior, mas ainda escolhendo "a mais recente" sozinha entre homônimos reais) | `lib/tarefas-ai-tools.ts`, `lib/ai-obra-tools.ts`, `lib/projeto-ai-tools.ts`, e 6 pontos em `app/api/whatsapp/webhook/route.ts` |
| 3 | Regra "sugestão da Luiza não escreve sozinha" só existia como instrução de prompt — nenhum código impedia a ferramenta de escrita de ser chamada na mesma rodada de uma sugestão | leitura de `lib/tarefas-ai-tools.ts` (v1) |
| 4 | `luizia_tarefas_log` tinha policy `bs_mvp_insert_all` (`with_check=true`, role `public`) e grants completos (INSERT/UPDATE/DELETE/TRUNCATE) para `anon`/`authenticated` — qualquer client com a chave anônima (embutida no app) podia fabricar uma linha de histórico | consulta a `pg_policies`/`information_schema.role_table_grants` |
| 5 | `resolveResponsavelDispatch` do resumo diário resolvia por `destino_nome` fuzzy — mesmo risco de escolher a pessoa errada | `app/api/whatsapp/dispatch/route.ts` |
| 6 | "Enviar agora" no painel, quando não havia tarefa relevante, mandava um WhatsApp real com um texto-placeholder `(sem tarefas relevantes — nada enviado)` — ironicamente enviava mensagem justamente no caso em que a intenção era "nada a dizer, não manda nada" | `app/api/whatsapp/dispatch/route.ts` (branch manual) |

---

## 2. O que foi implementado

### 2.1 Identidade WhatsApp → profile (item 1 do pedido)

- **Migration** `20260821120000_luizia_hardening_v1_1.sql`: `luizia_wa_phone_rules` ganha `profile_id uuid references profiles(id)` (nullable).
- **Painel** (`/admin-luiza` → aba Conversas): novo seletor "Vincular a um perfil do BuildSmart" no editor de cada contato, junto de Nome/Instrução específica.
- **Webhook**: `phoneProfileId = phoneRule.profile_id` é lido junto com o resto do `phoneRule` (já vinha em `select('*')`) e passado ao contexto das tools de Tarefas.
- **`list_tasks`**: quando a pergunta é pessoal ("o que tenho hoje", "minhas tarefas", "o que está atrasado pra mim" — ou seja, nenhum `obra_nome`/`projeto_nome`/`responsavel_nome` foi informado) e a origem é WhatsApp, o filtro `responsavel_id` é preenchido automaticamente com `ctx.profileId`. Se o telefone não estiver vinculado, a função devolve uma mensagem explicando isso e pedindo o vínculo — **nunca tenta advinhar pelo nome do contato do WhatsApp**. Perguntar por outra pessoa explicitamente ("o que o Gabriel tem?") continua indo pelo caminho de resolução por nome (agora seguro, ver 2.2).
- `obra_ai` (assistente in-app) não tem conceito de telefone — não foi alterado nesse aspecto, mantém o comportamento anterior (sem "minhas tarefas" automático).

### 2.2 Eliminação de escolha ambígua silenciosa (item 2)

Novo módulo `lib/ai-resolve.ts`: `resolverComSeguranca(nomeBuscado, candidatos, obterNome)` implementa exatamente a regra pedida — 1) correspondência exata normalizada única → usa; 2) senão, fuzzy única → usa; 3) duas ou mais → `ambigua` (nunca escolhe); 4) nenhuma → `nao_encontrada`. `normalizarNome` remove acento/caixa para a comparação exata.

Aplicado em:
- **`lib/tarefas-ai-tools.ts`**: obra, projeto, responsável, e a própria tarefa (`acharTarefa`, usada por `get_task/update_task/complete_task/reopen_task/cancel_task/suggest_task_change`).
- **`lib/ai-obra-tools.ts`**: `resolveObraSegura` (exportada, reaproveitada pelo webhook — ver abaixo) e `acharItem` (serviço→subetapa→etapa do cronograma) — agora, dentro de cada nível, ambiguidade não cai mais silenciosamente para o nível de baixo nem aplica avanço em nenhum item; só cai de nível quando não há **nenhuma** correspondência.
- **`lib/projeto-ai-tools.ts`**: `resolveProjetoSegura` e `findItem` (disciplina/item/subitem) — usado por `criar_item`, `criar_subitem`, `renomear_item`, `excluir_item`, `alterar_item`, `alterar_predecessoras` (inclusive cada nome de predecessora individualmente), `marcar_concluido`.
- **`app/api/whatsapp/webhook/route.ts`**: os 6 pontos que ainda faziam `ilike(...).limit(1)` direto (`criar_projeto`, `atualizar_status_obra`, `listar_etapas`, `criar_etapa`, `listar_materiais`, `adicionar_material`) agora passam por um helper local `obraOuMensagem()` que reaproveita `resolveObraSegura` de `lib/ai-obra-tools.ts`. `criar_projeto` é o único caso onde "não encontrada" continua sendo um não-erro (obra é opcional ali, comportamento preservado) — só "ambígua" bloqueia e pede desambiguação, porque não dá para vincular "a mais provável" em silêncio.

**Exemplo obrigatório do pedido, verificado**: existem hoje 5 obras diferentes cujo nome bate em `%Allegra%` em produção (achado já na rodada anterior). Com a correção, `"muda a tarefa da Allegra"` sem mais contexto **não escolhe nenhuma** — devolve a lista de candidatas e pede qual.

**Fora do escopo desta rodada, documentado**: `lib/ai-obra-tools.ts`/`lib/projeto-ai-tools.ts` já tinham esse padrão inseguro corrigido nesta própria rodada (ver acima) — ou seja, o item que a rodada anterior deixou como "observação fora de escopo" foi endereçado agora, junto com o resto.

### 2.3 Aprovação real para sugestões da Luiza (item 3)

**Avaliação do reaproveitamento pedido**: `lib/luizia-work.ts` foi lido e descartado como mecanismo direto — ele é um contrato de rascunho **mantido pelo cliente** (o browser reenvia o draft assinado a cada mensagem do widget Chat/Work); o WhatsApp não tem cliente nenhum guardando estado entre mensagens — cada `POST` no webhook é *stateless*, só o histórico de texto persiste em `luizia_wa_messages`. Não dava para reaproveitar sem reconstruir esse mecanismo do zero para um transporte sem sessão contínua. **Implementado o menor mecanismo persistente possível**, como o prompt previu para esse caso:

- **Migration**: tabela `luizia_pending_task_actions` (`id, conversation_key, profile_id, actor, origem, tool, argumentos jsonb, descricao, status, created_at, expires_at, resolved_at`) — exatamente os campos mínimos pedidos. TTL de 30 minutos. RLS ligado, **zero policies** (só `service_role`, usado pelas rotas de API, acessa — nem `anon` nem `authenticated` alcançam).
- **3 tools novas** em `lib/tarefas-ai-tools.ts`:
  - `suggest_task_change(titulo, acao, novo_prazo?, nova_prioridade?, novo_responsavel_nome?, novo_status?, justificativa?)` — resolve a tarefa com segurança, monta o mesmo patch que `update_task`/`complete_task`/etc. montariam (reaproveita `construirPatchEdicao`/`patchStatus`, garantindo que a proposta mostrada é *exatamente* o que será executado depois — sem re-derivar nada), grava em `luizia_pending_task_actions` com `status='pending'`, devolve o texto da sugestão terminando em pergunta. **Nunca escreve em `tarefas`.**
  - `confirm_pending_action(pending_id?, titulo?)` — acha a proposta pendente (pelo id; senão por título, se ambíguo; senão exige que haja exatamente uma ativa na conversa) e só então aplica o patch **armazenado** (não um novo, re-perguntado à LLM) via o mesmo caminho de escrita usado pela execução direta (`aplicarPatchTarefa`), loga normalmente, marca a proposta `executed`.
  - `reject_pending_action(pending_id?, titulo?)` — marca `rejected`, nunca escreve.
- **Regra codificada, não só no prompt**: `update_task`/`complete_task`/`reopen_task`/`cancel_task` continuam existindo para ordens diretas — a trava real está em `suggest_task_change` só gravar proposta (nunca chamar `.update()` em `tarefas`) e em `confirm_pending_action` ser o único caminho que transforma uma proposta em escrita real, sempre reexecutando o patch armazenado, nunca um novo.
- **Persona (WhatsApp e obra-ai)** atualizada para instruir: ordem explícita nesta mensagem → tool direta; sugestão sua → `suggest_task_change`; confirmação ("sim"/"pode") → `confirm_pending_action`; recusa → `reject_pending_action`; se o usuário mudar parâmetros ao confirmar ("sim, mas passa pra terça") → tratar como ordem nova (`update_task` direto), não como confirmação.

**Limite honesto (não escondido)**: a arquitetura é function-calling — quem decide QUAL tool chamar continua sendo o modelo, a cada turno. O código garante que, **se** o modelo seguir a instrução e chamar `suggest_task_change` para uma sugestão própria, ela é fisicamente incapaz de escrever sozinha nessa chamada — isso é a trava real pedida. O que o código não pode impedir é o modelo chamar `update_task` diretamente por engano quando deveria ter usado `suggest_task_change` (nenhuma arquitetura de function-calling atual consegue). Esse resíduo é o mesmo que já existia para toda ambiguidade nesta e nas rodadas anteriores, e só o teste end-to-end real confirma o comportamento observado na prática.

### 2.4 Auditoria confiável (item 4)

Migration: `drop policy bs_mvp_insert_all/bs_mvp_select_all` + `revoke all on luizia_tarefas_log from anon, authenticated`. Confirmado ao vivo (ver seção 5) que restam **zero** grants para essas roles e **zero** policies na tabela — só `service_role` (usado nas rotas de API) consegue ler/escrever. Nenhuma UI cliente lia essa tabela antes (confirmado por grep em `admin-luiza/page.tsx`), então nada quebrou. O mesmo lock-down (RLS sem policy, zero grants) foi aplicado desde a criação em `luizia_pending_task_actions`.

### 2.5 Resumo diário — decisão de produto (item 5)

Confirmado e mantido como estava: tarefa atrasada continua aparecendo em todo resumo enquanto seguir atrasada (sem dedup permanente por tarefa) — decisão do usuário, não uma correção. Nenhuma mudança aqui.

**Corrigido**: "Enviar agora" quando não há conteúdo relevante **não envia mais WhatsApp real** — a API retorna `{ ok: true, sent: false, reason: 'sem_tarefas_relevantes' }`, o painel mostra "Nenhuma tarefa relevante para enviar." e o log grava `(sem tarefas relevantes)` com `status='ok'` só para histórico interno, sem chamar `sendZApiText`.

### 2.6 Dispatch pessoal sem fuzzy de nome (item 6)

`resolveResponsavelDispatch` reescrito: resumo por **obra** (`obraIdFiltro` setado) não exige vínculo — filtra só por obra, como antes. Resumo **pessoal** (sem obra) agora exige `destino_phone → luizia_wa_phone_rules.profile_id → tarefas.responsavel_id`; se o telefone de destino não estiver vinculado, `gerarResumoTarefas` devolve `{ conteudo: '', erro: '...' }` e o disparo (manual ou automático) registra **erro de configuração** no log, sem enviar nada e sem adivinhar por nome.

### 2.7 "Minhas tarefas" — validado (item 7)

Ver seção 2.1 + testes automatizados (seção 4) cobrindo exatamente os 4 casos pedidos: "o que tenho hoje" (pessoal, com/sem vínculo), "quais tarefas tem na Allegra" (por obra, com desambiguação se ambíguo), "o que o Gabriel tem" (responsável explícito).

---

## 3. Arquivos e migrations

**Novos:**
- `lib/ai-resolve.ts` — algoritmo de resolução segura (compartilhado).
- `lib/luizia-pending-actions.ts` — CRUD de propostas pendentes.
- `lib/__tests__/fake-supabase.ts` — cliente Supabase falso em memória, só para teste.
- `lib/__tests__/ai-resolve.test.ts`, `lib/__tests__/tarefas-ai-tools.test.ts` — testes unitários.
- `app/api/whatsapp/dispatch/__tests__/dispatch.test.ts` — testes unitários do resumo/resolução de responsável do dispatch.
- `vitest.config.mts` — config mínima (só o alias `@/*`, espelhando o `tsconfig.json`).
- `supabase/migrations/20260821120000_luizia_hardening_v1_1.sql`.

**Modificados:**
- `lib/tarefas-ai-tools.ts` — resolução segura, `profileId`/`conversationKey` no `TarefasAiCtx`, "minhas tarefas", 3 tools novas, `aplicarPatchTarefa` compartilhado.
- `lib/ai-obra-tools.ts` — `resolveObraSegura` (exportada), `acharItem` seguro, `registrar_rdo`/`atualizar_avanco` não aplicam mais avanço em correspondência ambígua.
- `lib/projeto-ai-tools.ts` — `resolveProjetoSegura` (exportada), `findItem` seguro em todos os 7 call sites de escrita.
- `app/api/whatsapp/webhook/route.ts` — `phoneProfileId`, `conversationKey=lookupPhone`, `obraOuMensagem()` helper, persona atualizada.
- `app/api/obra-ai/route.ts` — `conversationKey='obra_ai:{obraId}'`, persona atualizada.
- `app/api/whatsapp/dispatch/route.ts` — `resolveResponsavelDispatch`/`gerarResumoTarefas` por telefone, "Enviar agora" não manda placeholder, funções exportadas para teste.
- `app/(app)/admin-luiza/page.tsx` — seletor de perfil no editor de contato, tratamento de `sent:false/reason` no "Enviar agora".
- `package.json` — `vitest` como devDependency, script `test`.

**Migration**: `20260821120000_luizia_hardening_v1_1.sql` — aplicada ao vivo via `apply_migration`, mirror local escrito e conferido (colunas/tabela/grants verificados via `information_schema` após aplicar — ver seção 5).

---

## 4. Testes automatizados (isolados, sem SQL destrutivo em produção)

Conforme pedido explicitamente ("não fazer nova bateria destrutiva direta em produção; criar testes de código"), instalei `vitest` (zero dependências de rede) e construí um cliente Supabase falso em memória (`fake-supabase.ts`) que implementa só o subconjunto de operações (`select/insert/update/eq/ilike/in/order/limit/single/maybeSingle`) que o código realmente usa — permitindo testar a lógica real (`execTarefasAiTool`, `resolveResponsavelDispatch`, `gerarResumoTarefas`) sem tocar a rede nem produção.

**29 testes, todos passando** (`npm run test` / `npx vitest run`):

| # | Item pedido | Onde | Resultado |
|---|---|---|---|
| 1 | Entidade exata única | `ai-resolve.test.ts` | PASSOU |
| 2 | Fuzzy único | `ai-resolve.test.ts` | PASSOU |
| 3 | Fuzzy com 2+ candidatos → ambiguidade | `ai-resolve.test.ts` | PASSOU |
| 4 | Nenhuma entidade → não encontrado | `ai-resolve.test.ts` | PASSOU |
| 5 | "Minhas tarefas" usa profile_id do remetente | `tarefas-ai-tools.test.ts` | PASSOU |
| 6 | Telefone sem profile_id não adivinha | `tarefas-ai-tools.test.ts` | PASSOU |
| 7 | Ordem explícita pode escrever | `tarefas-ai-tools.test.ts` (create_task + update_task) | PASSOU |
| 8 | Sugestão da Luiza não escreve | `tarefas-ai-tools.test.ts` | PASSOU |
| 9 | Confirmação executa proposta pendente | `tarefas-ai-tools.test.ts` | PASSOU |
| 10 | Rejeição não escreve | `tarefas-ai-tools.test.ts` | PASSOU |
| 11 | Proposta expirada não executa | `tarefas-ai-tools.test.ts` | PASSOU (achou e corrigiu bug real — ver seção 6) |
| 12 | Duas propostas pendentes exigem desambiguação | `tarefas-ai-tools.test.ts` | PASSOU |
| 13 | Audit log é criado em escrita | `tarefas-ai-tools.test.ts` | PASSOU |
| 14 | Cliente anon não consegue fabricar audit log | verificado via `information_schema` (não é testável por mock — é uma garantia de RLS/grant do banco) | PASSOU (verificação estrutural, seção 5) |
| 15 | Resumo diário repete atrasada em dias diferentes | decisão de produto confirmada (seção 2.5), sem código para testar (é ausência de dedup, deliberada) | N/A — comportamento confirmado por leitura de código |
| 16 | Não duplica no mesmo ciclo | mecanismo já existente (`next_run_at`), inalterado nesta rodada — não há disparo real cadastrado em produção para reproduzir um ciclo completo | Verificado por leitura de código, não por execução ao vivo |
| 17 | "Enviar agora" sem tarefas não chama Z-API | revisão de código (branch corrigida retorna antes de `sendZApiText`) — não testado via mock HTTP porque a rota faz `createClient()` real no module scope, fora do escopo de mock deste round | Verificado por leitura de código |
| 18 | Dispatch pessoal usa profile_id, não nome fuzzy | `dispatch.test.ts` | PASSOU |
| 19 | Reprogramar tarefa NÃO altera Planejamento | `tarefas-ai-tools.test.ts` (assert de que só as tabelas `tarefas`/`luizia_tarefas_log`/`luizia_pending_task_actions`/`obras`/`profiles` são tocadas) | PASSOU |
| 20 | tsc/lint/build | `npx tsc --noEmit`, `npm run build`, `npx eslint` nos arquivos tocados | PASSOU (ver seção 5) |

Título dos itens 16/16 (ambíguo/inexistente) e a bateria de identidade/CRUD original (V1) não foram re-testados via SQL nesta rodada — já tinham bateria própria na rodada anterior e a lógica de `list_tasks`/filtros não mudou, só ganhou o wrapper de "minhas tarefas" (testado aqui).

---

## 5. Verificação estrutural em produção (somente leitura + uma migration)

- `information_schema.columns`: `luizia_wa_phone_rules.profile_id` existe.
- `information_schema.tables`: `luizia_pending_task_actions` existe.
- `information_schema.role_table_grants` para `anon`/`authenticated` em `luizia_tarefas_log` e `luizia_pending_task_actions`: **0 linhas** (antes: `luizia_tarefas_log` tinha 7 privilégios para cada role).
- `pg_policies` em `luizia_tarefas_log`: **0 policies** (antes: 2).
- `luizia_wa_dispatches`: 0 disparos cadastrados em produção (confirmado — nenhum foi criado/inventado nesta rodada, conforme instrução explícita).
- `luizia_wa_phone_rules` com `profile_id` preenchido: 0 (o vínculo é manual, feito pelo admin no painel — nenhum foi inventado).

`npx tsc --noEmit`: 0 erros. `npm run build`: build limpo, todas as rotas geradas (incluindo `/tarefas`, `/api/whatsapp/webhook`, `/api/whatsapp/dispatch`). `npx eslint` nos 9 arquivos tocados/novos: nenhum erro novo — os erros `@typescript-eslint/no-explicit-any` remanescentes são 100% do padrão pré-existente e aceito neste projeto (`Args = Record<string, any>`), incluindo no fixture de teste (que precisa imitar o query builder dinâmico do Supabase); `admin-luiza/page.tsx` mantém exatamente os mesmos 5 erros + 1 warning de antes desta rodada (confirmado com um `eslint` isolado nesse arquivo).

---

## 6. Bug real encontrado e corrigido durante os testes

Ao escrever o teste "#11 — proposta expirada não executa", a primeira versão de `acharPendenteParaResolver` (sem `pending_id`) devolvia `{ tipo: 'nenhuma' }` — "não encontrei nenhuma sugestão pendente" — quando a **única** proposta da conversa tinha expirado, em vez de `{ tipo: 'expirada' }` — "essa sugestão expirou". Comportamentalmente ambos não executam (o requisito de segurança estava satisfeito), mas a mensagem era menos honesta com o usuário. Corrigido: `acharPendenteParaResolver` agora distingue "nunca houve proposta" de "havia proposta(s), mas todas expiraram", e devolve a mensagem certa em cada caso. Documentado aqui como exemplo de que o teste automatizado achou um problema real de qualidade, não só validou o já esperado.

---

## 7. Pendências e riscos remanescentes

- **Nenhum telefone está vinculado a um profile em produção ainda** — é o primeiro passo manual antes do teste end-to-end (seção 8), feito pelo admin no painel.
- **Resíduo arquitetural da seção 2.3**: a distinção "ordem explícita" vs. "sugestão minha" continua dependendo do modelo escolher a tool certa — o código trava a CONSEQUÊNCIA (sugestão nunca escreve sozinha), não a DECISÃO de qual tool chamar. Só o teste real confirma na prática.
- **Itens 15-17 da bateria** (dedup de resumo diário, "não duplica no mesmo ciclo", "Enviar agora sem tarefas não chama Z-API") foram verificados por leitura de código, não por teste automatizado — não há disparo real cadastrado para reproduzir um ciclo, e mockar a rota de dispatch completa (que instancia `createClient()` no escopo do módulo) ficaria fora do custo-benefício desta rodada de hardening.
- **`obra_ai` não tem "minhas tarefas"** — só o WhatsApp tem identidade de remetente (telefone). Se o widget in-app precisar disso no futuro, precisaria de uma noção de usuário logado que hoje não existe nesse fluxo.
- **`lib/luizia-work.ts` continua não integrado às Tarefas** — decisão mantida da rodada anterior, não revisitada aqui (fora do pedido desta rodada).

---

## 8. Roteiro exato para o teste end-to-end real (NÃO executado — aguardando o usuário)

**Pré-requisito (fazer primeiro, manual, no painel):** em `/admin-luiza` → aba Conversas, selecionar a conversa do número de teste e escolher o perfil correspondente em "Vincular a um perfil do BuildSmart", depois Salvar.

A. Enviar pelo WhatsApp: *"Crie uma tarefa chamada TESTE E2E LUIZA para hoje, prioridade alta."*
B. Conferir: tarefa criada (`create_task` — ordem explícita, executa direto), `responsavel_id` correto (se foi informado responsável) ou null, log criado em `luizia_tarefas_log` com `acao='criar'`, `resultado='ok'`.
C. Perguntar: *"o que tenho hoje?"* — deve retornar a tarefa real, filtrada automaticamente pelo `profile_id` vinculado (sem perguntar "quem é você").
D. Dizer: *"passa a TESTE E2E LUIZA para amanhã."* — ordem explícita, `update_task` direto.
E. Conferir banco: `data_prazo` mudou, log `acao='editar'` novo.
F. **Criar situação para a Luiza sugerir** (ex.: deixar uma tarefa com prazo vencido e perguntar algo que a leve a notar/recomendar mudança) — ela deve chamar `suggest_task_change`, responder com o texto da sugestão terminando em pergunta, e o banco **não pode mudar** nesse momento (conferir: `data_prazo` da tarefa inalterado, uma linha nova em `luizia_pending_task_actions` com `status='pending'`).
G. Responder *"sim"* — deve chamar `confirm_pending_action`; conferir: `data_prazo` agora mudou, log `acao='editar'` criado, `luizia_pending_task_actions.status='executed'`.
H. Dizer: *"marca TESTE E2E LUIZA como concluída."*
I. Conferir banco/log: `status='concluida'`, `concluida=true`, `concluida_em` preenchido, log `acao='concluir'`.
J. Testar resumo de tarefas controlado: no painel, criar um disparo `tipo=resumo_tarefas` apontando para o número de teste vinculado, clicar "Enviar agora" — **isso envia WhatsApp real**, só fazer com autorização explícita no momento. Confirmar que aparece corretamente formatado (🔴 para atrasada, etc.) e que, se não houver nada relevante, a mensagem "Nenhuma tarefa relevante para enviar." aparece no painel **sem** WhatsApp ser enviado.

**Não executar nenhum destes passos sozinho** — preparado, aguardando o usuário.

---

## 9. Commit / branch

Branch: `previsoes/prazo-fornecimento-material`. Commit desta rodada separado do commit da rodada anterior (Luiza × Tarefas V1, `dbe780af`), contendo só os arquivos listados na seção 3 + este relatório.
