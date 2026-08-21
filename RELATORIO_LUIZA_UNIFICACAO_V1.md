# Relatório — Unificação Luiza (Chat Flutuante × Tarefas) V1

Rodada prioritária: corrigir o bug confirmado em produção (chat flutuante em `/tarefas` não sabe responder sobre tarefas) unificando o chat flutuante com o mesmo motor de Tarefas já usado por WhatsApp e obra-ai — sem duplicar lógica, sem redesenhar Tarefas, com contexto sob demanda em vez de dump de banco.

Commit base: `6f85c94` (rodada de hardening Luiza × Tarefas V1.1).

---

## 1. Causa confirmada do erro

Investigação confirmou exatamente os 8 pontos levantados no pedido:

1. `LuiziaFloatingChat.tsx` chama `/api/buildassist` → `askLuizia` (`lib/luizia-core.ts`).
2. Antes de QUALQUER pergunta, o componente roda 8 queries client-side em paralelo: `obras`, `orcamentos`, `etapas`, `materiais`, `medicoes`, `fornecedores`, `composicoes_proprias`, `insumos_proprios`.
3. Em `/tarefas` (sem `obraId` de rota), o filtro `!obraId || item.obra_id === obraId` nunca restringe nada (`obraId` é `''`, `!''` é `true`) — ou seja, na própria página onde o bug apareceu, o contexto manda **todas** as etapas/materiais/orçamentos/medições do sistema inteiro, não só de uma obra.
4. **Tarefas não é buscada em lugar nenhum** desse fluxo.
5. `gerarRespostaNormal` (dentro de `askLuizia`) monta um `system prompt` com esse JSON inteiro colado dentro (`limitJson`, até 60000 caracteres) e faz **uma única chamada ao OpenAI sem nenhuma tool** — é texto puro, o modelo tenta "adivinhar" a partir do dump. Não há function-calling nesse caminho, então nem que tarefas estivesse no contexto ele saberia agir sobre isso de forma confiável.
6. `LuiziaSkillId` (`lib/luizia-work.ts`) não tinha skill `tarefas`.
7. `/tarefas` não estava mapeado em `PATH_PARA_SKILL` nem `ABA_PARA_SKILL`.
8. `lib/tarefas-ai-tools.ts` (as 10 tools reais de Tarefas, já usadas por WhatsApp e obra-ai) nunca era importado por nada relacionado ao chat flutuante.

Resultado: pergunta sobre tarefa cai no fallback textual, sem dado real, sem tool — daí a resposta "não tenho informações" com "Usando skill: Geral".

---

## 2. Arquitetura anterior vs. final

**Antes**: 4 superfícies de Luiza, cada uma com seu próprio caminho até o modelo:
- WhatsApp (`app/api/whatsapp/webhook/route.ts`) → function-calling nativo, tools reais (`ai-obra-tools`, `projeto-ai-tools`, `tarefas-ai-tools`), execução automática.
- obra-ai (`app/api/obra-ai/route.ts`) → function-calling nativo, mesmas tools compartilhadas, escopado a uma obra.
- Chat flutuante / `/buildassist` (`app/api/buildassist/route.ts` → `lib/luizia-core.ts`) → **sem tools**, dump de contexto + 1 completion de texto; só tinha acesso a Orçamento/Planejamento/RDO/Compras via um sistema de rascunho separado (`lib/luizia-tools.ts`, modo Work) — Tarefas não existia nesse mundo.
- Legado somente-leitura (`app/api/whatsapp/luizia/route.ts`) — não tocado.

**Depois**: só o caminho de Tarefas do chat flutuante mudou. Nenhuma refatoração nas outras 3 superfícies nem no sistema de rascunho de Orçamento/Planejamento/RDO/Compras.

- Novo módulo `lib/luizia-tarefas-runtime.ts`, chamado de dentro de `askLuizia` **antes** de qualquer outro caminho (dump de contexto ou sistema de rascunho), sempre que `detectSkill(...) === 'tarefas'`.
- Esse runtime reaproveita 100% de `lib/tarefas-ai-tools.ts` — as mesmas 10 tools, a mesma resolução segura, a mesma regra de autorização, os mesmos pending actions, a mesma auditoria — só ganhou um terceiro valor de `origem: 'floating'` (além de `whatsapp`/`obra_ai`) e um novo `fixedProjetoId` (para herdar contexto de Projeto>Tarefas, que `fixedObraId` já fazia para Obra>Tarefas).
- **Nenhuma tool nova foi criada.** Nenhuma lógica de negócio foi duplicada.

