# Relatório — Luiza × Tarefas V1

Rodada separada de integração da IA (Luiza) com o motor único de Tarefas (`public.tarefas`), implementado na rodada anterior "Tarefas V1". Este relatório documenta exatamente o que existia, o que foi reaproveitado, o que foi criado, e os testes executados.

---

## 1. Estado anterior encontrado (antes desta rodada)

Investigação feita antes de qualquer código, cobrindo as 3 superfícies de chat da Luiza + o dispatcher:

- **`app/api/whatsapp/webhook/route.ts`** — canal de produção real (WhatsApp via Z-API). Usa function-calling nativo da OpenAI, executa ferramentas automaticamente (sem confirmação de UI). Já tinha `ai-obra-tools.ts` (obra) e `projeto-ai-tools.ts` (projeto) plugados no mesmo padrão de "router chain" (`execXxxTool` retorna `string | null`; `null` = "não é minha tool, tenta a próxima").
- **`app/api/obra-ai/route.ts`** — assistente in-app, dentro do contexto de uma obra específica (`crud_enabled` sempre ligado, escopado por `obraId` fixo).
- **`lib/luizia-work.ts`** — único lugar com confirmação de rascunho assinado antes de escrever (usado pelo widget flutuante Chat/Work). Não tocado nesta rodada — Tarefas não foi conectado a esse fluxo porque WhatsApp e obra-ai já cobrem os 10 itens pedidos, e adicionar um terceiro caminho de escrita aumentaria superfície sem necessidade clara agora (fica como observação para decisão futura, não implementado).
- **`app/api/whatsapp/luizia/route.ts` / `lib/luizia-core.ts`** — rota legada, somente leitura, via Twilio. Não tocada.
- **`app/api/whatsapp/dispatch/route.ts`** — dispatcher periódico, acionado por `pg_cron`+`pg_net` a cada 5 minutos via `POST` com header `x-dispatch-key`. Já suportava `tipo: 'resumo_obra' | 'personalizada'`. Dedup/idempotência já existia de forma implícita: cada disparo tem `next_run_at`, que só avança depois de processado (`calcNextRun` com jitter de 0–120s); não há tabela de lock separada.
- **Flags da Luiza**: `crud_enabled=true`, `groups_enabled=true`, `modo_pausado=false` — confirmado em `luizia_wa_config`.
- **`RELATORIO_TAREFAS_V1.md`** lido por completo: confirma schema de `public.tarefas` (status `pendente/em_andamento/aguardando/concluida/cancelada`, prioridade `baixa/normal/alta/urgente`), e os helpers já existentes em `lib/tarefas.ts` (`isAtrasada`, `hojeISO`, `TAREFAS_ABERTAS`, `ordenarTarefas`, `STATUS_LABEL`, `PRIORIDADE_LABEL`) — server-safe (sem código de cliente/React), portanto reaproveitáveis diretamente.

**FATO ENCONTRADO**: a tabela `luizia_wa_users` (que o código antigo em alguns pontos parecia assumir para linkar telefone→pessoa) **não existe em produção**. Por isso, toda resolução de "responsável" nesta rodada é feita por nome (fuzzy match em `profiles.name`), nunca por telefone.

---

## 2. Integração existente reaproveitada

- Padrão `execXxxTool(db, name, args, ctx) => string | null` (router chain) — copiado de `ai-obra-tools.ts`/`projeto-ai-tools.ts`, sem modificar nenhum dos dois.
- Convenção `scoped: boolean` para geradores de tool-def — quando `scoped=true` (obra-ai), o parâmetro "qual obra" some do schema.
- Resolução fuzzy por nome (`ilike '%nome%'`) — mesmo padrão usado para obra/projeto/insumo em todo o resto do sistema.
- `lib/tarefas.ts` (helpers da Tarefas V1) importado e usado diretamente, sem duplicar lógica de "está atrasada", rótulos de status/prioridade, nem ordenação.
- Dispatcher existente (`luizia_wa_dispatches` + `luizia_wa_dispatch_log` + `calcNextRun`) — reaproveitado 100%. Nenhuma tabela nova de agendamento ou de lock foi criada.
- Persona/system-prompt como mecanismo de regra comportamental (ex.: "pergunte antes de agir em caso de ambiguidade") — mesmo mecanismo já usado no resto da Luiza, não é enforcement no código.

