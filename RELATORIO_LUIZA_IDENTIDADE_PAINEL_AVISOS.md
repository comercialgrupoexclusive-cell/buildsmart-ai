# Identidade única da Luiza × Painel × Avisos

Data: 2026-08-21/22. Branch: `previsoes/prazo-fornecimento-material`. Escopo: chat flutuante, Painel Luiza (`/admin-luiza`), motor de Avisos (`luizia_wa_dispatches`). Não tocado: Orçamento, Portal, Qualidade, Planejamento. Nenhum calendário/agenda, nenhum cadastro novo de usuário, nenhum dispatcher novo.

---

## 1. Causa do vazamento (bug crítico)

`components/layout/LuiziaFloatingChat.tsx` persistia conversa/modo/rascunho em `sessionStorage` sob chaves **globais** (`buildsmart-luizia-floating-chat-session`, `-modo`, `-draft`), sem `profile_id`. Como o BuildSmart permite trocar `currentProfile` no mesmo navegador (mesma aba do `sessionStorage`), o perfil B via a conversa/rascunho/modo deixado pelo perfil A.

**Correção**: extraído para `lib/luizia-chat-storage.ts` (módulo puro, sem React) — toda chave passa a ser `buildsmart:luiza:{profileId}:{chat|modo|draft}`. No componente, um `useLayoutEffect` (não `useEffect` — roda **antes** do paint do navegador) detecta troca de `currentProfile.id`, zera o estado React e carrega a chave do novo perfil na mesma passada síncrona, então nunca existe um frame pintado com o conteúdo do perfil anterior. Propostas pendentes (tabela `luizia_pending_task_actions`) já usavam `conversationKey = floating:{profileId}` desde a rodada anterior — preservado sem alteração.

---

## 2. Identidade final (fonte única)

```
profiles.id
   ↕ (luizia_wa_phone_rules.profile_id)
luizia_wa_phone_rules.phone  ←→  contato/grupo do WhatsApp
```

- **Floating**: `currentProfile.id` (client) → enviado como `usuario.id` no corpo da requisição.
- **WhatsApp**: `phone` recebido no webhook → `luizia_wa_phone_rules.phone` → `.profile_id`.
- **Painel Luiza**: aba Conversas edita a mesma linha de `luizia_wa_phone_rules` que a aba Usuários mostra — literalmente a mesma tabela React (`rules`), sem segunda fonte.
- **Disparos/Avisos**: `destino_phone` gravado em `luizia_wa_dispatches` sempre veio (e continua vindo) de uma `phone_rule` — nunca de texto livre digitado pelo usuário via chat.

Todas as pontas resolvem para o mesmo `profiles.id`. Nenhuma delas usa fuzzy-match de nome para descobrir o próprio usuário.

---

## 3. `luizia_wa_users` — legado confirmado e removido

**Evidência de que a tabela não existe** (consulta ao projeto `jwezrjyatfjvvsugtugo`):
```sql
select table_name from information_schema.tables where table_schema='public' and table_name like 'luizia%';
-- luizia_logs, luizia_pending_task_actions, luizia_tarefas_log, luizia_wa_config,
-- luizia_wa_dispatch_log, luizia_wa_dispatches, luizia_wa_messages, luizia_wa_phone_rules
-- (luizia_wa_users NÃO está na lista)
```
Isso explicava exatamente o sintoma relatado: vincular na aba Conversas gravava certo em `luizia_wa_phone_rules.profile_id`, mas a aba Usuários continuava vazia porque lia de uma tabela inexistente (o `SELECT` simplesmente retornava `data: null`/erro silencioso, sem quebrar a página).

**Removido**:
- `app/(app)/admin-luiza/page.tsx`: tipo `WaUser`, estado `waUsers`/`newUserPhone`/`newUserNome`/`newUserCtx`/`savingUser`, funções `saveWaUser`/`deleteWaUser`, o `SELECT` em `load()`, e toda a UI da aba Usuários antiga (formulário de cadastro paralelo).
- `app/api/whatsapp/webhook/route.ts`: `buildUserContext` não consulta mais `luizia_wa_users` — agora recebe a `phoneRule` já resolvida e busca o nome em `profiles` via `profile_id` quando existir.