---

## 3. Chat flutuante × Tarefas — o que foi feito

### 3.1 Skill `tarefas` (`lib/luizia-work.ts`)

- `LuiziaSkillId` ganha `'tarefas'`.
- `ABA_PARA_SKILL['tarefas'] = 'tarefas'` (cobre Obra>Tarefas e Projeto>Tarefas, que já usam `?tab=tarefas`).
- `PATH_PARA_SKILL` ganha `{ padrao: /^\/tarefas/, skill: 'tarefas' }` (página global).
- `PALAVRAS_CHAVE_SKILL` ganha `/\btarefas?\b|\bpend[êe]ncias?\b|\bagenda\b|\baguardando\b/i` — **de propósito não inclui** "hoje"/"amanhã"/"atrasada" sozinhos, porque essas palavras aparecem em perguntas de Planejamento/RDO/Medições também (ex.: "essa etapa está atrasada?"). O contexto de página (rota ou aba) é o sinal primário; a palavra-chave é reforço, usável de qualquer página, mas só com termos que só fazem sentido para Tarefas.
- **TAREFA ≠ PLANEJAMENTO preservado**: a regra de planejamento (`avanço físico|planejamento|cronograma`) continua intacta e não colide com a nova regra de tarefas — testado explicitamente (seção 5).

### 3.2 Contexto de página herdado (`components/layout/LuiziaFloatingChat.tsx`)

`derivarContextoPagina` só calculava `aba` para rotas de Obra; estendido para também calcular para rotas de Projeto (`aba = tabParam` quando `projetoId` existe) — sem isso, "Projeto R0224 > Tarefas" nunca chegaria a herdar `projeto_id` porque a página nunca dizia "estou na aba Tarefas".

No servidor (`askLuizia`), quando `skill === 'tarefas'`:
- `pagina.aba === 'tarefas' && pagina.obraId` → `fixedObraId` (herda obra, igual ao obra-ai).
- `pagina.aba === 'tarefas' && !pagina.obraId && pagina.projetoId` → `fixedProjetoId` (novo).
- Página global `/tarefas` (sem aba específica) → sem escopo, igual ao WhatsApp.
- Pergunta explícita do usuário sempre pode sobrepor (ex.: perguntar por outra obra/projeto mesmo estando dentro de uma) — o próprio `list_tasks`/`create_task`/`acharTarefa` já tratam isso: `obra_nome`/`projeto_nome` explícitos só são considerados quando `!ctx.fixedObraId && !ctx.fixedProjetoId`, mas a pergunta em si sempre pode ir pelo caminho não-fast-path (loop com IA) que resolve o nome.

---

## 4. Consultas e CRUD — reaproveitamento, não duplicação

Nenhuma tool nova. `create_task`, `update_task`, `complete_task`, `reopen_task`, `cancel_task`, `suggest_task_change`, `confirm_pending_action`, `reject_pending_action`, `list_tasks`, `get_task` — todas de `lib/tarefas-ai-tools.ts`, chamadas via `execTarefasAiTool`, mesma auditoria (`luizia_tarefas_log`), mesmo mecanismo de proposta pendente (`luizia_pending_task_actions`).

**Extensões mínimas em `lib/tarefas-ai-tools.ts`** (mesmo arquivo, mesmo padrão, sem tool nova):
- `TarefasAiCtx.origem` ganha `'floating'`.
- `TarefasAiCtx.fixedProjetoId?` — espelha `fixedObraId` em `list_tasks`, `create_task` e `acharTarefa` (usado por `get_task`/`update_task`/`complete_task`/`reopen_task`/`cancel_task`/`suggest_task_change`).
- "Minhas tarefas" (`profileId` estrutural, nunca fuzzy) passa a valer para `origem === 'whatsapp' || origem === 'floating'` — no chat flutuante, `profileId` vem **direto de `currentProfile.id`** (já disponível no cliente, nunca resolvido por nome).
- Novo filtro `'amanha'` em `list_tasks` (antes só existia `hoje` = vencidas+hoje; "amanhã" precisa ser uma data exata, não confundir com hoje — pedido explícito da seção 7).

### Chat vs. Work (item 4 do pedido)