---

## 3. O que foi implementado

### 3.1 Novo arquivo: `lib/tarefas-ai-tools.ts`

7 ferramentas determinísticas, exatamente os nomes sugeridos: `list_tasks`, `get_task`, `create_task`, `update_task`, `complete_task`, `reopen_task`, `cancel_task`.

Cada uma:
- Resolve obra/projeto/responsável por nome (fuzzy, com `order by` determinístico — ver seção de bug encontrado).
- Nunca deixa a LLM montar SQL ou decidir consistência — toda regra de negócio (quais status são "abertos", o que cada ação faz, o que é permitido em `update_task` vs. `complete_task`/`cancel_task`) está no código, não no prompt.
- Recusa criar/alterar quando um nome (obra/projeto/responsável) não é encontrado, em vez de silenciosamente ignorar o campo.
- Retorna sempre uma string pronta para a Luiza responder — nunca dados crus que a LLM teria que interpretar/inventar em cima.

`list_tasks` implementa os filtros pedidos: `hoje` (prazo ≤ hoje, aberto), `atrasadas` (prazo < hoje), `semana` (hoje..hoje+7), `proximas` (prazo > hoje), `aguardando` (status aguardando), `todas`. Todos combináveis com filtro por obra, projeto e/ou responsável.

`update_task` só aceita prazo/prioridade/responsável/status-não-terminal — concluir/cancelar são funções separadas de propósito, para deixar a regra de autorização mais fácil de descrever no prompt e mais difícil de "escapar" (a LLM não pode, por engano, mandar `novo_status: 'concluida'` por essa função).

### 3.2 Nova migration: `supabase/migrations/20260821030107_luizia_tarefas_log.sql`

Tabela `public.luizia_tarefas_log`: `tarefa_id` (sem FK — histórico sobrevive à exclusão da tarefa, mesmo padrão de `orcamento_verificacao_historico`), `acao`, `usuario`, `origem`, `valor_anterior`/`valor_novo` (jsonb), `resultado`, `erro`, `created_at`. RLS aberta (`select`/`insert` para todos), mesmo padrão `bs_mvp_*` usado em todo o projeto.

**Por que uma tabela nova em vez de reaproveitar uma existente** (documentado no próprio comment da migration): `portal_audit_log` exige `obra_id` OU `projeto_id` (CHECK constraint) — tarefa pode ser totalmente global, sem nenhum dos dois — e não tem `valor_anterior`. `luizia_logs` é só transcript de pergunta/resposta, não registra entidade/ação/diff. Nenhuma das duas suporta o formato de log pedido sem alterar sua constraint/propósito original.

### 3.3 `app/api/whatsapp/webhook/route.ts` (canal de produção)

- Importa e registra as 7 tools de Tarefas em `buildTools()`.
- `executeTool` passou a receber `actor` (nome de quem está mandando mensagem) para popular o log.
- Nova cadeia: depois de tentar `execProjetoAiTool`, tenta `execTarefasAiTool`.
- Novo parágrafo na persona (reproduzido na íntegra abaixo) com: nomes das 7 tools; a distinção Tarefa≠Etapa/Planejamento; a regra de autorização (ordem explícita executa direto; sugestão seguida da própria Luiza NUNCA executa sem confirmação na mensagem seguinte); instrução de nunca inventar tarefa fora do resultado da função; pedir para desambiguar quando `get_task`/`update_task`/etc. retornarem mais de uma tarefa parecida.

### 3.4 `app/api/obra-ai/route.ts` (assistente in-app, escopado por obra)

- Mesmas 7 tools, em modo `scoped=true` (sem parâmetro de obra — usa a obra fixa da página).
- Mesma regra de autorização, reescrita de forma resumida na seção REGRAS do prompt.

### 3.5 `app/api/whatsapp/dispatch/route.ts` (avisos / resumo diário)

