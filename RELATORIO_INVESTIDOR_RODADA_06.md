# Laboratório Investidor — Rodada 6 (Marco 6: Luiza com CRUD total)

## 1. Resumo

Implementado o Marco 6 dentro do que já existe no app hoje: a Luiza passa a
reconhecer o contexto `/investidor` e a operar Prospecções, Cenários e a
conversão para Ativo pelas MESMAS ações de domínio do frontend — nenhuma
regra de negócio nova foi criada só para a IA, e o motor de cálculo usado é
literalmente o mesmo `lib/investidor-calculadora.ts` do Marco 3.

Antes de escrever qualquer linha, li a arquitetura real de Luiza já
existente no repositório (`lib/luizia-core.ts`, `lib/luizia-work.ts`,
`lib/tarefas-ai-tools.ts`, `lib/luizia-tarefas-runtime.ts`,
`lib/luizia-avisos-*`, `lib/luizia-pending-actions.ts`) em vez de inventar
um padrão novo. O Investidor entra como uma quarta "skill" (Tarefas, Avisos,
Investidor, Geral) seguindo exatamente o mesmo desenho: runtime próprio +
tools próprias + a mesma tabela genérica de propostas pendentes já usada
por Tarefas/Avisos.

Escopo entregue:
- **Reconhecer contexto**: rota `/investidor*` e palavras-chave específicas
  roteiam para a skill `investidor`; dentro de `/investidor/[id]`, a Luiza
  já sabe de qual Prospecção se trata sem o usuário repetir o nome.
- **Chat** (só leitura): listar/buscar Prospecções, ver detalhe com
  Cenários, listar Ativos, comparar 2+ Prospecções pelo cenário principal.
- **Work** (CRUD com confirmação obrigatória): criar/editar Prospecção,
  criar/editar/excluir Cenário, marcar Cenário principal, converter
  Prospecção em Ativo — todas via "propor → confirmar/rejeitar", nunca
  escrita direta, mesma política já usada por Tarefas/Avisos.
- **Atualizar UI após mutações**: evento `buildsmart:investidor-changed`
  recarrega as telas do Investidor sem F5, mesmo padrão do
  `buildsmart:tarefas-changed` já existente.

## 2. Arquivos alterados

| Arquivo | Natureza |
|---|---|
| `lib/investidor-ai-tools.ts` | **novo** — tools de function-calling + executor |
| `lib/luizia-investidor-runtime.ts` | **novo** — orquestração (fast path + loop de IA) |
| `lib/__tests__/investidor-ai-tools.test.ts` | **novo** — 21 testes |
| `lib/luizia-work.ts` | **alterado** — skill `investidor`, `LuiziaPageContext.prospeccaoId`, roteamento por path/palavra-chave |
| `lib/luizia-core.ts` | **alterado** — roteia a skill `investidor` para o novo runtime, `mutatedDomain` ganha `'investidor'` |
| `lib/luizia-pending-actions.ts` | **alterado** — `PendingAction['tool']` ganha os 7 novos valores do Investidor |
| `lib/__tests__/fake-supabase.ts` | **alterado** — suporte mínimo a `.rpc()` para testar `set_cenario_principal` sem rede |
| `components/layout/LuiziaFloatingChat.tsx` | **alterado** — detecta `prospeccaoId` da URL, dispara `buildsmart:investidor-changed` |
| `app/(app)/investidor/page.tsx` | **alterado** — 3 telas ouvem o evento de mudança |
| `app/(app)/investidor/[id]/page.tsx` | **alterado** — idem |
| `supabase/migrations/20260825182744_luizia_pending_actions_investidor_tools.sql` | **novo** |

## 3. Migration

Único ajuste de banco: ampliar o `CHECK` de `tool` em
`luizia_pending_task_actions` (a mesma tabela genérica de propostas
pendentes já usada por Tarefas/Avisos) com os 7 nomes novos
(`create_prospeccao`, `update_prospeccao`, `create_cenario`,
`update_cenario`, `delete_cenario`, `set_cenario_principal`,
`convert_to_ativo`). Nenhuma tabela nova — reaproveita 100% o mecanismo já
existente (mesma trava de servidor "sugestão nunca escreve sozinha").
Testado ao vivo: os 7 valores novos são aceitos, e um `insert` com
`tool='create_task'` (Tarefas) continua funcionando sem regressão.

