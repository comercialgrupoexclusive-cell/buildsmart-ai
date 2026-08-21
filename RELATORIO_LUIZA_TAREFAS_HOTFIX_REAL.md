# HOTFIX CRÍTICO — Luiza × Tarefas, baseado em falha real de produção

Data: 2026-08-21. Branch: `previsoes/prazo-fornecimento-material`. Escopo: **só** o chat flutuante/BuildAssist e o motor de Tarefas. Não tocado: Orçamento, Portal, Qualidade, Planejamento, calendário/agenda, WhatsApp send, novas integrações.

---

## 1. A conversa real que expôs o bug

Ocorrida em produção **depois** do deploy do hotfix anterior ("Unifica Luiza do chat flutuante com o motor de Tarefas", commit `4ed1ef5`), que já tinha corrigido o bug de "Luiza não vê tarefas nenhuma". Esta conversa revelou uma segunda camada de problemas — a de autorização e semântica, não de acesso a dados.

| # | Usuário | Luiza (produção, com bug) | Problema |
|---|---|---|---|
| 1 | "como estao as coisas?" | Pergunta genérica de esclarecimento | Devia dar um resumo real |
| 2 | "no geral o que temos?" | "9 tarefas" | Estado real: 21 total / 19 abertas / 9 do Luiz. "No geral" virou "minhas" silenciosamente |
| 3 | "manda as tarefas pro meu whats" | Sugeriu mudar para modo Work para "enviar" | Não existe (nem existiu) nenhuma tool de WhatsApp — capacidade inventada |
| 4 | "modo work" | Sugeriu trocar de modo de novo | O texto da mensagem não é comando de UI — o modo é estado do cliente |
| 5 | "pronto, crie uma terefa pra mim, orçar esquadrias" | Perguntou o prazo | Ok até aqui |
| 6 | "amnah" | **Gravou a tarefa diretamente**, sem pedir confirmação final | Bug central: sugestão sem confirmação virou escrita |

### Evidência no banco (consulta somente-leitura, `mcp__Supabase__execute_sql`, projeto `jwezrjyatfjvvsugtugo`)

```json
{
  "tarefa": {
    "id": "dca03de0-e539-42e0-b571-752046763623",
    "titulo": "Orçar esquadrias",
    "status": "pendente",
    "responsavel_id": null,
    "responsavel_nome": null,
    "obra_id": null,
    "projeto_id": null,
    "data_prazo": "2026-08-22"
  },
  "log": [{ "acao": "criar", "origem": "floating", "usuario": "Luiz", "resultado": "ok", "created_at": "2026-08-21T16:34:44.811881+00:00" }],
  "contagem_total": 21,
  "contagem_abertas": 19
}
```

Confirma exatamente o relato do usuário: `responsavel_id`/`responsavel_nome` NULL (por isso a tarefa não aparecia em "Minhas tarefas"), uma única entrada de log com `origem='floating'`, `resultado='ok'` — a escrita aconteceu numa única chamada, sem nenhuma proposta pendente envolvida. **Esta tarefa foi preservada intencionalmente** (não apagada) como evidência — ver seção 7.

---

## 2. Causa de cada falha

1. **"como estão as coisas" vira pergunta, não resposta** — não existia nenhum caminho determinístico para um resumo geral; a skill tarefas só sabia responder a `list_tasks` com filtros específicos (hoje/amanhã/atrasadas/...), então o loop de IA, sem um filtro claro, devolvia uma pergunta.
2. **"no geral" virou "minhas"** — `list_tasks` (`lib/tarefas-ai-tools.ts`) tinha uma regra "sem escopo explícito → filtra pelo remetente" que rodava incondicionalmente sempre que a origem era `floating`/`whatsapp`, sem distinguir uma pergunta pessoal de uma pergunta geral.
3. **Capacidade inventada (WhatsApp)** — não havia nenhuma detecção de pedidos para canais que não existem; o modelo, sem essa informação, inventou uma resposta plausível ("troque de modo").
4. **"modo work" tratado como possível comando** — não havia nenhuma interceptação da frase literal antes de rotear para a skill/IA; o modelo respondia como se pudesse mudar o estado.
5. **Escrita sem confirmação final** — a causa raiz mais grave: em Work, `create_task` (e as demais tools de escrita direta) era oferecida à IA **sem exigir uma etapa de confirmação**. Isso significa que qualquer sequência de mensagens que o modelo interpretasse como "informação suficiente para criar" resultava numa chamada de `create_task` de verdade, sem preview nem "sim" explícito na mesma mensagem. `suggest_task_change`/`confirm_pending_action` (que fazem exatamente essa trava) já existiam — mas só cobriam edição/status de tarefa **existente**, nunca criação.
6. **"pra mim" não virava `responsavel_id`** — `create_task` só resolvia responsável por `responsavel_nome` (fuzzy match); não existia nenhum parâmetro equivalente a "pra mim" ligado a `ctx.profileId`.
7. **UI sem atualização automática** — `/tarefas` e `ContextoTarefas` só buscavam dados no mount/troca de aba; não havia nenhum sinal de que uma escrita feita pela Luiza (fora da própria página) deveria disparar um refetch.