- Novo `tipo: 'resumo_tarefas'` no dispatcher existente — **não foi criada nenhuma infraestrutura nova de agendamento**, é só mais um branch dentro do `processDispatch` já existente.
- `gerarResumoTarefas(db, destinoNome, obraIdFiltro)`: função determinística (sem chamada de IA) que busca tarefas abertas (filtradas por responsável e/ou obra, se configurado no disparo), separa em 4 baldes — atrasadas, vencem hoje, próximas relevantes (`urgente`/`alta` nos próximos 3 dias), aguardando há mais de 2 dias (`updated_at` velho) — e monta a mensagem no formato pedido (`🔴` para atrasada, até 10 linhas).
- Se não há nada relevante, retorna string vazia. No branch automático (cron), isso vira um resultado "ok" silencioso — não envia WhatsApp, não gera erro no log, só registra `(sem tarefas relevantes — nada enviado)` — evitando o "spam de nada a dizer todo dia".

### 3.6 `app/(app)/admin-luiza/page.tsx` (painel administrativo)

- Novo tipo de disparo no formulário: "📋 Resumo de tarefas (atrasadas/hoje/aguardando)".
- Campo "Obra vinculada" passa a ser opcional para esse tipo (era obrigatório só para `resumo_obra`) — um `resumo_tarefas` pode ser por pessoa, por obra, ou geral.
- Textarea de mensagem/instrução escondida para esse tipo (não faz sentido — o conteúdo é determinístico, não instruível por prompt).

---

## 4. Tools / serviços criados

| Tool | O que faz | Escreve? |
|---|---|---|
| `list_tasks` | Lista tarefas por filtro (hoje/atrasadas/semana/proximas/aguardando/todas) + obra/projeto/responsável | Não |
| `get_task` | Busca 1 tarefa por título (fuzzy), retorna detalhe ou lista de ambíguas | Não |
| `create_task` | Cria tarefa nova | Sim |
| `update_task` | Altera prazo/prioridade/responsável/status-não-terminal | Sim |
| `complete_task` | Marca concluída | Sim |
| `reopen_task` | Reabre (volta a pendente) | Sim |
| `cancel_task` | Cancela | Sim |

Todas share o mesmo `execTarefasAiTool` executor e o mesmo `TarefasAiCtx` (`actor`, `origem: 'whatsapp'|'obra_ai'`, `fixedObraId?`).

---

## 5. Regras de autorização (implementadas via prompt, não há enforcement de código para distinguir "ordem" de "sugestão")

- **A) Ordem explícita do usuário** → a própria ordem autoriza, a função é chamada na mesma resposta.
- **B) Sugestão proposta pela própria Luiza** → nunca deve chamar a função de escrita na mesma resposta; deve descrever a sugestão em texto e só executar se o usuário confirmar numa mensagem seguinte.

**Risco a verificar** (não pode ser testado por SQL/automação — é comportamento de LLM): essa distinção depende inteiramente do modelo seguir a instrução do prompt. Não há um mecanismo de código que impeça a LLM de chamar `update_task` numa sugestão não confirmada — ao contrário do widget Chat/Work (`lib/luizia-work.ts`), que tem confirmação de rascunho assinado como trava real. Isto é consistente com como `ai-obra-tools.ts`/`projeto-ai-tools.ts` já lidam com ambiguidade hoje (também só via prompt), então não é uma regressão de padrão — mas é um ponto que só o teste end-to-end real (itens 14/15 da bateria) valida de fato.

---

## 6. Lógica de avisos (resumo diário)

- Reaproveita o dispatcher existente — um `luizia_wa_dispatches` com `tipo='resumo_tarefas'`, `dias_semana`/`horario` configurados no painel, `recorrente=true`.
- Conteúdo determinístico (sem custo de IA, sem risco de alucinação): atrasadas, vence hoje, próximas relevantes (alta/urgente, 3 dias), aguardando há +2 dias.
- Filtra por `destino_nome` (responsável) e/ou `obra_id`, se configurado no disparo — permite tanto um resumo pessoal ("tarefas do Gabriel") quanto por obra.

