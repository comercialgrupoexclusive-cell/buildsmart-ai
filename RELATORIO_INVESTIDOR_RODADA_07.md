# Laboratório Investidor — Rodada 7 (Marco 7: Multimodal + Web Search + Habilidades)

## 1. Resumo

Marco 7 entregue em duas partes, na ordem em que foram autorizadas:

**Parte 1 (commit `4d7e388`, já revisada e aprovada):**
- Fechado o CRUD de Evidências que ficou pendente da Rodada 6: `list_evidencias`, `propose_create_evidencia` e o caso `create_evidencia` no `confirm_pending_action` (faltava — sem ele, confirmar essa proposta caía no `default` de "não é do Investidor").
- Corrigido um bug real encontrado nesse trabalho: a chave interna `__alvoChave` (bookkeeping de qual rascunho substituir numa conversa, ver `lib/luizia-pending-actions.ts`) vazava para dentro do `insert` de `create_prospeccao`/`create_cenario`/`create_evidencia` — contra o Supabase real isso quebraria com "coluna desconhecida". Corrigido com `semChaveInterna()` e testes.
- Migrado **só** `lib/luizia-investidor-runtime.ts` de Chat Completions para a Responses API da OpenAI, habilitando a tool nativa `web_search` — sem provedor externo, sem segunda chave de API, por instrução explícita do usuário após correção do meu entendimento inicial (eu havia assumido, errado, que precisaria de um provedor de busca de terceiros).

**Parte 2 (esta entrega — o restante do Marco 7):**
- **Extração de link** (`extrair_link`, tool própria do Investidor, sem provedor externo — só `fetch` + limpeza de HTML).
- **Anexo multimodal no chat** (foto ou PDF), botão "+" do `LuiziaFloatingChat` habilitado só dentro do Laboratório Investidor.
- **Runtime processa o anexo**: imagem vira `input_image` (visão nativa da Responses API), PDF vira texto (reaproveita `/api/extract-pdf`, já existente), e a persona ganha instruções de extração com a disciplina observado/inferido/estimado já usada em Evidências.

Em nenhum momento desta rodada — nas duas partes — Tarefas, Avisos ou o Chat geral (`lib/luizia-core.ts` fora do roteamento já existente para Investidor) foram alterados, e nenhuma parte do Marco 8 foi antecipada.

## 2. Arquivos alterados (Parte 2 — este commit)

| Arquivo | Natureza |
|---|---|
| `lib/link-extract.ts` | **novo** — busca uma URL específica e extrai texto legível (sem dependência nova, sem provedor externo) |
| `lib/investidor-ai-tools.ts` | **alterado** — tool `extrair_link` (def + executor) |
| `lib/luizia-investidor-runtime.ts` | **alterado** — anexo multimodal (`InvestidorAnexo`, `montarMensagemUsuario`), `extrair_link` em `TOOLS_LEITURA`, persona ganha instruções de extração/evidência para foto/PDF/link |
| `lib/luizia-core.ts` | **alterado** — `LuiziaContext.investidorAnexo` (só a skill `investidor` lê) |
| `components/layout/LuiziaFloatingChat.tsx` | **alterado** — botão "+" habilitado só em `/investidor*`, seleção de imagem (base64) ou PDF (extração via `/api/extract-pdf`), chip de anexo pendente com remoção |
| `lib/__tests__/link-extract.test.ts` | **novo** — 7 testes (HTML→texto, erros, truncamento) |
| `lib/__tests__/luizia-investidor-runtime.test.ts` | **novo** — 12 testes (adaptação de tools, extração de fontes, montagem de mensagem multimodal, anexo vs. fast path) |
| `lib/__tests__/investidor-ai-tools.test.ts` | **alterado** — 3 testes novos de `extrair_link` |

## 3. Extração de link (`extrair_link`)

`lib/link-extract.ts` — `extrairConteudoDeLink(url)`:
- Valida a URL e o protocolo (só `http(s)`).
- `fetch` com timeout de 8s, limite de 3MB lidos via stream (`ReadableStream.getReader()`, cancela ao estourar).
- Recusa conteúdo que não seja `text/html`/`text/plain` (ex.: um link que aponte direto para um PDF — isso é outro caminho, o anexo de PDF).
- Limpa o HTML com regex (remove `<script>`/`<style>`/comentários, converte quebras de bloco em `\n`, decodifica entidades comuns) — sem nenhuma biblioteca nova (`cheerio`/`jsdom` não estavam no projeto; adicionar uma dependência para isso seria mais mudança do que o necessário).
- Trunca em 6000 caracteres, sinalizando `truncado`.

