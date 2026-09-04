# Relatório de Progresso — BuildSmart Núcleo (Gates A–F)

Branch: `nucleo` (criada a partir de `main`, 6 commits, todos pushed para `origin/nucleo`).
Data: 2026-09-04. Escrito para outra IA auditar — cada seção diz o que foi feito, o que foi verificado de verdade, o que ficou pendente e por quê.

**Commits (mais antigo → mais novo):**
1. `1e9b1e1` — Gate A parte 1: etapa do orçamento nasce fechada por padrão
2. `ceeeeaf` — Gate A parte 2: BDI/Gerenciamento atrás de "Avançado"
3. `64c4861` — Gate C: `fase_investimento` + Audit
4. `b5705f3` — Gate D: custos de aquisição realizados
5. `71815ae` — Gate E: endereço obrigatório + geocoding + similaridade por distância
6. `d526d42` — Gate F: progressive disclosure na Ficha

(Gate B não gerou commit — foi só investigação/validação, ver seção própria.)

## Validação final (rodada no HEAD de `nucleo`, todos os 6 commits aplicados)

- `npx tsc --noEmit` — limpo.
- `npx vitest run` — **213/213 testes passando** (15 arquivos; eram 200 antes desta rodada — 13 novos: 9 em `geocoding.test.ts`, 5 em `investidor-ai-tools.test.ts` menos 1 já existente que não contava).
- `npm run build` — build de produção concluído com sucesso, incluindo a rota nova `/api/investidor/geocode`.
- `npx eslint` nos arquivos alterados — 0 erros novos. Erros/warnings pré-existentes (`react-hooks/set-state-in-effect` em `ProspeccaoFicha.tsx`, `<img>` em algumas telas) são os mesmos já documentados como aceitos em rodadas anteriores (ver `RELATORIO_INVESTIDOR_SKILL_01_MERCADO.md`) — não é regressão desta rodada.

**Limitação de ambiente (repetida de rodadas anteriores, não é bug):** este sandbox bloqueia saída de rede para hosts externos não-allowlisted (proxy retorna 403 "policy denial"). Confirmado neste round especificamente para `nominatim.openstreetmap.org` (Gate E) — mesma classe de restrição já documentada para `*.supabase.co` em rodadas anteriores. Onde a rede era necessária para validar de verdade (geocoding ao vivo), a lógica foi testada com testes unitários (fetch mockado) e o teste ao vivo fica pendente para o Luiz, em produção.

## Gate A — Orçamento mobile (Kickoff N06.1)

**Feito e commitado:**
1. **Etapa fechada por padrão.** O mecanismo de colapso por etapa/subetapa/composição já existia (contrariando parcialmente o diagnóstico do kickoff), mas o padrão era **aberto**. Um orçamento real com 17 etapas (`2025_02 - Residência D&R`, caso do levantamento original) abria com tudo expandido. Corrigido: etapa nunca tocada pelo usuário agora nasce fechada (`collapsed[etapa.id] ?? true`); uma vez que o usuário abre/fecha manualmente, o localStorage por obra continua exatamente como antes.
2. **BDI/Gerenciamento atrás de "Avançado".** Os percentuais eram sempre editáveis no card fixo de resumo. Agora o valor calculado (R$) continua sempre visível; o campo de edição do percentual só aparece com o toggle "Avançado" ligado.
3. **Achados que já estavam OK, não recriados:** collapse de composição/insumo (já existia, padrão fechado correto), card mobile empilhado (já existia — `hidden md:block` desktop / `flex flex-col md:hidden` mobile, tabela nenhuma no mobile), resumo sempre no topo (card sticky com Custo Material/Mão de Obra/Valor Direto/BDI/Gerenciamento/Total).