## 4. Reconhecer o contexto `/investidor`

- `lib/luizia-work.ts`: `PATH_PARA_SKILL` ganhou `/^\/investidor/ → investidor`;
  uma entrada de palavra-chave conservadora (`prospecção(ões)`, `leilão`,
  `cenário financeiro/de investimento`, `laboratório investidor`) — de
  propósito não usei "ativo" nem "cenário" sozinhos, para não colidir com
  perguntas genéricas de obra ("essa etapa está ativa?").
- `LuiziaPageContext` ganhou `prospeccaoId`; `LuiziaFloatingChat.tsx`
  extrai isso de `/investidor/[id]` do mesmo jeito que já faz para
  `obraId`/`projetoId`. Dentro da tela de uma Prospecção, a Luiza já sabe
  qual é — o usuário não precisa dizer o nome de novo (mesmo papel de
  `fixedObraId`/`fixedProjetoId` em Tarefas).

## 5. Motor de cálculo reaproveitado, não duplicado

`propose_create_cenario`/`propose_update_cenario` chamam
`calcularCenario()` de `lib/investidor-calculadora.ts` — o EXATO mesmo
módulo puro usado pela tela (`components/investidor/ProspeccaoCenarios.tsx`)
no Marco 3. A proposta mostrada ao usuário já traz Investimento
total/Venda líquida/Lucro/Rentabilidade calculados, e o que é gravado ao
confirmar é sempre o resultado desse mesmo cálculo — nunca um número
"inventado" pela IA. Um teste (`investidor-ai-tools.test.ts`) verifica que
os mesmos valores-ouro da planilha (Rodada 3: R$ 282.400,00 de investimento,
R$ 75.900,00 de lucro) aparecem tanto na proposta quanto no registro
gravado após confirmar.

## 6. CRUD via "propor → confirmar/rejeitar" (nunca escrita direta)

Mesma política de Tarefas/Avisos, replicada à risca:
- Nenhuma tool de escrita direta (`insert`/`update`/`delete` imediato) é
  oferecida ao modelo em nenhum momento — só `propose_*` (monta e grava uma
  proposta pendente) e `confirm_pending_action`/`reject_pending_action`
  (únicas que de fato escrevem/desistem).
- Em Chat, só as tools de leitura são oferecidas — mesmo com ordem
  explícita do usuário, uma intenção de alteração é bloqueada ANTES de
  chamar a IA (`isChangeIntent` de `lib/luizia-work.ts`, reaproveitado sem
  alteração).
- `resolveProspeccao`/`acharCenario` usam `lib/ai-resolve.ts` — nunca
  escolhem sozinhas entre duas correspondências reais; pedem desambiguação.
- `confirm_pending_action`/`reject_pending_action` reaproveitam
  `lib/luizia-pending-actions.ts` (mesma tabela, mesma trava de expiração
  de 30 min) — implementação própria do Investidor só para interpretar o
  `acao.tool`/`acao.argumentos` (necessariamente específico por domínio,
  igual Tarefas e Avisos já fazem cada um com o seu). Uma proposta pendente
  que não seja do Investidor (ex.: uma Tarefa, na mesma `conversation_key`
  compartilhada) recebe uma recusa educada em vez de travar o executor.

## 7. Atualizar UI após mutações

`LuiziaFloatingChat.tsx` já dispara `buildsmart:tarefas-changed` e
`buildsmart:luiza-dispatches-changed` quando `mutatedDomain` vem preenchido
— acrescentei `buildsmart:investidor-changed` no mesmo `if/else`.
`ProspeccoesTab`, `AtivosTab`, `ComparadorTab` (hub `/investidor`) e
`ProspeccaoDetalhe` (`/investidor/[id]`) agora ouvem esse evento e
recarregam — se a Luiza criar uma Prospecção ou confirmar um cenário
enquanto a tela já está aberta, ela aparece sem precisar de F5.

## 8. Fora de escopo desta rodada (documentado, não esquecido)