Busca confirmando que não sobrou nenhuma referência:
```
$ grep -rn "luizia_wa_users\|WaUser" app lib
# (sem resultados após a rodada)
```

---

## 4. Nova aba Usuários

Projeção pura de `profiles ↔ luizia_wa_phone_rules.profile_id` (`montarVinculos()` em `admin-luiza/page.tsx`), três estados por linha:
- **Vinculado** — perfil com `phone_rule.profile_id` apontando pra ele; mostra telefone mascarado + botão Desvincular (`profile_id = null`).
- **Sem WhatsApp** — perfil sem nenhuma `phone_rule`; botão "Vincular WhatsApp" abre um mini-formulário: escolher uma `phone_rule` já existente sem dono, OU digitar um número novo (cria a `phone_rule` na hora).
- **Telefone sem perfil** — `phone_rule` sem `profile_id`, informativo.

Vincular/desvincular usam exatamente o mesmo `upsert`/`update` em `luizia_wa_phone_rules` que a aba Conversas já usava — mesma linha, mesmo estado React (`rules`), então as duas abas **sempre** mostram o mesmo vínculo sem precisar de sincronização especial entre elas.

---

## 5. Avisos — tools novas

`lib/luizia-avisos-ai-tools.ts` (nomes escolhidos, diferentes do sugerido no pedido onde fazia sentido):

| Tool | Função |
|---|---|
| `list_alerts` | Lista os avisos do remetente atual (telefones vinculados ao seu `profile_id`) |
| `propose_create_alert` | Monta preview de um aviso `resumo_tarefas` novo — NUNCA escreve |
| `propose_update_alert` | Monta preview de mudar dias/horário ou pausar/reativar um aviso existente — NUNCA aplica |
| `confirm_pending_alert` | Executa a proposta pendente confirmada |
| `reject_pending_alert` | Descarta a proposta pendente |

**`get_alert` e `propose_disable_alert` foram dobrados** dentro de `list_alerts` (um perfil normalmente tem 0-1 avisos próprios — uma tool "buscar um" separada seria redundante) e `propose_update_alert` (aceita `ativo: boolean`, então "pausa"/"reativa" é só um caso de atualização, sem precisar de uma quinta tool).

**Escopo desta rodada (decisão consciente)**: só `tipo='resumo_tarefas'`. `resumo_obra`/`personalizada` continuam exclusivos do painel admin — a instrução pedia "preferência: configuração de avisos primeiro" e resolver "qual obra"/"que mensagem" por linguagem natural com a mesma segurança que já existe no painel ficaria fora do que foi pedido para esta rodada.

**Motor reaproveitado, não duplicado**: `lib/luizia-dispatch.ts` (novo) extrai `calcNextRun`, `resolveResponsavelDispatch`, `gerarResumoTarefas` de `app/api/whatsapp/dispatch/route.ts` — o cron continua exatamente o mesmo, só importa de um lugar compartilhado agora (reexportado do próprio `route.ts` para não quebrar o teste existente `dispatch.test.ts`). Nenhum dispatcher novo, nenhuma tabela nova.

---

## 6. Confirmação obrigatória (reaproveitando o mecanismo existente)

Mesma tabela `luizia_pending_task_actions`, mesmas funções (`criarPropostaPendente`/`acharPendenteParaResolver`/`marcarExecutada`/`marcarRejeitada`) — só alarguei o `CHECK` de `tool` (migração `20260822010000_luizia_avisos_pending_actions.sql`, aplicada ao projeto) para aceitar `'create_alert'`/`'update_alert'` além dos 5 valores de tarefas já existentes. `alvoChave` (`create_alert` / `update_alert:{id}`) garante que refinar antes de confirmar substitui o rascunho, não acumula — mesmo padrão da rodada de Tarefas.

Exemplo real (verificado no teste golden):
```
Vou criar este aviso:

Tipo: Resumo de tarefas
Destinatário: Luiz
WhatsApp: contato vinculado ao seu perfil
Dias: segunda a sexta
Horário: 08:00
Recorrente: sim

Confirmar?
```
Só depois de "sim" (`confirm_pending_alert`) é que o `INSERT` em `luizia_wa_dispatches` acontece — nunca antes, nunca duas vezes.