Exposta como a tool `extrair_link` (`lib/investidor-ai-tools.ts`), só leitura (está em `TOOLS_LEITURA`, disponível em Chat e Work). A descrição da tool deixa explícito para o modelo a diferença para `web_search`: aqui a URL já é conhecida, não é uma busca.

## 4. Anexo multimodal (foto/PDF) no chat

**Cliente (`LuiziaFloatingChat.tsx`):**
- O botão "+" (antes sempre desabilitado, "Anexar (em breve)") agora habilita quando `pathname` começa com `/investidor` — em qualquer outra tela continua exatamente como antes (desabilitado, mesmo título). Isso mantém a superfície nova 100% contida ao Laboratório Investidor sem precisar tocar a lógica de detecção de skill por texto.
- Imagem: lida como `data:` URL via `FileReader` no próprio navegador (sem upload a nenhum storage) — limite de 3MB (folga sob o limite prático de payload de Serverless Functions, já que a imagem em base64 vai dentro do corpo JSON da requisição a `/api/buildassist`).
- PDF: reaproveita o endpoint já existente `/api/extract-pdf` (usado hoje pelo BuildAssistente completo) via `FormData` — o texto extraído (já truncado em 15000 caracteres no servidor) é o que viaja para a Luiza, nunca o binário do PDF.
- Um chip discreto mostra o nome do arquivo pendente com um "×" para remover antes de enviar; erros (imagem grande demais, PDF ilegível, tipo de arquivo não suportado) aparecem no mesmo lugar.
- O anexo NUNCA é persistido em `sessionStorage` junto do histórico (`lib/luizia-chat-storage.ts` só grava `{role, content}`) — vale só para a mensagem em que foi enviado. O texto da mensagens do usuário salva só um rótulo (`📎 nome-do-arquivo.jpg`), nunca o base64.
- `context.investidorAnexo` só é incluído no corpo da requisição quando a skill detectada for `investidor` — em qualquer outra skill o campo nem existe no payload.

**Servidor:**
- `lib/luizia-core.ts`: `LuiziaContext` ganha o campo opcional `investidorAnexo` — só a branch `skill === 'investidor'` o lê e repassa a `runInvestidorSkill`. Nenhuma outra skill sabe que esse campo existe.
- `lib/luizia-investidor-runtime.ts`: `InvestidorAnexo` (`tipo: 'imagem'|'pdf'`, `nome`, `dataUrl?`, `textoExtraido?`) e `montarMensagemUsuario()` — monta a mensagem do usuário para a Responses API: imagem vira uma parte `input_image` (visão nativa, o `data:` URL vai direto pro modelo, sem storage intermediário); PDF vira uma parte `input_text` com o texto já extraído. Sem anexo, mantém o formato simples de sempre (string).
- Um anexo presente **nunca** aciona o fast path determinístico de "listar tudo" — o usuário mandou um anexo porque quer que o conteúdo dele seja processado, não uma listagem; isso vai direto para o loop com IA (testado).

## 5. Persona: disciplina de extração (observado/inferido/estimado)

A persona (`lib/luizia-investidor-runtime.ts`) ganhou instruções explícitas para quando a mensagem trouxer foto, texto de PDF ou resultado de `extrair_link`:
- Extrair as informações relevantes (valores, datas, condições, restrições, estado do imóvel).
- Classificar CADA informação antes de sugerir registrar: **observado** (literal na foto/PDF/página), **inferido** (concluído a partir do que foi visto, sem estar explícito) ou **estimado** (suposição/cálculo do próprio modelo) — nunca tratar um preço anunciado como o valor real de venda.
- Depois de extrair, oferecer registrar como evidência via `propose_create_evidencia` (Rodada 7 — Parte 1), citando a fonte (nome do arquivo, "foto enviada pelo usuário" ou a URL) e a data de hoje como `data_evidencia`, a menos que o próprio documento tenha outra data explícita.

Isso reaproveita 100% o mecanismo de Evidências já existente — nenhuma tool nova de "registrar extração", nenhuma tabela nova.

## 6. Fora de escopo desta rodada (documentado, não esquecido)