---

## 3. O que foi implementado

### 3.1 `lib/luizia-pending-actions.ts` — supersessão por `alvoChave`
`criarPropostaPendente` ganhou um parâmetro opcional `alvoChave`. Quando informado, qualquer proposta pendente **anterior** da mesma conversa com a mesma chave é marcada `expired` antes de inserir a nova — "sim, mas amanhã" **substitui** o rascunho em vez de criar um segundo pendente ambíguo. Sem migração nova: a chave é gravada dentro do próprio JSONB `argumentos` (`__alvoChave`), removida antes do INSERT real na hora de confirmar.

### 3.2 `lib/tarefas-ai-tools.ts` — proposta de criação + GERAL ≠ MINHAS
- **Nova tool `propose_create_task`**: resolve tudo que `create_task` resolve (obra/projeto/responsável por nome, `para_mim`), mas **nunca escreve** — grava uma proposta pendente (`tool: 'create_task'`, `argumentos` = payload pronto para INSERT) com a chave `alvoChave: 'create_task'` e devolve um rascunho estruturado:
  ```
  Tarefa: Orçar esquadrias
  Responsável: Luiz
  Prazo: ainda não definido
  Prioridade: Normal
  Contexto: Geral / sem Projeto ou Obra

  Confirmar criação?
  ```
- **`para_mim: true`** (novo parâmetro em `create_task` e `propose_create_task`): resolve `responsavel_id = ctx.profileId` diretamente — nunca por fuzzy-match do próprio nome. Sem `profileId`, recusa (`"Não consegui identificar seu perfil..."`) em vez de criar sem responsável.
- **`confirm_pending_action`** agora reconhece dois formatos de proposta: o antigo (`{tarefaId, patch, ...}`, edição/status via `aplicarPatchTarefa`) e o novo (`tool === 'create_task'`, payload direto para `INSERT`). Só agora, na confirmação, é que a linha entra em `tarefas`.
- **`list_tasks`** ganhou `escopo_geral: boolean`. Quando `true`, o filtro automático por `responsavel_id` (que antes rodava sempre que a origem tinha identidade pessoal e não havia outro escopo) é **pulado** — corrige diretamente o bug #2.
- **`suggest_task_change`** também passou a usar `alvoChave` (`${tool}:${tarefaId}`), então sugerir de novo para a mesma tarefa também substitui em vez de acumular.
- Lógica de resolução de obra/projeto/responsável/payload de `create_task` foi extraída para uma função só (`resolverCriacao`), reaproveitada por `create_task` (WhatsApp/obra-ai, ordem explícita — inalterado) e `propose_create_task` (floating) — sem duplicar regra de negócio.