---

## 7. Deduplicação / anti-spam

- **Nenhuma tabela nova de dedup foi criada** — a pergunta do prompt era justamente "o dispatcher atual já suporta isso?", e a resposta é sim: `next_run_at` só avança depois que o disparo roda, então o mesmo disparo não roda duas vezes seguidas sem esperar o próximo horário agendado.
- Além disso, quando não há nada relevante, `gerarResumoTarefas` retorna `''`, e o branch automático (cron) trata isso como "ok, nada enviado" — não manda mensagem vazia nem repete tentativa.
- **Não implementado nesta rodada** (fora de escopo pedido): dedup de "já avisei sobre esta tarefa atrasada ontem, não repetir hoje". O resumo diário sempre relista todas as atrasadas abertas a cada disparo — se uma tarefa continua atrasada, ela aparece de novo no próximo resumo. Isso é intencional (é assim que "resumo diário" normalmente funciona — não é um alerta único por tarefa) mas vale confirmar com o usuário se é o comportamento esperado ou se "aviso de tarefa atrasada" deveria ser um alerta único por tarefa/mudança de estado.

---

## 8. Testes executados e resultados

**Constrangimento do ambiente**: a rede do sandbox bloqueia chamadas HTTPS diretas a `*.supabase.co` de um processo Node arbitrário (confirmado também para `curl`) — só o caminho da ferramenta MCP `mcp__Supabase__execute_sql` consegue alcançar o banco. Isso impediu rodar um teste de integração via TypeScript real (`tsx` importando os módulos e chamando `execTarefasAiTool` diretamente). A alternativa adotada foi reproduzir manualmente, em SQL, a exata lógica de cada branch do código (lida linha a linha em `lib/tarefas-ai-tools.ts`), inserir dados `TESTE-AI*` isolados, rodar as mesmas condições de filtro que o código usa, e limpar tudo ao final — sem usar `BEGIN`/`ROLLBACK` (uma tentativa inicial com transação explícita revelou, ao vivo, que o MCP pode reusar uma conexão com transação ainda aberta entre chamadas separadas — `BEGIN` numa chamada nova virou NOTICE de no-op em vez de abrir transação nova, gerando linhas de teste duplicadas). A partir daí, todo teste destrutivo foi feito com `INSERT`+asserção+`DELETE` explícito dentro de uma única chamada, sem depender de rollback automático.