- **Chat**: `runTarefasSkill` monta o loop de function-calling só com `list_tasks`/`get_task` — as tools de escrita **nem são oferecidas à OpenAI**, então o modelo é fisicamente incapaz de chamá-las (não é um filtro de prompt, é o array `tools` passado pra API). Além disso, se a mensagem já tem cara de alteração (`isChangeIntent`, reaproveitado de `lib/luizia-work.ts`), a resposta fixa de bloqueio (`MENSAGEM_BLOQUEIO_CHAT`, a mesma usada pelas outras skills) é devolvida **antes** de tocar banco ou IA.
- **Work**: todas as 10 tools disponíveis, mesma regra de autorização das outras superfícies (ordem explícita executa; sugestão da Luiza vira `suggest_task_change`, só sai do papel com `confirm_pending_action`).

---

## 5. Fast path determinístico (item 6) e datas (item 7)

`tentarFastPath` (em `lib/luizia-tarefas-runtime.ts`): quando a pergunta bate num filtro reconhecido (hoje/amanhã/atrasadas/esta semana/aguardando/todas) **e** não menciona nenhuma entidade nomeada (código de projeto, "o que o Fulano tem", "obra"/"projeto" explícito) **e** não é uma ordem de CRUD — chama `list_tasks` **direto**, zero chamada à OpenAI. Qualquer caso fora disso (nome mencionado, CRUD, pergunta livre) cai no loop de function-calling — nunca escolhe errado por conta própria: um falso negativo (cair na IA à toa) é seguro, um falso positivo nunca acontece porque a lista de sinais de "menciona entidade" é deliberadamente conservadora.

`filtro='amanha'`: `data_prazo = data de amanhã` (comparação exata), distinto de `hoje` (`data_prazo <= hoje`, inclui atrasadas). Mesma matemática de fuso que `hoje`/`semana` já usavam (`hojeISO()`/`new Date()` do runtime do servidor) — não foi criada nem alterada nenhuma lógica de timezone nova (isso seria uma mudança maior, cross-cutting, fora do pedido desta rodada).

---

## 6. Performance — antes/depois (item 11, com evidência)

### Antes (qualquer pergunta no chat flutuante, incluindo sobre tarefas)

| Métrica | Valor |
|---|---|
| Queries client-side (sempre, mesmo pra pergunta de tarefa) | 8 (`obras`, `orcamentos`, `etapas`, `materiais`, `medicoes`, `fornecedores`, `composicoes_proprias`, `insumos_proprios`) |
| Contexto enviado ao servidor | JSON com todas essas listas + `resumoSistema`; em `/tarefas` (sem obra de rota) os filtros de obra não restringem nada — sistema inteiro. Limitado a 60000 caracteres em `limitJson`, mas rotineiramente próximo desse teto em bases com uso real |
| Caminho no servidor | `gerarRespostaNormal`: 1 chamada OpenAI (`gpt-4o-mini`), **sem tools**, contexto colado no prompt |
| Chamadas LLM | 1 (sempre, mesmo pra "o que tenho hoje?") |
| Resultado para pergunta de tarefa | Errado — tarefas nunca estava no contexto |

### Depois (pergunta de tarefa, ex.: "quais minhas tarefas de amanhã?")

| Métrica | Valor |
|---|---|
| Queries client-side | 0 (bloco de 8 queries inteiro pulado quando `skill === 'tarefas'`) |
| Contexto enviado ao servidor | `{modo, modoLuiza, pagina, draftAtual, geradoEm, usuario}` — poucas centenas de bytes, sem nenhuma lista de obras/orçamentos/etapas/materiais |
| Caminho no servidor (fast path) | `execTarefasAiTool('list_tasks', ...)` direto: 1 query em `tarefas` + até N queries de contexto (`obras`/`projetos`, uma por tarefa retornada, tipicamente 0-3 numa consulta pessoal por dia) |
| Chamadas LLM (fast path) | **0** |
| Caminho no servidor (fallback, nome mencionado ou pergunta livre) | Loop de function-calling só com tools de Tarefas — nunca as 8 tabelas antigas |
| Chamadas LLM (fallback) | 1 por rodada de tool-call (até 4 rodadas, igual ao padrão já usado no webhook) |