### 3.3 `lib/luizia-tarefas-runtime.ts` — orquestração do chat flutuante
- **Tools de escrita direta nunca oferecidas nesta superfície**, nem em Work: `create_task`/`update_task`/`complete_task`/`reopen_task`/`cancel_task` são filtradas fora da lista passada à OpenAI. Em vez disso, Work recebe `list_tasks`, `get_task`, `propose_create_task`, `suggest_task_change`, `confirm_pending_action`, `reject_pending_action` — **toda** escrita (criar, prazo, prioridade, responsável, status, concluir, reabrir, cancelar) passa por proposta + confirmação, sem exceção por "a ordem foi explícita" (essa exceção continua existindo só no WhatsApp).
- **`detectarResumoGeral`** + resumo determinístico (sem chamada de IA): reconhece "como estão as coisas", "no geral", "como estão as tarefas", "visão geral", "o que temos" (sem "minhas"/"pra mim") e monta:
  ```
  Hoje temos:
  - N tarefa(s) aberta(s)
  - N atribuída(s) a você
  - N atrasada(s)
  - N para hoje
  - N aguardando
  - N sem responsável

  Prioridades imediatas:
  1. ...
  2. ...
  3. ...
  ```
  Reaproveita a mesma consulta de `tarefas` já usada por `list_tasks` — nenhum motor de analytics novo.
- **`detectarPedidoCapabilityInexistente`**: detecção textual (WhatsApp/e-mail/PDF/impressão + verbo de envio) que responde honestamente ("Hoje eu ainda não consigo enviar essa lista...") sem chamar IA nem sugerir troca de modo.
- Persona do loop de IA reescrita para deixar explícitas as novas regras: GERAL vs MINHAS, proposta-sempre-antes-de-escrever, refinamento ≠ confirmação, honestidade de capacidade.
- **`temPropostaPendenteAtiva(profileId)`**: exportada para `lib/luizia-core.ts` forçar o roteamento de volta à skill `tarefas` quando a mensagem seguinte ("amanhã", "sim", "não") não tem nenhuma palavra-chave — sem isso, o refinamento/confirmação se perderia no roteamento genérico por texto.
- Heurística de `mutated` (tools de escrita que de fato escreveram, sem erro/recusa na resposta) propagada para fora de `runTarefasSkill`.

### 3.4 `lib/luizia-core.ts`
- Interceptação da frase literal `"modo work"`/`"modo chat"` **antes** de qualquer roteamento: compara com o `context.modoLuiza` real (estado do cliente) e responde honestamente ("Você ainda está em Chat. Use o botão...") ou, se já estiver no modo pedido, confirma sem sugerir trocar de novo — nunca finge ter mudado o modo.
- `LuiziaResult.mutated?: boolean` — repassado pela skill tarefas.
- Checagem de proposta pendente ativa força `skill = 'tarefas'` mesmo sem palavra-chave, só quando `modoLuiza === 'work'` (só lá existe proposta pendente).

### 3.5 UI — atualização automática após escrita
- `components/layout/LuiziaFloatingChat.tsx`: dispara `window.dispatchEvent(new Event('buildsmart:tarefas-changed'))` quando a resposta da API vem com `mutated: true`.
- `app/(app)/tarefas/page.tsx` e `components/tarefas/ContextoTarefas.tsx`: escutam esse evento e refazem a consulta (mesmo padrão nos dois — um `refreshKey` incrementado no listener, adicionado à lista de dependências do `useEffect` de busca).

---

## 4. Migrações

**Nenhuma migração nova nesta rodada.** `luizia_pending_task_actions.tool` já incluía `'create_task'` no enum desde `20260821120000_luizia_hardening_v1_1` (rodada anterior) — a supersessão por `alvoChave` usa o JSONB `argumentos` já existente, e o formato de payload de criação (`{titulo, descricao, obra_id, projeto_id, responsavel_id, responsavel_nome, prioridade, data_prazo, status, concluida}`) é exatamente o mesmo shape que `INSERT INTO tarefas` já aceitava.

---

## 5. GOLDEN TEST (regressão permanente)

`lib/__tests__/luizia-tarefas-hotfix.test.ts` — replica os 6 turnos exatos da conversa real, num único `it()`:

1. `"como estao as coisas?"` → resumo real, não termina em `?`.
2. `"no geral o que temos?"` → mesmo total geral (não reduzido às tarefas do usuário).
3. `"manda as tarefas pro meu whats"` → recusa honesta, sem mencionar "Work"/"modo".
4. `"crie uma terefa pra mim, orçar esquadrias"` (simulado via `propose_create_task({titulo, para_mim:true})`) → devolve rascunho completo, **não escreve** (`tarefas` inalterada), `responsavel_id` da proposta = profile atual.
5. `"amnah"` (simulado via `propose_create_task` de novo, com `data_prazo` = amanhã) → proposta **substituída** (1 pending + 1 expired), ainda **não escreve**.
6. `"sim"` (`confirm_pending_action`) → escreve **exatamente uma vez**, com `responsavel_id`/`data_prazo` corretos, log de auditoria, proposta marcada `executed`; repetir `"sim"` não duplica.