Chat (modo consulta) só recebe `list_alerts`. Work recebe todas as tools de Avisos, mas **nenhuma tool de escrita direta existe** para avisos — só propose/confirm, sem exceção por "ordem explícita" (diferente de Tarefas no WhatsApp, que preserva essa exceção; aqui nem existe o caminho direto).

---

## 7. Capability awareness (item 10)

Criar/programar aviso: permitido (as tools acima existem e são reais). Enviar agora por conta própria: **não implementado** — decisão consciente de escopo, para não aumentar demais esta rodada. A persona do loop de Avisos não promete isso; se pedirem "manda agora", a Luiza não tem `propose_send_alert_now` para chamar e deve dizer honestamente que ainda não consegue disparar na hora por aqui (só configurar o aviso recorrente). "Enviar agora" continua existindo só no painel admin (botão ⚡ já existente, inalterado).

---

## 8. Segurança (item 15) — o que foi feito e o limite real da arquitetura

**Auditoria do RLS/grants atuais** (consulta ao banco, `pg_policies`):
```
luizia_wa_dispatches, luizia_wa_dispatch_log, luizia_wa_phone_rules,
luizia_wa_messages, luizia_wa_config, profiles
  → policy roles={public}, qual/with_check = 'true' (todos os comandos)
```
Ou seja: **RLS está ligado, mas com policies totalmente abertas** (`qual: true`) — qualquer client com a `anon key` pública (embutida no bundle do browser) já podia ler/escrever essas tabelas direto, sem nenhuma verificação de identidade. Isso é um padrão sistêmico pré-existente em todo o BuildSmart (convenção "bs_mvp_*" nas policies de `profiles`, por exemplo) — **não foi introduzido nesta rodada**, e corrigir isso globalmente (RBAC real) está fora do pedido ("Não reconstruir todo RBAC nesta rodada").

**O que esta rodada garante, dentro desse limite**:
1. **Writes de avisos são server-side**: `confirm_pending_alert`/`propose_create_alert` rodam dentro de `/api/buildassist`, usando `SUPABASE_SERVICE_ROLE_KEY` (nunca a anon key do browser) — o mesmo padrão já usado por `tarefas-ai-tools.ts`. Isso é estritamente mais seguro que o próprio Painel admin, que já usa a anon key direto do browser para tudo (`admin-luiza/page.tsx` sempre fez isso, inclusive antes desta rodada).
2. **`destino_phone` nunca é um parâmetro aceito do modelo/usuário** em `propose_create_alert` — é SEMPRE resolvido server-side a partir de `ctx.profileId` → `luizia_wa_phone_rules`. Não existe forma de um aviso ser criado apontando para o telefone de outra pessoa através desta tool, mesmo que o modelo tentasse.
3. **`list_alerts`/`propose_update_alert` sempre restringem a consulta** aos telefones vinculados a `ctx.profileId` — nunca acham/alteram um aviso de outra pessoa, mesmo que o nome do aviso bata.

**Limitação honesta**: `ctx.profileId` vem do `usuario.id` que o **cliente** envia no corpo da requisição a `/api/buildassist` — não há verificação criptográfica de sessão validando "isso realmente é o Luiz". Esse é o MESMO modelo de confiança que absolutamente todo o resto do BuildSmart já usa (inclusive `list_tasks`/`create_task` desde a rodada de Tarefas, inclusive o próprio Painel admin). A trava aplicada aqui — nunca aceitar `destino_phone` do modelo — é a melhor consistente com essa arquitetura, não uma prova criptográfica de identidade.

**Painéis administrativos sem gate de acesso**: `/admin-luiza` e `/luizia-monitor` não verificam papel algum (`tipo` do perfil, sessão de admin) — qualquer pessoa com a URL acessa o histórico de WhatsApp de todos os usuários. Isso é pré-existente e **não foi corrigido nesta rodada** (fora do escopo "não reconstruir RBAC"), mas é registrado aqui explicitamente porque a seção 14 do pedido pediu essa auditoria: o bug crítico do chat flutuante (usuário comum vendo conversa de outro) é **diferente e independente** deste — aquele era vazamento entre usuários comuns via `sessionStorage` do próprio navegador (corrigido); este é ausência de controle de acesso ao painel administrativo (não corrigido, documentado).

---