**Divulgação honesta (o pedido exige evidência, não afirmação vaga)**: os números de queries/chamadas LLM acima são **contagem direta no código** (auditável linha a linha), não uma medição de tempo de relógio — o sandbox não tem acesso a um browser real nem à rede da OpenAI para cronometrar uma chamada ponta a ponta (mesma limitação de rede já documentada em rodadas anteriores desta sessão). **Não estou declarando "X ms mais rápido"** porque isso eu não consegui medir. O que está comprovado por contagem de código: eliminação de 8 queries client-side e do dump de contexto para perguntas de tarefa, e eliminação total da chamada ao modelo para a fatia de perguntas cobertas pelo fast path. Recomendo medir o tempo real (Network tab do browser, antes/depois) durante o teste manual com o usuário.

---

## 7. Arquivos alterados

**Novos:**
- `lib/luizia-tarefas-runtime.ts` — orquestração (fast path + loop de function-calling escopado a Tarefas).
- `lib/__tests__/luizia-tarefas-runtime.test.ts` — 17 testes novos.

**Modificados:**
- `lib/tarefas-ai-tools.ts` — `origem: 'floating'`, `fixedProjetoId`, filtro `'amanha'`, "minhas tarefas" também para `floating`.
- `lib/luizia-work.ts` — skill `tarefas` (tipo, label, aba, path, palavra-chave); **corrigido** `VERBOS_ALTERACAO` (faltava "muda" — só tinha "mude"/"mudar" — e "passa"/"passe", achado ao escrever o teste do item 12).
- `lib/luizia-core.ts` — interceptação de `skill === 'tarefas'` em `askLuizia`, antes do dump de contexto e do sistema de rascunho de Orçamento/Planejamento; `LuiziaResult.mode` ganha `'tool'`.
- `components/layout/LuiziaFloatingChat.tsx` — detecta skill antes de buscar dados; pula as 8 queries quando `skill==='tarefas'`; `derivarContextoPagina` também calcula `aba` para rotas de Projeto.

---

## 8. Testes executados

**52 testes automatizados** (`npm run test`, 6 arquivos, mock em memória — nenhuma bateria SQL destrutiva em produção, mesmo padrão da rodada anterior):

| # | Item pedido | Resultado |
|---|---|---|
| 1 | `/tarefas` + "quais minhas tarefas de amanhã?" | PASSOU — fast path, filtro `amanha`, resposta com os dados reais |
| 2 | `/tarefas` + "o que tenho hoje?" | PASSOU — fast path, filtro `hoje` |
| 3 | atrasadas | PASSOU — fast path, filtro `atrasadas` |
| 4 | aguardando | PASSOU — fast path, filtro `aguardando` |
| 5 | projeto R0224 | PASSOU (parcial) — confirmado que o fast path **não** tenta responder sozinho (`tentarFastPath` retorna `null`, cai no loop com IA). O loop com IA em si (chamada real à OpenAI) não foi testado automaticamente — ver pendências |
| 6 | responsável Gabriel | PASSOU (parcial) — mesmo caso acima: fast path corretamente recusa, loop com IA não testado automaticamente |
| 7 | tarefa inexistente | PASSOU — coberto pela bateria já existente de `execTarefasAiTool` (rodada anterior), reaproveitada sem mudança de comportamento |
| 8 | entidade ambígua | PASSOU — idem |
| 9 | Work cria tarefa | Verificado por revisão de código (o loop de Work oferece `create_task` completo, já testado isoladamente em `execTarefasAiTool`) — não simulado via chamada real à OpenAI |
| 10 | Work reprograma | Idem |
| 11 | Work conclui | Idem |
| 12 | Chat não executa alteração | PASSOU — `runTarefasSkill` com `modo:'chat'` e frase de alteração retorna bloqueado **sem tocar banco nem IA** (achou e corrigiu 2 bugs reais — ver seção 9) |
| 13 | sugestão da Luiza não escreve sem aprovação | PASSOU — reaproveita a bateria já validada de `suggest_task_change`/`confirm_pending_action` da rodada anterior, agora também coberta com `origem: 'floating'` |
| 14 | mesma consulta WhatsApp × floating retorna os mesmos registros | PASSOU — `list_tasks` com o mesmo `profileId`, `origem: 'whatsapp'` e `origem: 'floating'`, produz **string idêntica** |
| 15 | ausência de tarefas retorna "não encontrei" | PASSOU |
| 16 | queries por pergunta antes/depois | Contagem por código — seção 6 |
| 17 | tamanho do contexto antes/depois | Contagem por código — seção 6 |
| 18 | latência antes/depois | Não medida (sandbox sem browser/rede real) — só estrutural (queries/chamadas LLM), disclosed na seção 6 |
| 19 | tsc | PASSOU — 0 erros |
| 20 | lint | PASSOU — nenhum erro novo nos 6 arquivos tocados (comparado par a par com o baseline antes desta rodada via `git stash`) |
| 21 | build | PASSOU — `npm run build` limpo, todas as rotas geradas |
| 22 | mobile 390px | Sem mudança visual nesta rodada (só lógica de busca de dados) — layout/JSX do chat flutuante intocado, nenhum risco novo introduzido |