A especificação (seção 6.1) lista "operar Board/Arquivos/Comercialização"
como parte do Marco 6. Decisão técnica, alinhada à regra de precedência
("não extrapolar para completar funcionalidades"):

- **Comercialização**: não existe hoje NENHUMA tela, tabela ou fluxo de
  Comercialização no app (não é um dos 8 marcos aprovados; é mencionada só
  como estágio futuro do fluxo macro). Dar à Luiza uma ferramenta para
  "operar" algo que não existe seria inventar um domínio inteiro por baixo
  do pretexto de "CRUD da Luiza" — exatamente o tipo de expansão de escopo
  que as rodadas anteriores foram instruídas a evitar. Registrado aqui como
  conflito real entre a redação da seção 6.1 (uma lista de alvos para
  quando cada marco existir) e o estado real do app — nenhuma ação tomada
  além de documentar.
- **Board/Arquivos via chat**: nenhum precedente no app faz isso hoje —
  nem Tarefas, nem Avisos, nem nenhuma outra skill de Luiza tem uma tool de
  upload de arquivo ou edição de canvas. Adicionar isso especificamente
  para Investidor seria uma regra nova sem base equivalente em nenhum outro
  domínio, e desenhar essa interação (o que significa "editar o Board por
  texto"?) exigiria decisões de produto que a especificação não define. Fica
  fora, sem inventar um design não pedido.
- **Excluir Prospecção**: a própria UI (`/investidor/[id]`, `ResumoTab`)
  nunca ofereceu essa ação em nenhuma rodada anterior — mantido assim para
  a Luiza também, seguindo o princípio "nenhuma regra deve existir só
  dentro da Luiza" (o inverso também vale: a Luiza não ganha uma capacidade
  que a tela não tem).
- **Duplicar cenário via chat**: a UI tem esse botão (Marco 3), mas não é
  essencial para "operar Cenários" e foi deixado de fora para não inflar
  ainda mais a superfície desta rodada — pode entrar depois com o mesmo
  padrão de `propose_create_cenario` se for pedido.

## 9. Testes executados

- **21 testes novos** (`lib/__tests__/investidor-ai-tools.test.ts`), com o
  mesmo `FakeDB` em memória já usado por `tarefas-ai-tools.test.ts` (sem
  rede — o sandbox bloqueia `*.supabase.co`):
  - Leitura: listar (com e sem filtro de fase), buscar por nome único,
    nome ambíguo (nunca escolhe sozinha), nome não encontrado, escopo por
    `fixedProspeccaoId`, listar Ativos (só `contexto=investimento`),
    comparar 2 prospecções (uma sem cenário principal, tratada
    corretamente).
  - Escrita: cada `propose_*` comprovadamente NÃO escreve nada até
    `confirm_pending_action` ser chamado; `reject_pending_action` descarta
    sem escrever; `propose_create_cenario`/`propose_update_cenario`
    recalculam com o motor real antes e depois de confirmar, com os mesmos
    valores-ouro da Rodada 3; `propose_set_cenario_principal` só troca via
    RPC ao confirmar; `propose_convert_to_ativo` recusa fase incorreta e
    conversão duplicada, e só cria o Project + vincula ao confirmar.
  - Durante a escrita dos testes, um teste revelou um problema real:
    `compare_prospeccoes` e `list_prospeccoes` usavam `select('*,
    prospeccao_cenarios(*)')` (embed do PostgREST) — funciona contra o
    Supabase real (mesmo padrão já validado ao vivo na Rodada 5 para
    `ComparadorTab`), mas o teste expôs que o código ficaria mais
    consistente com o resto do arquivo (`get_prospeccao` já fazia 2
    consultas separadas) fazendo o mesmo em vez de depender de embed —
    refatorado para 2 consultas + junção em memória, mesmo resultado, mais
    fácil de testar e mais uniforme dentro do próprio arquivo.
- **`npx vitest run` completo: 121/121 passando** (21 novos + 100
  existentes, nenhuma regressão — inclusive os 16 testes do motor de
  cálculo do Marco 3 continuam batendo com os valores-ouro da planilha).
- **SQL ao vivo** (produção, `luizia_pending_task_actions`): inserido um
  registro para cada um dos 7 novos valores de `tool` (aceitos pelo CHECK
  ampliado) e um registro com `tool='create_task'` (Tarefas, confirmando
  ausência de regressão) — todos removidos ao final.