**Avaliado e explicitamente NÃO implementado:**
- **Botão de ação primária fixo no rodapé mobile.** Já existe um `<ObraAssistenteDock>` fixo (`fixed inset-x-0 bottom-0 z-[140]`) na mesma tela, e este repo já teve um bug documentado ("Fix fixed bottom composer bar overlapping page content", task histórica #39) de dock fixo colidindo com conteúdo. Sem conseguir verificar visualmente neste sandbox, decidi não arriscar uma segunda barra fixa que poderia colidir com a existente. **Pendência real:** se Luiz quiser isso, precisa de verificação visual ao vivo (celular real) antes ou depois de implementar.

**Critério de aceite do Kickoff N06.1 — status:**
1. Nenhum insumo/composição renderiza antes de expandir — ✅ (agora, com o fix do padrão).
2. Expandir etapa sem rolagem horizontal — ✅ (já era assim).
3. Botão de ação principal acessível sem rolar ao topo — ⚠️ parcial (existe no cabeçalho da lista, não fixo no rodapé — ver acima).
4. Desktop continua funcional — ✅ (só troquei defaults e visibilidade, nenhuma capacidade removida).
5. Nada de dado/etapa/composição/insumo se perde — ✅ (só reorganização de estado de UI).

## Gate B — Motor de cálculo (Kickoff N06.3, itens 1-4)

**Sem código alterado — só investigação e validação**, conforme a diretriz explícita ("se já bate, vira só ampliar fixture, não criar motor").

- `lib/investidor-calculadora.ts` já reproduz fielmente "Calculadora do Leilão.xlsx" (mesma fonte-ouro da Rodada 3), coberto por 29 testes.
- **BLOQUEADO:** os "9 imóveis reais do Rodrigo" (planilha "Modelo de Trabalho - Imoveis Leilao.xlsx" citada no kickoff) **não foram localizados** — busquei por título e por conteúdo no Drive ("Rodrigo", "Cenário Financeiro", "Imoveis Leilao") e não achei o arquivo. Verifiquei também se os dados já estariam carregados no Supabase como alternativa: **não estão** — só 2 dos 9 imóveis citados (Casa Cond - Guaíba, Francisca Bernardes) têm um Projeto real cadastrado no sistema, e **nenhum dos dois tem cenário financeiro preenchido** (nenhuma prospecção de origem vinculada). Sem a planilha nem os dados reais dos outros 7 imóveis, não há como ampliar a fixture de teste sem inventar dados — e "não recriar dados fictícios" é uma regra hard desta sessão. **Luiz precisa compartilhar a planilha (ou os dados dos 9 imóveis) para este item ser fechado de verdade.**
- Cadastro direto (`ProjetoResumoInvestimento.tsx`, branch `!prospeccao`) confirmado como fluxo válido já existente. É só a TELA de leitura — a criação do Projeto em si é o fluxo genérico de "novo projeto", fora do escopo do Investidor. "Grava a fase inicial correta" ficou resolvido pelo próprio Gate C (o campo não existia antes).

## Gate C — Fase operacional do Ativo (Kickoff N06.3, item 5)

**Migração aplicada (repo + Supabase, projeto `jwezrjyatfjvvsugtugo`):** `supabase/migrations/20260904160000_projetos_fase_investimento.sql`
- `projetos.fase_investimento` (text, nullable, `CHECK` com os 8 valores da spec V0: `aquisicao_concluida`, `regularizacao_posse`, `reforma`, `pronto_para_venda`, `a_venda`, `negociacao`, `vendido`, `encerrado`).
- RPC `mudar_fase_investimento(p_projeto_id, p_fase_investimento, p_profile_id)` — `SECURITY DEFINER`, atômica, grava Audit completo (`from`/`to`/`actor`/`timestamp`) em `portal_audit_log` (tabela **já existente**, reaproveitada — não criei tabela de auditoria nova; `portal_audit_log.projeto_id` já era nullable/suportado desde a migração `20260816175353`).

**UI:** novo card "Fase do Ativo" (`FaseAtivoCard` em `ProjetoResumoInvestimento.tsx`), visível tanto no fluxo normal quanto no cadastro direto.

**Dados reais definidos e conferidos ao vivo:**
- Casa Cond - Guaíba (`3b86354d-3310-4546-a650-06eba2cd6ef8`) → `reforma`
- Francisca Bernardes — Alpes do Vale (`bc6c487e-6f98-44f3-b627-8f7cd36af957`) → `regularizacao_posse`
- Audit log verificado (`from: null → to: <fase>`, `created_at` real) para os dois.

**Perguntas abertas do kickoff (N06.3) que seguem sem resposta de Luiz:**
- Nome técnico `fase_investimento` foi usado como sugerido — sem confirmação explícita de Luiz.
- Registro retroativo de Prospecção "Adquirida" ao cadastrar um Ativo direto: **não implementado** (não era um item de código pedido, era uma pergunta aberta) — comportamento atual: nenhum registro retroativo acontece.
- "% Ganho de Capital"/"% ITBI por cidade" configuráveis por Organization: **não tocado** — continuam por cenário (`PremissasCenario`), como já eram.

## Gate D — Custos de aquisição realizados (Kickoff N06.3, item 6)

**Migração aplicada:** `supabase/migrations/20260904170000_investidor_custos_aquisicao.sql`
- Tabela nova `projeto_custos_aquisicao` (categoria + valor + comprovante opcional, vinculada a `projetos`, RLS permissiva igual às demais tabelas do Investidor). 8 categorias: comissão do leiloeiro, ITBI, registro, escritura, advogado de desocupação, certidões/outros, IPTU pago, condomínio pago.

**Componente novo:** `components/investidor/ProjetoCustosAquisicao.tsx` — lista + formulário de lançamento + upload de comprovante (reaproveita o bucket `project-files` e o padrão de `ProspeccaoArquivos.tsx`, sem tabela de arquivo nova). Mostra Previsto (`investimento_total` do cenário principal) × Realizado (soma dos lançamentos) × Diferença. Embutido na Visão Geral do Ativo (`ProjetoResumoInvestimento.tsx`), nos dois ramos (com e sem prospecção de origem).

**Testado ao vivo:** insert + select + delete de um lançamento de teste real no Supabase (linha removida depois — não é dado fictício persistido, era só para provar que a tabela/RLS funcionam).

**NÃO lancei nenhum custo real nos 2 Ativos piloto** — não tenho os valores reais pagos (comissão, ITBI etc.) para Casa Cond - Guaíba nem Francisca Bernardes. O critério de aceite #5 do kickoff ("lançar um custo real... e ver refletido no comparativo") precisa ser feito pelo próprio Luiz na UI, com os valores reais que só ele tem.

## Gate E — Endereço/geocoding/comparáveis por distância (Kickoff N06.2)

**Migração aplicada:** `supabase/migrations/20260904180000_investidor_geocoding.sql`
- `prospeccoes.latitude`/`longitude` (nullable, aditiva).
- `prospeccao_comparaveis.latitude`/`longitude` (nullable, aditiva).

**Serviço de geocoding escolhido: Nominatim (OpenStreetMap).** Motivo: gratuito, sem chave de API, sem billing — adequado ao volume atual (poucas prospecções/comparáveis por vez), conforme pedido explícito do kickoff ("priorize custo zero/baixo"). Trade-off aceito: limite de uso justo de 1 req/s e exige um User-Agent identificável — por isso a chamada é sempre server-side (nunca direto do navegador): `lib/geocoding.ts` (funções puras testáveis: `geocodeEndereco`, `haversineKm`, `corrigirSimilaridadePorDistancia`, `parseNominatimResponse`) + `app/api/investidor/geocode/route.ts` (endpoint fino).

**Endereço obrigatório e específico:** `NovaProspeccaoModal` (`app/(app)/investidor/page.tsx`) e o formulário de edição da Prospecção (`app/(app)/investidor/[id]/page.tsx`) agora **bloqueiam o salvamento se o endereço não for geocodificável** — não é só "campo não vazio", é "geocoding real teve sucesso", com mensagem acionável ("informe um endereço mais específico") quando falha. Isso satisfaz "endereço estruturado e específico" sem heurística arbitrária de tamanho de string.

**Comparáveis por distância real:** `registrar_comparaveis_brutos` (`lib/investidor-ai-tools.ts`) agora geocodifica cada comparável (best-effort, a partir do título/endereço do anúncio) e **corrige a similaridade que a IA declarou usando a distância real** — só para baixo (nunca promove "entorno" para "mesmo prédio"; nunca contraria uma alegação já conservadora). Limites usados: mesmo prédio ≤150m, mesma rua ≤500m, entorno ≤2km, senão bairro. Como a UI (`ProspeccaoMercado.tsx`) já ordena por similaridade (`rankSimilaridade`), a correção na gravação já propaga automaticamente para ordenação/exibição, sem precisar tocar na tela.

**"Campo de gambiarra" de digitação manual:** busquei de novo (grep amplo em `ProspeccaoMercado.tsx`, sem match nenhum) — **confirmado que não existe**. O item do diagnóstico original (que já vinha marcado como incerto na rev.2 do kickoff) está definitivamente resolvido: nunca existiu ou já foi removido antes desta sessão.

**NÃO implementado (escopo contido deliberadamente):** badge de "X km" ou um sort explícito "Menor distância" na UI de comparáveis. A correção de similaridade na gravação já resolve o critério de aceite ("nunca 'mesmo prédio' sem sentido"); a exibição explícita da distância em km fica como melhoria de UI para uma rodada futura, não essencial ao Gate.

**NÃO verificado ao vivo:** chamada real ao Nominatim (sandbox bloqueia a saída de rede, 403 policy denial confirmado via `/__agentproxy/status`). A lógica de parsing/correção foi testada com fetch mockado (14 testes novos). **Luiz precisa testar em produção** — criar/editar uma prospecção real com um endereço válido e confirmar que o geocoding resolve.

## Gate F — Progressive disclosure na Ficha (Kickoff N06.2, item 5)

`components/investidor/ProspeccaoFicha.tsx`: por padrão, cada campo mostra só o valor confirmado (editável) — a distinção extraído/confirmado + badge de conflito fica atrás de um toggle "Ver origem do dado" (mesmo padrão visual do "Avançado" do Gate A, para consistência). Um indicador discreto (pontinho laranja) no próprio botão avisa quando há divergência mesmo com a origem escondida, para não esconder um conflito real do usuário. Nenhuma lógica de validação/conflito mudou — só a apresentação, exatamente como pedido ("Muda: só a camada de apresentação").

## Arquivos alterados/criados (resumo, `main..nucleo`)

- `components/obra/ObraOrcamento.tsx` — Gate A
- `supabase/migrations/20260904160000_projetos_fase_investimento.sql` — Gate C
- `components/investidor/ProjetoResumoInvestimento.tsx` — Gates C, D (card Fase + card Custos)
- `app/(app)/projetos/[id]/page.tsx` — Gate C (tipo `fase_investimento` + prop)
- `supabase/migrations/20260904170000_investidor_custos_aquisicao.sql`, `components/investidor/ProjetoCustosAquisicao.tsx` — Gate D
- `supabase/migrations/20260904180000_investidor_geocoding.sql`, `lib/geocoding.ts`, `app/api/investidor/geocode/route.ts`, `lib/__tests__/geocoding.test.ts` — Gate E
- `app/(app)/investidor/page.tsx`, `app/(app)/investidor/[id]/page.tsx`, `lib/investidor-ai-tools.ts`, `lib/__tests__/investidor-ai-tools.test.ts`, `lib/types.ts` — Gate E
- `components/investidor/ProspeccaoFicha.tsx` — Gate F

## O que fica pendente de verdade (não é "esquecido", é bloqueado por algo que só o Luiz resolve)

1. **Planilha/dados dos 9 imóveis reais do Rodrigo** (Gate B) — sem isso não dá para ampliar a fixture de teste do motor de cálculo com os casos reais restantes.
2. **Verificação visual ao vivo** de: botão fixo no rodapé mobile do Orçamento (não implementado, ver Gate A); geocoding real funcionando em produção (Gate E, testado só com mock).
3. **Lançamento real de custos de aquisição** nos 2 Ativos piloto (Gate D) — só o Luiz tem os valores reais pagos.
4. **3 perguntas abertas do Kickoff N06.3** sem resposta ainda (nome do campo, registro retroativo de Prospecção, escopo de configuração por Organization) — ver Gate C.