**Limitação assumida conscientemente**: os turnos 4-6 chamam `execTarefasAiTool`/`propose_create_task`/`confirm_pending_action` diretamente com os argumentos que o modelo extrairia da frase (`titulo`, `para_mim`, `data_prazo`) — não montamos um mock do loop de function-calling da OpenAI em si. O que é testado ponta a ponta e importa mais para a confiabilidade: que a escrita real só acontece em `confirm_pending_action`, nunca antes, e nunca mais de uma vez — essa é exatamente a garantia que faltava em produção.

---

## 6. Outros testes automatizados (13/13 aplicáveis do pedido)

Todos em `lib/__tests__/luizia-tarefas-hotfix.test.ts`, além do golden test:

| # | Caso | Resultado |
|---|---|---|
| 3 | "crie tarefa X para Gabriel" resolve responsável por nome | ✅ |
| 8 | "não" (`reject_pending_action`) descarta sem escrever | ✅ |
| 9 | Proposta de criação expirada não escreve | ✅ |
| 11 | `escopo_geral=true` nunca filtra por responsável | ✅ |
| 12 | `detectarResumoGeral` reconhece as frases da conversa real, sem falso-positivo em "minhas" | ✅ |
| 15 | `detectarPedidoCapabilityInexistente` só dispara com alvo externo real (não com "mandar bem") | ✅ |
| 17 | Dentro de Obra>Tarefas herda `obra_id` e revela o contexto na proposta | ✅ |
| 18 | "pra mim" sem `profileId` recusa e não cria proposta | ✅ |
| — | `propose_create_task` está definida nas tools compartilhadas | ✅ |
| 13 | "modo work"/"modo chat": Chat→pede Work avisa estado real | ✅ |
| — | Já em Work, "modo work" não manda trocar de novo | ✅ |
| — | Work→pede Chat avisa estado real | ✅ |
| 4/14 | Regras 4 ("só pergunta o necessário") e 14 (filtragem exata de tools oferecidas ao modelo em Work) dependem do comportamento do modelo dentro do loop de function-calling — não fazem parte do que testamos automaticamente aqui; ficam registradas na seção 8 (Limitações) | ⚠️ não coberto automaticamente |
| 16 | UI refaz consulta ao receber `buildsmart:tarefas-changed` | ⚠️ verificado por leitura de código (dispatch em `data.mutated`, listener com `refreshKey`), sem teste de componente automatizado — projeto não tem harness de testes de componente React configurado |

**Suíte completa**: `npx vitest run` → **59/59 testes passando** (46 pré-existentes + 13 novos desta rodada, incluindo o golden test). `npx tsc --noEmit` limpo. `npm run build` conclui sem erro (40 rotas geradas). `npx eslint` nos arquivos alterados: mesma contagem de erros pré-existentes (17, todos padrões antigos de `any` já presentes no código antes desta rodada, confirmado via `git stash` comparando antes/depois) — nenhum erro novo introduzido.

Também foi preciso um pequeno ajuste de infraestrutura de teste: `vitest.config.mts` ganhou um alias para `server-only` (pacote guard de build do Next.js, que não existe fora do bundler do Next) apontando para um stub vazio em `lib/__tests__/stubs/server-only.ts` — sem isso, nenhum teste conseguia importar `lib/luizia-core.ts` (necessário para testar a interceptação de "modo work"/"modo chat"). Não afeta produção — é só resolução de módulo do Vitest.

---

## 7. Tarefa defeituosa preservada como evidência

`dca03de0-e539-42e0-b571-752046763623` ("Orçar esquadrias", `responsavel_id`/`responsavel_nome` NULL, `data_prazo` 2026-08-22) **não foi apagada nem alterada** nesta rodada — continua exatamente como a conversa real a deixou, para servir de prova em qualquer auditoria futura. Decisão sobre apagar ou reaproveitar fica para uma rodada seguinte, a pedido do usuário.