## 9. Eventos de atualização de UI (itens 11-13)

Três eventos, todos locais (`window.dispatchEvent`/`addEventListener`, mesma aba do navegador — sem Realtime, sem infraestrutura nova):

| Evento | Disparado por | Ouvido por |
|---|---|---|
| `buildsmart:tarefas-changed` | `LuiziaFloatingChat` quando `mutatedDomain==='tarefas'` | `/tarefas`, `ContextoTarefas` (Obra e Projeto — é o mesmo componente) |
| `buildsmart:luiza-dispatches-changed` | `LuiziaFloatingChat` quando `mutatedDomain==='avisos'` | `/admin-luiza` (recarrega `dispatches`/`logs` via `load()`) |
| `buildsmart:luiza-users-changed` | `/admin-luiza` após `savePhoneRule`/vincular/desvincular | `/admin-luiza` (mesma página — cobre o caso de duas abas do painel abertas) |

`LuiziaResult.mutatedDomain: 'tarefas' | 'avisos' | null` substitui o antigo `mutated: boolean` da rodada anterior (só um consumidor até agora, sem quebra de compatibilidade) — o cliente agora sabe **qual** evento disparar, não só que algo mudou.

**Auditoria do `buildsmart:tarefas-changed` (item 12)**: confirmado funcionando nas 3 telas — `/tarefas` e `ContextoTarefas` (usado tanto em `app/(app)/obras/[id]/page.tsx` quanto `app/(app)/projetos/[id]/page.tsx`) escutam o evento e incrementam um `refreshKey` que entra na dependência do `useEffect` de busca.

**Limitação assumida (modal/estado interno)**: `TarefaModal` é remontado do zero a cada abertura (`key={editando?.id}`), inicializado direto do registro passado no momento em que o usuário clicou em "Editar" — não é uma view passiva que fica escutando mudanças enquanto aberta. O caso extremo (usuário com o modal aberto editando a MESMA tarefa que a Luiza está confirmando uma alteração em paralelo, na janela de poucos segundos entre abrir o modal e salvar) não foi tratado nesta rodada — instrução explícita era "não criar refresh global da página", e fechar o modal sozinho ao detectar o evento perderia edição em andamento do usuário. Registrado como risco de baixa probabilidade, não coberto.

---

## 10. Testes automatizados

`npx vitest run` → **77/77 passando** (65 da rodada anterior + 12 novos desta rodada). Arquivos novos:

- `lib/__tests__/luizia-chat-storage.test.ts` — **GOLDEN TEST item 16**: réplica exata do cenário SEGREDO_LUIZ/SEGREDO_GABRIEL (mensagem, draft, modo — os três isolados por perfil, com Storage falso em memória).
- `lib/__tests__/luizia-avisos-ai-tools.test.ts` — **GOLDEN TEST item 18**: "me avise das minhas tarefas de segunda a sexta às 8" → preview → nenhum dispatch até "sim" → 1 dispatch com `destino_phone` real (nunca inventado) → repetir "sim" não duplica. Mais: telefone não vinculado recusa; dois telefones vinculados pede desambiguação; refinar substitui a proposta; "não" descarta; obra inexistente recusa; pausar/reativar/reprogramar; `list_alerts` nunca mostra aviso de outro perfil.

`npx tsc --noEmit` limpo. `npm run build` conclui sem erro (40 rotas). `npx eslint` nos arquivos alterados: mesma contagem de erros pré-existentes nos 7 arquivos já existentes antes desta rodada (comparado via `git stash`); os 6 arquivos novos seguem o mesmo padrão de `any` já estabelecido no resto do código-base (Supabase client tipado fracamente é convenção do projeto, não uma regressão desta rodada) — uma linha nova de warning `exhaustive-deps` foi suprimida com o mesmo padrão de comentário já usado no código original.

### Cobertura dos 27 testes obrigatórios (seção 19)