- **Habilidades** (a terceira parte do título do Marco 7, ao lado de Multimodal e Web Search): o usuário não pediu essa parte explicitamente nas instruções desta rodada (nem na Parte 1, nem na Parte 2 — a instrução de conclusão citou nominalmente #159–#161: link, anexo, processamento). Não há, hoje, nenhum precedente de "habilidades" customizáveis em nenhuma skill da Luiza (Tarefas/Avisos/Geral) para replicar o padrão — construir esse conceito do zero, sem especificação mais detalhada nem pedido explícito, seria extrapolar escopo. Registrado aqui como pendência explícita para o usuário decidir se entra nesta rodada ou fica para depois.
- **Marco 8** (Rotinas e Agentes, incluindo o "Agente de Prospecção"): não antecipado, por instrução explícita do usuário.
- **Upload de anexo para o Board/Arquivos da Prospecção**: o anexo desta rodada vive só na conversa (para a Luiza extrair e propor evidência) — ele não salva o arquivo em `prospeccao_arquivos`. Anexar de fato ao Board é uma ação que a própria UI já tem fora do chat; duplicá-la aqui não foi pedido e ampliaria escopo sem necessidade clara.

## 7. Testes executados

- **19 testes novos** nesta Parte 2:
  - `lib/__tests__/link-extract.test.ts` (7): URL inválida, protocolo não-http(s), limpeza de HTML (remove script/style/tags, preserva o texto), erro HTTP claro, rejeição de conteúdo não-HTML, truncamento em 6000 caracteres, erro de rede propagado de forma legível.
  - `lib/__tests__/luizia-investidor-runtime.test.ts` (12): adaptação Chat Completions → Responses API (`paraFunctionToolResponses`, incluindo o caso de erro para tool não-function), extração de texto+fontes de `web_search` (`extrairTextoComFontes`, dedupe de URL repetida, ignora itens que não são mensagem), montagem da mensagem do usuário com anexo (`montarMensagemUsuario` — sem anexo, com imagem, com PDF, com imagem e prompt vazio), e um par de testes que prova que um anexo presente força o loop de IA em vez do fast path de listagem (mockando `@supabase/supabase-js` com o mesmo `FakeDB`, para não depender de rede).
  - `lib/__tests__/investidor-ai-tools.test.ts` (+3): `extrair_link` pede a URL quando faltando, retorna o texto extraído (mockando `lib/link-extract.ts`), repassa o erro sem inventar conteúdo quando a extração falha.
- **`npx vitest run` completo: 150/150 passando** (19 novos desta parte + 7 da Parte 1 + 124 pré-existentes — nenhuma regressão em nenhum runtime, incluindo Tarefas/Avisos/motor de cálculo).
- Sem `OPENAI_API_KEY` neste ambiente (mesma limitação documentada nas Rodadas 3–6): o loop de function-calling com a Responses API em si (incluindo uma chamada real a `web_search`) não pôde ser smoke-testado fim a fim aqui — testado indiretamente via as funções puras extraídas (`paraFunctionToolResponses`, `extrairTextoComFontes`, `montarMensagemUsuario`) e via o comportamento determinístico de roteamento (fast path vs. loop).
- Tentativa de teste visual (Playwright + Chromium local) do botão de anexo em `/investidor`: bloqueada pela mesma limitação de rede documentada desde a Rodada 4 (`*.supabase.co` não acessível neste sandbox) — a tela nem carrega a lista de perfis ("Usuários não carregaram"), então não dá para abrir o chat flutuante autenticado aqui. Validado por leitura cuidadosa do JSX/lógica + tsc/build/lint limpos.

## 8. TypeScript / build / lint

- `npx tsc --noEmit -p .`: **sem erros**, checado a cada arquivo alterado e no projeto inteiro.
- `npm run build` (Next.js 16 + Turbopack): **compilado com sucesso**, todas as rotas geradas normalmente.
- `npx eslint` nos arquivos novos/alterados desta parte: **0 erros novos**.
  - `components/layout/LuiziaFloatingChat.tsx` mantém os mesmos 8 erros pré-existentes de antes desta rodada (2 grupos: `no-explicit-any` em 5 linhas do mapeamento de resultados do Supabase que eu não toquei, e 1 `set-state-in-effect` num `useEffect` de troca de perfil de Rodadas anteriores) — confirmado rodando `eslint` no HEAD anterior (`git stash`) e comparando a contagem/tipo, idêntica antes e depois.
  - `lib/link-extract.ts`, `lib/investidor-ai-tools.ts`, `lib/luizia-investidor-runtime.ts`, `lib/luizia-core.ts` e os 3 arquivos de teste: **0 erros**.

## 9. Diferenças entre especificação e implementação

- **Habilidades**: ver seção 6 — não implementado nesta rodada, pendência explícita para decisão do usuário (não há precedente de "habilidade customizável" em nenhuma skill hoje).
- Fora isso, nenhuma diferença nova em relação ao que já estava registrado na Rodada 6 (Comercialização, Board/Arquivos via chat, excluir Prospecção, duplicar cenário via chat).

## 10. Commit

Branch de trabalho: `previsoes/prazo-fornecimento-material`.
Parte 1 já commitada e enviada: `4d7e388`.
Esta Parte 2 será commitada e enviada a seguir, mantendo o branch de trabalho (sem merge em `main` até nova aprovação, seguindo o mesmo ritmo de pausa-para-revisão das rodadas anteriores).