---

## 8. Limitações e divergências assumidas

- **Interpretação de linguagem natural não é testada automaticamente.** O golden test e os testes adicionais chamam as tools diretamente com os argumentos que o modelo extrairia — a extração em si (o loop de function-calling da OpenAI) não roda em CI: o sandbox de execução não tem acesso à API da OpenAI, e não montamos um mock do SDK para isso nesta rodada. Isso significa que um erro de extração pelo modelo (ex.: interpretar "amanhã" errado, ou esquecer de setar `para_mim`) não seria pego por este teste — só pela conversa real que vocês vão rodar depois.
- **Item 4 do pedido ("perguntar só o estritamente necessário")** e **item 14 ("Work prepara proposta, não escreve imediatamente")** dependem de como o modelo usa as tools oferecidas dentro do loop — a garantia estrutural (as tools de escrita direta fisicamente não estão na lista oferecida ao modelo em nenhum modo desta superfície) está implementada e é a proteção real; o comportamento textual fino do modelo não tem teste automatizado dedicado.
- **Item 16 (UI atualiza sozinha)** foi verificado por leitura de código, não por teste de componente — o projeto não tem harness de testes de UI configurado (nem Playwright rodando neste ambiente sandbox, sem acesso a rede/browser real para produção).
- **`mutated` é uma heurística**, não um retorno estruturado das tools: consideramos que uma tool de escrita "mutou" quando o nome da tool está no conjunto de escrita (`confirm_pending_action`) e a mensagem de retorno não bate com os padrões conhecidos de erro/recusa (`Erro ao criar...`, `Não encontrei...`, etc.). Um texto de sucesso genuinamente fora desses padrões (nunca visto até agora) poderia, em teoria, ser mal classificado — risco baixo, mas registrado.
- **Regra "explícito escreve direto" preservada no WhatsApp e obra-ai**, sem alteração — só o chat flutuante virou "escrita sempre = confirmação". Isso é uma divergência deliberada de comportamento entre superfícies, exatamente como pedido.

---

## 9. Commit e deploy

Commit único desta rodada (script `git log` após o commit real vai mostrar o hash), branch `previsoes/prazo-fornecimento-material`, com merge fast-forward para `main` e push de ambas — seguindo a mesma disciplina de git das rodadas anteriores (rebuild em `main` antes do push para confirmar verde).

Deploy: automático via Vercel a partir de `main` (mesmo pipeline das rodadas anteriores) — nenhuma variável de ambiente nova, nenhuma migração para rodar antes do deploy.

---

## 10. Próximo teste real (roteiro sugerido)

Depois deste deploy, a conversa real a repetir no chat flutuante (aba /tarefas ou qualquer outra página, modo Work) é exatamente a sequência do golden test:

1. "como estão as coisas?" — deve vir um resumo com números reais, sem pergunta de volta.
2. "no geral o que temos?" — total geral, não só as suas.
3. "manda as tarefas pro meu whats" — recusa honesta, sem sugerir trocar de modo.
4. "modo work" (se já estiver em Work) — deve confirmar que já está, sem instrução de troca.
5. "crie uma tarefa pra mim, orçar esquadrias 2" (evitar o mesmo título da tarefa de evidência) — deve vir um rascunho completo (Tarefa/Responsável/Prazo/Prioridade/Contexto) pedindo confirmação, **sem gravar nada ainda** — dá pra conferir isso com uma consulta ao banco no meio da conversa.
6. "amanhã" — o rascunho deve se atualizar com o prazo, repetir a pergunta, continuar sem gravar.
7. "sim" — só agora grava; conferir no banco: `responsavel_id` = seu perfil, `data_prazo` correto, uma linha em `luizia_tarefas_log`, e a tarefa aparecendo em "Minhas tarefas" em `/tarefas` **sem precisar dar F5**.

Combinado: paro por aqui — testes automatizados verdes, build ok, deploy pronto. Não vou rodar essa conversa real sozinho; a validação de banco/log/UI ao vivo fica para nós fazermos juntos.
