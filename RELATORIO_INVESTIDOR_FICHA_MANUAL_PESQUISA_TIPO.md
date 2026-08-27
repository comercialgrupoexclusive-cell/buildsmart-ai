# Relatório — Investidor: ficha manual do imóvel + tipo correto na pesquisa de mercado

Hotfix a partir de 3 reclamações reais do usuário no Ativo "Francisco Bernardes — Alpes do Vale": (1) Visão Geral não tem como editar/inserir dados do imóvel; (2) Pesquisa de mercado buscava "Apartamento" para um imóvel que é uma Casa; (3) confirmação de que os links de "preencher" levam ao lugar certo.

## Diagnóstico (conferido ao vivo no Supabase, projeto `jwezrjyatfjvvsugtugo`)

Este Ativo **não tem prospecção de origem do lado da compra** — só existe a prospecção-sombra de venda (`Venda — Francisco Bernardes — Alpes do Vale`, `is_venda=true`), sem nenhuma linha em `prospeccao_ficha`. Ou seja: nenhum dado do imóvel (tipo, área, dormitórios) jamais foi registrado em lugar nenhum do sistema para este Ativo.

Isso expôs duas lacunas reais na Skill 1 (Mercado):

1. **`ProspeccaoFicha.tsx` só aceita dados via extração por IA** (link, PDF ou imagem). Não existia nenhum jeito de digitar manualmente "Casa", "3 dormitórios" etc. — um imóvel já adquirido, sem anúncio disponível, ficava com a ficha permanentemente vazia e sem solução.
2. **A "Visão Geral" do Ativo (`ProjetoResumoInvestimento.tsx`) não tinha nenhum ponto de entrada para editar dados do imóvel** quando não há prospecção de origem ("Cadastro direto") — só um texto estático, sem link nem botão algum.
3. Como consequência de (1), a pesquisa de comparáveis (`executarPesquisaComparaveis`) lia uma ficha vazia e não tinha nenhuma informação real de tipo de imóvel — a IA passou a **supor "apartamento"** sem nenhum dado que sustentasse isso.

## Correções

### 1. Entrada manual de campos — `components/investidor/ProspeccaoFicha.tsx`
Novo card "Adicionar informação manualmente": seletor com os campos conhecidos (Tipo do imóvel, Área, Dormitórios, Banheiros, Vagas, Estado/conservação, Preço anunciado, etc.) + "Outro campo…" para chave livre + valor + botão Adicionar.
- Se a ficha ainda não existe: cria a linha em `prospeccao_ficha` com `dados_confirmados` já preenchido (`status: 'parcial'`), sem depender de nenhuma extração.
- Se já existe: funde o novo campo em `dados_confirmados` existente.
- Dispara `buildsmart:investidor-changed` (mesmo evento usado pelo resto da Skill 1) para que outras telas abertas (ex.: o aviso de "ficha não validada" na Pesquisa de mercado) atualizem sozinhas.
- Mensagem do estado vazio atualizada para mencionar a opção manual.

### 2. Ficha visível na "Pesquisa de mercado" do Ativo — `app/(app)/projetos/[id]/page.tsx`
Um Ativo não tem uma aba "Imóvel" própria (ela só existe na Prospecção de origem, do lado da compra) — por isso a ficha do lado da venda nunca tinha onde ser preenchida a partir da tela do Ativo. A aba "Pesquisa de mercado" agora renderiza `<ProspeccaoFicha>` (a mesma do item 1) logo acima de `<ProspeccaoMercado>`, reaproveitando 100% do componente já existente — nenhuma tabela ou tela nova.

### 3. Pesquisa de comparáveis herda dados do lado da compra — `lib/luizia-investidor-runtime.ts`
`executarPesquisaComparaveis` agora, quando a prospecção é a prospecção-sombra de venda, busca a prospecção de origem (mesmo `project_id`, `is_venda=false`) e herda seu `endereco` e sua ficha (`dados_extraidos`/`dados_confirmados`) para dentro da descrição usada na busca — a ficha do próprio lado da venda, se já tiver algo, continua tendo prioridade. Isso não mudou nada para o caso real do Francisco Bernardes (que não tem lado de compra), mas corrige o caso geral de qualquer Ativo que tenha vindo de uma Prospecção com ficha já preenchida.

Reforçada também a instrução da busca: quando há um `tipo` confirmado na ficha, a instrução passa a dizer explicitamente **"pesquise exclusivamente por esse tipo de imóvel, nunca por outro (ex.: nunca troque 'casa' por 'apartamento')"** — não depende só do modelo notar isso dentro de um JSON solto.

### 4. Link "Preencher imóvel" corrigido — `components/investidor/ProjetoResumoInvestimento.tsx`
O botão apontava para `/projetos/[id]?tab=dados&edit=1#ficha-imovel` — a aba genérica "Dados Gerais" do Project (nome/cliente/endereço/data/responsável/status), que não tem nada a ver com os dados reais do imóvel nem com o cenário. Agora aponta para `/investidor/[prospeccaoId]?tab=decidir` — a aba Decidir da prospecção de origem, que (desde a rodada anterior) já mostra exatamente o que falta com link direto para a aba certa.

Também foi corrigido o estado "Cadastro direto" (Ativo sem prospecção de origem, como o Francisco Bernardes): antes só um texto estático; agora tem dois botões diretos — "Preencher dados do imóvel" (`?tab=mercado_venda`, onde a ficha do item 2 agora vive) e "Analisar viabilidade de venda" (`?tab=viabilidade_venda`).

## O que foi preservado
- Nenhuma tabela nova, nenhuma migração. `prospeccao_ficha` já era jsonb aberto (`dados_extraidos`/`dados_confirmados`) — a entrada manual só grava nesse mesmo formato.
- O motor de busca de comparáveis (`executarPesquisaComparaveis`) continua sendo o único lugar onde a lógica de busca roda — só ganhou mais contexto de entrada, nenhuma tool ou pipeline nova.
- `ProspeccaoFicha` continua sendo o único componente de ficha, reaproveitado tanto na Prospecção de compra quanto agora na aba de venda do Ativo.

## Validação
- `npx tsc --noEmit` — sem erros.
- `npx vitest run` — 200/200 testes passando.
- `npm run build` — build de produção concluído com sucesso (43 rotas).
- Conferido ao vivo via Supabase MCP: confirmado que "Francisco Bernardes — Alpes do Vale" não tinha nenhuma prospecção de origem nem ficha — a causa raiz das 3 reclamações.