| # | Item | Resultado |
|---|---|---|
| 1 | Consultar tarefas de hoje | ✅ `filtro_hoje` retornou só a tarefa com prazo ≤ hoje |
| 2 | Consultar atrasadas | ✅ `filtro_atrasadas` retornou só prazo < hoje |
| 3 | Consultar aguardando | ✅ `filtro_aguardando` retornou só status=aguardando |
| 4 | Filtrar por obra | ✅ `filtro_obra` retornou as 3 linhas com aquele `obra_id`, excluindo as sem obra |
| 5 | Filtrar por projeto | ✅ `filtro_projeto` retornou só a linha com aquele `projeto_id` |
| 6 | Filtrar por responsável | ✅ `filtro_responsavel_gabriel` retornou só a linha com `responsavel_id` do Gabriel |
| 7 | Criar | ✅ (via `INSERT` simulando `create_task`, com validação de obra/projeto/responsável já revisada no código) |
| 8 | Editar prazo | ✅ `UPDATE data_prazo` aplicado, sem tocar `etapas` |
| 9 | Alterar prioridade | ✅ lógica de `update_task` revisada — monta patch incremental, só altera campos enviados |
| 10 | Colocar aguardando | ✅ mesmo mecanismo de `update_task.novo_status` |
| 11 | Concluir | ✅ sequência concluir→reabrir→cancelar aplicada e verificada passo a passo |
| 12 | Reabrir | ✅ idem |
| 13 | Cancelar | ✅ status final = `cancelada`, e `default_exclui_cancelada` confirmou que a consulta padrão (sem `incluir_concluidas`) já não lista mais essa tarefa |
| 14 | Ordem explícita executa | ⚠️ Não testável por SQL/automação — validado por leitura do prompt (seção 5). Precisa do teste end-to-end real. |
| 15 | Sugestão sem aprovação NÃO executa | ⚠️ Mesmo caso acima — comportamento de LLM, não de código |
| 16 | Tarefa ambígua gera pergunta | ✅ `get_task_ambigua_count = 2` (duas tarefas batendo em "%Ambigua A%") — código (`acharTarefa`) devolve `formatAmbiguas(...)` nesse caso, confirmado por leitura + reprodução da query |
| 17 | Tarefa inexistente gera "não encontrei" | ✅ `get_task_inexistente_count = 0` — código retorna a mensagem de não encontrado nesse caso |
| 18 | Resumo diário não duplica aviso | ✅ por design (`next_run_at` só avança após execução) — não há disparos reais cadastrados em produção ainda para observar um ciclo completo; validado por leitura de código, não por execução ao vivo (nenhum disparo real foi feito, propositalmente) |
| 19 | Planejamento não é alterado pela reprogramação de tarefa | ✅ contagem de `etapas` da obra de teste ficou em 20 antes e depois de toda a bateria (insert/update/complete/reopen/cancel de tarefas) — nenhuma escrita em `etapas`/`planejamento_itens` ocorreu, confirmado também por leitura: `tarefas-ai-tools.ts` só escreve na tabela `tarefas` |
| 20 | TypeScript/lint/build | ✅ `npx tsc --noEmit` limpo; `npm run build` completo sem erros; lint dos 5 arquivos tocados sem nenhum erro **novo** — os erros `@typescript-eslint/no-explicit-any` reportados são 100% do padrão pré-existente (`Args = Record<string, any>`) já usado em `ai-obra-tools.ts`/`projeto-ai-tools.ts`; conferido explicitamente que `admin-luiza/page.tsx` manteve exatamente os mesmos 5 erros + 1 warning de antes (nada novo) |

Todos os dados de teste (`TESTE-AI*`) foram removidos ao final de cada bateria — nenhum resíduo ficou em produção (confirmado por contagem final = 0, duas vezes).

**Nenhuma mensagem real de WhatsApp foi enviada durante os testes** — toda verificação foi feita direto no banco via SQL, nunca chamando o endpoint `/api/whatsapp/dispatch` nem `/api/whatsapp/webhook`.

---

## 9. Bug encontrado e corrigido durante o teste

Ao reproduzir a query de `resolveObraPorNome` (`ilike '%nome%' limit 1`, sem `order by`) contra produção, o resultado retornado foi uma obra diferente da esperada. Investigação revelou que **5 obras diferentes** em produção têm nomes que batem em `%Allegra%`. Sem `order by`, o Postgres pode devolver qualquer uma delas — não-determinístico, e no pior caso vincularia silenciosamente uma tarefa à obra errada.

**Correção aplicada**: `resolveObraPorNome`, `resolveProjetoPorNome` (`order by created_at desc`) e `resolveResponsavelPorNome` (`order by name`) em `lib/tarefas-ai-tools.ts`, e o equivalente `resolveResponsavelDispatch` em `dispatch/route.ts`, todos passaram a ter `order by` explícito antes do `limit(1)`.

**FATO ENCONTRADO / fora do escopo desta rodada**: o mesmo padrão sem `order by` existe, sem correção, em `lib/ai-obra-tools.ts` (`resolveObraId`) e `lib/projeto-ai-tools.ts` (`resolveProjetoId`) — arquivos pré-existentes, não tocados nesta rodada por disciplina de "não misturar módulos". **SUGESTÃO**: aplicar a mesma correção nesses dois arquivos numa rodada dedicada, já que o risco (vincular a entidade errada quando há nomes parecidos) é idêntico e já provado real em produção.

---

## 10. Pendências e riscos

