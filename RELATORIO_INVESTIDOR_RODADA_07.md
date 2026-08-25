# RELATORIO INVESTIDOR - RODADA 07

## Escopo

Rodada 7 - Multimodal + Web Search + Habilidades.

Correcao de revisao: Web Search deve ficar somente no runtime Investidor. O runtime geral da Luiza, Tarefas, Avisos e Chat geral nao podem ser afetados por busca web.

## Auditoria Inicial

- Branch: `main`.
- Working tree antes da correcao: somente `.codex-template-dev.log` nao rastreado alem dos ajustes ja commitados da Rodada 7.
- Ponto revisado: a primeira implementacao colocou `web_search_preview` em `lib/luizia-core.ts`, o que ampliava o runtime geral da Luiza. Isso foi corrigido nesta rodada.

## Implementado na Rodada 7

- Luiza web aceita anexos no chat flutuante:
  - imagens enviadas como `image_url` para o modelo;
  - PDFs extraidos via `/api/extract-pdf`;
  - texto/CSV/JSON lidos no navegador;
  - audio enviado como arquivo e transcrito por `/api/luizia-transcribe`.
- BuildAssist completo aceita imagens e audio, alem de texto/PDF.
- Web Search foi isolado em `lib/luizia-investidor-runtime.ts`.
- Perguntas sobre habilidades foram limitadas ao runtime Investidor, sem mudar o comportamento geral da Luiza.

## Correcao de Escopo

- Removido de `lib/luizia-core.ts`:
  - tipo `ResponsesClient`;
  - chamada `openai.responses.create`;
  - tool `web_search_preview`;
  - roteamento geral por `webSearch`;
  - resposta deterministica geral de habilidades.
- Removido de `app/(app)/buildassist/page.tsx`:
  - acao rapida "Buscar na web";
  - envio de `webSearch` para o contexto geral.
- Mantido em `components/layout/LuiziaFloatingChat.tsx` apenas o metadado neutro `webSearch`, que agora so tem efeito quando a skill detectada for `investidor`.

## Web Search Somente Leitura

- O caminho de busca web do Investidor chama apenas a hosted tool `web_search_preview`.
- Esse caminho nao recebe `SupabaseClient`, nao executa `execInvestidorAiTool`, nao oferece tools CRUD e sempre retorna `mutated: false`.
- Pedidos com intencao de alteracao nao entram no caminho de Web Search; seguem o fluxo Work existente de rascunho/confirmacao.
- Chat continua bloqueando pedidos de escrita antes de qualquer tool.

## CRUD e Confirmacoes

- Marco 6 permanece intacto:
  - Tarefas/Avisos continuam em runtimes proprios.
  - Investidor continua usando proposta pendente + `confirm_pending_action`.
  - Repetir confirmacao sobre proposta ja consumida continua dependente da camada existente de pending actions.
  - Nenhuma escrita foi adicionada fora das tools canonicas.

## Tabelas Legadas

- A correcao nao adiciona nem altera escrita em:
  - `subetapas_cronograma`;
  - `servicos_cronograma`;
  - obra-progresso legado.
- A busca web nao toca nessas tabelas nem em qualquer tabela operacional.

## Sobre 121 x 84 Testes

- A rodada anterior validou `npm run test` em um estado local que ainda reportava 8 arquivos / 84 testes.
- Depois de alinhar com `main`, a suite equivalente ao Marco 6 inclui tambem os testes do dominio Investidor, chegando a 10 arquivos / 121 testes.
- Nesta revisao deve ser considerada valida a suite completa atual de `main`: `npm run test`.

## Validacoes

- TypeScript: passou com `npx tsc --noEmit`.
- Testes completos: passou com `npm run test` - 10 arquivos, 121 testes.
- Build Next.js: passou com `npm run build`.
- Lint aplicavel: passou em `lib/luizia-core.ts`, `lib/luizia-investidor-runtime.ts` e `app/api/luizia-transcribe/route.ts`.
- Lint restrito incluindo `app/(app)/buildassist/page.tsx` e `components/layout/LuiziaFloatingChat.tsx`: falhou por erros legados preexistentes de `any` e `react-hooks/set-state-in-effect`, sem correcao nesta etapa.
- `git diff --check`: passou.

## Arquivos Principais

- `lib/luizia-core.ts`
- `lib/luizia-investidor-runtime.ts`
- `components/layout/LuiziaFloatingChat.tsx`
- `app/(app)/buildassist/page.tsx`
- `app/api/luizia-transcribe/route.ts`

## Fora do Escopo

- Marco 8.
- Agentes, automacoes, audio por microfone, anexos persistidos em banco ou editor de skills.
- Mudancas em Planejamento, Medicoes, Compras, Materiais, RDO ou Financeiro.