## 10. TypeScript / build / lint

- `npx tsc --noEmit -p .`: **sem erros**, checado a cada arquivo alterado.
- `npm run build` (Next.js 16 + Turbopack): **compilado com sucesso**.
- `npx eslint` nos arquivos novos/alterados desta rodada
  (`lib/investidor-ai-tools.ts`, `lib/luizia-investidor-runtime.ts`,
  `lib/luizia-work.ts`, `lib/luizia-core.ts`, `lib/luizia-pending-actions.ts`,
  `lib/__tests__/investidor-ai-tools.test.ts`, os 2 arquivos de
  `app/(app)/investidor`, `LuiziaFloatingChat.tsx`): **0 erros novos**.
  - `lib/investidor-ai-tools.ts` e `lib/luizia-investidor-runtime.ts`
    ficaram 100% limpos de `no-explicit-any` (usei `eslint-disable-next-line`
    pontual nos 2 lugares onde o tipo dinâmico é inerente — args de tool
    vindos de `JSON.parse` — igual a como `lib/tarefas-ai-tools.ts` e
    `lib/luizia-avisos-ai-tools.ts` já fazem sem a anotação, só que essas
    duas ficam com o erro visível; escolhi suprimir no código novo por ser
    mais limpo, sem alterar o padrão dos arquivos antigos).
  - `lib/__tests__/fake-supabase.ts` ganhou 1 novo uso de `any` (no método
    `.rpc()` que adicionei) — mesmo estilo de `any` já usado em TODOS os
    outros métodos desse arquivo de teste; não suprimi ali para não
    destoar do resto do arquivo.
  - `components/layout/LuiziaFloatingChat.tsx`: os erros que aparecem no
    lint (`no-explicit-any`, `set-state-in-effect`) estão todos em linhas
    que eu não toquei — confirmado via `git diff`, só 3 blocos pequenos
    foram alterados (detecção de `prospeccaoId`, retorno do contexto,
    dispatch do evento), nenhum deles entre as linhas acusadas.
  - `app/(app)/investidor/page.tsx`: os 2 `set-state-in-effect` continuam
    sendo os `useEffect(() => { void load() }, [])` já existentes das
    Rodadas 4/5 (mesma inconsistência de lint já documentada em 3 relatórios
    anteriores) — meus novos `useEffect` de escuta do evento (que só
    registram/removem um listener, não chamam `setState` no corpo do
    efeito) não disparam o aviso.

## 11. Problemas encontrados

- O bug de testabilidade do embed do PostgREST descrito na seção 9 (real,
  mas de baixo risco — comportamento correto contra o Supabase real,
  refatorado por consistência/testabilidade, não por estar quebrado).
- Nenhum outro problema de schema, RLS ou dado real.

## 12. Diferenças entre especificação e implementação

Registradas na seção 8 (Comercialização, Board/Arquivos via chat, excluir
Prospecção, duplicar cenário via chat) — todas por ausência de base real no
app (Comercialização) ou por manter paridade exata com o que a própria UI
já oferece (nem mais, nem menos capacidade para a Luiza).

## 13. Decisões deliberadamente adiadas para o Marco 7+

- Multimodal (texto/print/foto/PDF/link), Web Search e Habilidades: Marco 7,
  não antecipado.
- Rotinas e Agentes (incluindo o "Agente de Prospecção"): Marco 8, não
  antecipado.
- Qualquer tool de Board/Arquivos/Comercialização via Luiza (seção 8):
  aguardando um marco que efetivamente crie essas capacidades no domínio
  antes de expor via chat.
- Duplicar cenário via chat: mesma extensão trivial de
  `propose_create_cenario` que existe hoje, só não priorizada nesta rodada.

## 14. Commit SHA final

Branch de trabalho: `previsoes/prazo-fornecimento-material`.
HEAD antes desta rodada: `32cd2cb` (fecho da Rodada 5).
Commit desta rodada: `2588f22` (branch de trabalho) / `8eb3760` (merge
`--no-ff` em `main`). Ambos os branches foram reconstruídos (`tsc` + testes
+ build) e enviados para o `origin`.