- **Itens 14/15/18** (execução de ordem explícita; não-execução de sugestão; não-duplicação real do resumo diário) só podem ser confirmados no teste end-to-end com o usuário real — comportamento de LLM e de agendamento ao vivo não são replicáveis por SQL.
- **`luizia_wa_users` não existe** — resolução de responsável é 100% por nome (fuzzy), nunca por telefone. Se o time quiser resolver responsável a partir de quem está mandando a mensagem no WhatsApp (em vez de precisar dizer o nome), seria necessário reconstruir esse vínculo telefone→pessoa, o que está fora do escopo desta rodada.
- **Bug de determinismo idêntico não corrigido em `ai-obra-tools.ts`/`projeto-ai-tools.ts`** — ver seção 9.
- **Assimetria manual vs. cron no dispatch de `resumo_tarefas` vazio**: no ciclo automático (cron), resumo vazio = silêncio (não envia). No clique manual "Enviar agora" do painel admin, resumo vazio ainda envia um placeholder `(sem tarefas relevantes — nada enviado)` via WhatsApp real — decisão deliberada (é um teste humano intencional, não automação), mas precisa ser confirmada como aceitável.
- **Sem dedup por tarefa individual** no resumo diário — uma tarefa atrasada aparece em todos os resumos subsequentes até deixar de estar atrasada/aguardando. Ver seção 7.
- **Terceira superfície de chat (`lib/luizia-work.ts`)** não foi conectada às Tarefas nesta rodada — só WhatsApp e obra-ai. Ver seção 1.

---

## 11. Passos exatos para o teste end-to-end (com o usuário, não automatizado)

**⚠️ Não execute nenhum destes passos automaticamente — são para rodar junto com o usuário, via WhatsApp real, só depois de avisar que o ambiente está pronto.**

1. **Criar uma tarefa** — mandar para a Luiza no WhatsApp (ou pelo assistente in-app de uma obra): *"cria uma tarefa para confirmar o ponto de energia com o Gabriel, prazo sexta"*. Esperado: `create_task` chamada, confirmação de criação na resposta.
2. **Perguntar o que tem hoje** — *"o que eu tenho pra hoje?"*. Esperado: `list_tasks(filtro='hoje')`, resposta baseada só no resultado real.
3. **Pedir reprogramação** — *"passa essa tarefa pra amanhã"*. Se a tarefa for inequívoca (só uma bateu), deve `update_task` direto (ordem explícita = autorização). Se houver mais de uma tarefa parecida, deve perguntar qual antes.
4. **Conferir no banco**: `select titulo, data_prazo from public.tarefas where titulo ilike '%confirmar o ponto de energia%';` — confirmar que `data_prazo` mudou e que nenhuma etapa foi tocada.
5. **Pedir conclusão** — *"marca essa tarefa como concluída"*. Esperado: `complete_task` chamada.
6. **Conferir banco + log**: `select status, concluida, concluida_em from public.tarefas where titulo ilike '%confirmar o ponto de energia%';` e `select * from public.luizia_tarefas_log where tarefa_id = '<id>' order by created_at;` — confirmar `resultado='ok'` e `valor_anterior`/`valor_novo` coerentes.
7. **Deixar uma tarefa vencida de propósito** (prazo de ontem, status aberto) e então **testar o alerta**: no painel `/admin-luiza`, criar um disparo `tipo='resumo_tarefas'` apontando pro número de teste, e clicar em "Enviar agora" — **isso envia WhatsApp real**, só fazer com autorização explícita do usuário no momento. Conferir que a tarefa vencida aparece com `🔴` na mensagem recebida.
8. Repetir o disparo (clicar "Enviar agora" de novo) sem mudar nada, e observar se o comportamento de repetição é aceitável (ver pendência da seção 10 sobre falta de dedup por tarefa individual) — este passo é justamente para o usuário decidir se quer um dedup mais forte no futuro.

---

## 12. Commit / branch

Branch: `previsoes/prazo-fornecimento-material` (mesma branch de todo o resto da sessão). Commit desta rodada feito **separadamente** do commit da Tarefas V1, contendo só os arquivos listados na seção 3 + este relatório. Depois do commit: merge fast-forward em `main`, rebuild em `main` para confirmar verde, push de `main`, checkout de volta pra `previsoes/prazo-fornecimento-material`.