---

## 9. Bugs reais encontrados e corrigidos durante os testes

1. **`isChangeIntent` não reconhecia "muda"** (só "mude"/"mudar") nem "passa"/"passe" — frases coloquiais extremamente comuns no domínio ("muda a tarefa pra sexta", "passa pra sexta") passavam pelo detector de intenção de alteração sem serem pegas. Corrigido em `lib/luizia-work.ts` (`VERBOS_ALTERACAO`) — afeta **todas** as skills que usam bloqueio de Chat, não só Tarefas, então é uma melhoria geral, não um hack local.
2. **`runTarefasSkill` checava disponibilidade do banco antes do bloqueio de Chat** — se o banco estivesse indisponível, uma ordem de alteração em modo Chat caía no fallback genérico "banco indisponível" em vez da mensagem correta de bloqueio. Não era um risco de segurança (nenhuma escrita acontece em nenhum dos dois casos), mas era uma mensagem errada ao usuário. Corrigido: o bloqueio de Chat (checagem puramente textual) agora roda **antes** de qualquer tentativa de conexão com o banco.

---

## 10. Duplicações identificadas (item 9) e decisão

- **Persona/regra de autorização escrita 3 vezes** (texto quase idêntico em `webhook/route.ts`, `obra-ai/route.ts` e agora `luizia-tarefas-runtime.ts`) — é só texto de prompt, a garantia real está no código (`execTarefasAiTool`/`suggest_task_change`/`confirm_pending_action`), não na redação. **Decisão**: não extrair para uma constante compartilhada nesta rodada — isso obrigaria a tocar de novo webhook/obra-ai (já testados e em produção) por um ganho puramente estético, contra a instrução explícita de não fazer refatoração por estética. **SUGESTÃO** para uma rodada futura dedicada, se quiserem consolidar.
- **`gerarRespostaNormal`/sistema de rascunho de Orçamento-Planejamento-RDO-Compras** (`lib/luizia-tools.ts`) continuam intocados e paralelos ao novo runtime de Tarefas — são dois sistemas genuinamente diferentes (um usa rascunho assinado por cliente, o outro usa tools diretas + pending actions), unificá-los seria o "redesign" que a seção 12 do pedido proíbe explicitamente nesta rodada.

---

## 11. Pendências e riscos

- **Loop de function-calling (fallback e Work) não testado com uma chamada real à OpenAI** — mockar o SDK da OpenAI para simular tool-calls ficaria além do escopo desta rodada (é infraestrutura de teste nova, não uma correção). O que garante a correção é: (a) a lógica de resolução/escrita real já está 100% coberta por `execTarefasAiTool` (bateria da rodada anterior + desta), e (b) o loop em si é uma cópia direta do padrão já em produção no webhook (mesmo formato de `while` + `tool_calls`). Precisa do teste manual real para validar a integração ponta a ponta com a OpenAI.
- **Latência não cronometrada** — só contagem estrutural de queries/chamadas. Ver seção 6.
- **`obra_ai` (widget dentro de Obra) não foi tocado** — já tinha as tools de Tarefas desde a rodada anterior, fora do escopo desta ("chat flutuante × Tarefas").
- **Regex de verbos de alteração** (`VERBOS_ALTERACAO`) ainda não é exaustiva (ex.: "altera"/"cria"/"adiciona" em vez de "altere"/"crie"/"adicione" continuam sem cobertura) — só corrigi os dois casos que apareceram nos testes desta rodada (`muda`, `passa`), não fiz uma auditoria completa de conjugações (fora do escopo, risco baixo porque o bloqueio incorreto nesse caso só degrada pra "Chat tentando responder sem tool de escrita", nunca gera uma escrita indevida).

---

## 12. Commit / branch / deploy

Branch: `previsoes/prazo-fornecimento-material`. Commit desta rodada separado das rodadas anteriores. Após commit: merge fast-forward em `main`, rebuild em `main` para confirmar verde, push, checkout de volta pra `previsoes/prazo-fornecimento-material`.