| # | Teste | Status |
|---|---|---|
| 1-4 | Chat/draft/modo isolados; troca não pisca | ✅ golden test (lógica de storage) + `useLayoutEffect` (verificado por leitura de código, sem harness de DOM — ver limitações) |
| 5-9 | Usuários usa phone_rules/profile; `luizia_wa_users` removido; Luiz vinculado aparece; sincronização Conversas↔Usuários | ✅ implementado (mesma fonte de estado — sincronização é estrutural, não testada por harness de UI) |
| 10-12 | "meu WhatsApp" resolve por profile_id; sem vínculo não inventa; múltiplos exigem escolha | ✅ testado (`resolverTelefoneDoProfile` via `propose_create_alert`) |
| 13-19 | Listar/propor/refinar/confirmar/rejeitar/não duplicar/desativar aviso | ✅ testado |
| 20-21 | Painel/tarefas atualizam após mutation | ✅ implementado (eventos); não testado por harness de DOM |
| 22 | Modal/estado interno não obsoleto | ⚠️ ver limitação seção 9 |
| 23 | Usuário comum não recebe histórico floating de outro | ✅ golden test |
| 24-27 | tsc/lint/build/testes anteriores verdes | ✅ |

---

## 11. Riscos e limitações (honesto, sem esconder)

1. **Sem harness de teste de componente React** (jsdom/testing-library não instalados no projeto) — o comportamento exato de timing do `useLayoutEffect` (zero flash) foi verificado por leitura de código e pelo teste golden da CAMADA DE DADOS (`luizia-chat-storage.ts`), não por um teste que efetivamente monta o componente e simula a troca de perfil no DOM.
2. **`ctx.profileId` não é criptograficamente verificado** — ver seção 8. Mesma limitação de toda a base de código, não introduzida nem resolvida nesta rodada além da trava estrutural aplicada em Avisos.
3. **Painéis admin sem controle de acesso** — pré-existente, documentado, não corrigido (fora de escopo).
4. **Modal aberto durante mutation concorrente** — não tratado, risco baixo, documentado na seção 9.
5. **Interpretação de linguagem natural do modelo não é testada em CI** — mesma limitação já disclosed na rodada de hotfix de Tarefas: os testes chamam as tools diretamente com os argumentos que o modelo extrairia, não montam um mock do loop de function-calling da OpenAI.
6. **`get_alert`/`propose_disable_alert` foram dobrados** em `list_alerts`/`propose_update_alert` (ver seção 5) — divergência deliberada do nome sugerido no pedido, permitida explicitamente ("pode escolher nomes melhores").

---

## 12. Commit e deploy

Commit único desta rodada em `previsoes/prazo-fornecimento-material`, merge fast-forward para `main`, rebuild verde em `main` antes do push — mesma disciplina das rodadas anteriores.

Migração `20260822010000_luizia_avisos_pending_actions.sql` já aplicada ao projeto Supabase (`jwezrjyatfjvvsugtugo`) antes deste commit — sem isso o `CHECK` de `tool` rejeitaria `create_alert`/`update_alert`.

Deploy: automático via Vercel a partir de `main`.

---

## 13. Roteiro do teste real (não executado por mim — combinado)

1. **Isolamento**: Perfil A manda uma mensagem qualquer no chat flutuante. Trocar para Perfil B (menu de perfis) — a conversa deve aparecer vazia, sem piscar o conteúdo do A. Voltar para A — a mensagem do A deve estar lá.
2. **Painel Usuários**: abrir `/admin-luiza` → aba Usuários → conferir que aparece pelo menos um perfil "Vinculado" com o telefone mascarado batendo com o vínculo real. Editar o vínculo pela aba Conversas e conferir que a aba Usuários reflete sem F5 (mesma aba do navegador).
3. **Aviso pela Luiza**: com um perfil que tenha WhatsApp vinculado, no chat flutuante em modo Work: "me avise das minhas tarefas de segunda a sexta às 8" → conferir que aparece o preview e NADA foi gravado ainda (dá pra conferir consultando `luizia_wa_dispatches` no meio da conversa) → "sim" → conferir 1 linha nova em `luizia_wa_dispatches` com `destino_phone` correto, `next_run_at` calculado, e o Painel (se estiver aberto na aba Disparos) atualizar sozinho.
4. **Capability honesta**: no mesmo fluxo, pedir "manda agora" — a Luiza deve dizer que ainda não consegue enviar na hora por ali, sem inventar.

Combinado: paro por aqui — testes automatizados verdes, build ok, migração aplicada, deploy pronto. Não vou disparar nenhum WhatsApp real sozinho.
