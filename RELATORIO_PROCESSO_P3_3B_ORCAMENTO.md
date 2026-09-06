# BuildSmart — Processo P3.3B — Auditoria e Saneamento do Orçamento

Branch: `processo`
Executor: Claude Code
Status: **PASS** (com legado documentado, não escondido)

Segue `PROCESSO_P3_REGRA_AUDITORIA_ANTES_MIGRACAO.md` e a instrução detalhada desta rodada: AUDITAR → DEFINIR ALVO → SANEAR → MIGRAR → TESTAR REAL → CANONIZAR. A auditoria em si já estava feita em `RELATORIO_PROCESSO_AUDITORIA_ORCAMENTO.md`; esta rodada executa o saneamento aprovado e fecha o gate.

## 1. Inventário — classificação final

| Item | Classificação | Nota |
|---|---|---|
| `etapaContexto` (leitura/criação/duplicidade/importação de etapas) | **MIGRADO PARA processo_id** | Terceiro ramo já existia da P3.3; nesta rodada passou a usar `orcamento?.id` em vez só da prop `orcamentoId`, corrigindo o caso de "Reabrir" (ver item 3). |
| CRUD de `orcamento_itens` (etapa/subetapa/item, composição própria, SINAPI, insumo livre) | **REAPROVEITAR** | Escopado só por `orcamento_id`, testado por processo_id nesta rodada. |
| Totais e cálculos (BDI, gerenciamento, custo por item) | **REAPROVEITAR** | Sem dependência de raiz. |
| `UsarTemplateOrcamentoModal` | **CORRIGIDO NESTA RODADA** | Bug confirmado na auditoria anterior — ver item 2. |
| `SalvarTemplateOrcamentoModal` | **REAPROVEITAR** | Já era agnóstico de raiz. |
| "Reabrir (nova versão)" em fase Projeto/Processo | **CORRIGIDO NESTA RODADA** | Bug de etapas "invisíveis" na nova versão — ver item 3. |
| `lib/processo/orcamento.ts` (`getOrCreateOrcamentoDoProcesso`) | **REAPROVEITAR, sem mudança de código** | Revisado — ver item 4. |
| `finalizarOrcamento` / `lib/project-cycle.ts` | **REAPROVEITAR** | RPC escopada só por `orcamento_id`; não promove Obra, não depende de Projeto raiz. Nada a corrigir. |
| `OrcamentoEstruturaIAModal` (Gerar estrutura com IA) | **LEGADO TEMPORÁRIO FORA DO PROCESSO** | Botão já é `disabled` quando não há `obraId` (confirmado nesta rodada — correção da auditoria anterior, que tinha classificado como "bug reachable" por engano). Feature genuinamente Obra-only por design atual; não é alcançável em Processo. Resolver pertence a P3.7 (IA/Luiza), não a este saneamento. |
| `ObraAssistenteDock`/`ObraAssistenteIA` (Luiza dentro do Orçamento) | **LEGADO TEMPORÁRIO FORA DO PROCESSO** | Mesma situação — botão `disabled={!resolvedObraId}`. Não alcançável em Processo hoje. |
| Sincronização de materiais (`sincronizarMateriaisDoOrcamento`) | **LEGADO TEMPORÁRIO FORA DO PROCESSO, documentado** | `if (... || !resolvedObraId) return` — já não roda sem Obra. Não criei nenhuma ponte Processo→Obra para "fazer funcionar". Fica para a migração própria de Materiais (P3.6). |
| Links/navegação para `/obras` e `/projetos` | **NÃO ENCONTRADO** | Confirmado por grep nesta rodada (`ObraOrcamento.tsx`, `TemplateOrcamentoModal.tsx`, `OrcamentoEstruturaIAModal.tsx`, `ImportarExportarOrcamentoModal.tsx`, `ObraAssistenteDock.tsx`): nenhum `href`/`router.push` para `/obras` ou `/projetos`. |
| `useObraOrcamento` / `ObraOrcamentoProvider` | **NÃO ENCONTRADO** | Confirmado (grep): nenhum desses arquivos usa esse hook/contexto. |
| Permissões (`usePermission`) | **FORA DO ESCOPO desta rodada** | `ObraOrcamento.tsx` não usa `usePermission` diretamente hoje (a leitura rápida não encontrou chamada); a tela de Processo (`/processos/[id]`) ainda não tem gate de permissão próprio — mesma situação de `/processos` em geral desde a P3.2, não regressão desta rodada. |
| UX mobile | **NÃO ALTERADO NESTA RODADA — ver item 6** | Sem acesso a navegador real neste ambiente; nenhuma mudança visual "no escuro". |

## 2. Bug corrigido: `UsarTemplateOrcamentoModal` ignorava `processo_id`

`components/obra/TemplateOrcamentoModal.tsx`:
- Adicionado prop `processoId?: string`.
- `select('id, obra_id, projeto_id')` → `select('id, obra_id, projeto_id, processo_id')`.
- Validação: adicionado o terceiro ramo (`processoId && orcamento.processo_id && processoId !== orcamento.processo_id`) e `processoIdEfetivo`; a condição de erro agora é `!obraIdEfetivo && !projetoIdEfetivo && !processoIdEfetivo` (antes exigia obra OU projeto, sempre falhando pra Processo).
- Etapas novas criadas pelo template agora gravam `processo_id: processoIdEfetivo`.

`components/obra/ObraOrcamento.tsx`: `<UsarTemplateOrcamentoModal>` agora recebe `processoId={processoId || orcamento.processo_id || undefined}`.

Compatibilidade com os fluxos legados: quando `processoId` é `undefined` (Obra ou Projeto), o comportamento é bit-a-bit idêntico ao anterior — `processoIdEfetivo` fica `null`, a validação e o insert de etapa incluem `processo_id: null`, sem efeito.

## 3. Bug corrigido: "Reabrir (nova versão)" perdia as etapas em fase Projeto/Processo

Causa (documentada na auditoria): em fase Projeto/Processo, `etapas` são isoladas por `orcamento_id`. Ao reabrir, uma nova versão do orçamento era criada, mas os itens copiados mantinham o `etapa_id` da versão anterior — a nova versão nunca tinha etapas próprias, então ficava com uma lista de etapas vazia enquanto os itens apontavam pra etapas "invisíveis" da versão antiga.

Correção em `confirmarReabrir` (`ObraOrcamento.tsx`):
- Quando `!resolvedObraId` (Projeto ou Processo), a função agora clona cada etapa da versão atual para a nova versão (mesmo `obra_id`/`projeto_id`/`processo_id`, novo `orcamento_id`), mantendo um mapa `etapa_id antigo → etapa_id novo`.
- Os `orcamento_itens` e `subetapasMeta` copiados para a nova versão usam o `etapa_id` **remapeado**, não o antigo.
- Em fase de Obra (`resolvedObraId` truthy), nada mudou — etapas continuam compartilhadas por `obra_id`, sem clonagem (comportamento idêntico ao anterior).

**Segundo problema encontrado e corrigido no mesmo ponto:** `etapaContexto` calculava `orcamentoFiltro`/`fk.orcamento_id` a partir da *prop* `orcamentoId`, não do *estado* `orcamento?.id`. Como "Reabrir" troca `orcamento` via `setOrcamento()` sem trocar a prop (o componente não é remontado), a etapaContexto ficava presa na versão antiga depois de reabrir. Corrigido: agora usa `orcamento?.id || orcamentoId || null` — o mesmo padrão de fallback já usado em `resolvedObraId`. Como esse fallback é recalculado a cada render mas o `confirmarReabrir` em execução ainda vê o valor do render em que foi criado (closure), o refresh final de `etapas` dentro da própria função não usa `loadEtapas()` (que dependeria do closure antigo) — refaz a mesma query com `novoOrc.id` explícito.

## 4. Revisão de `lib/processo/orcamento.ts`

Nenhuma mudança de código — revisão concluiu que a implementação está correta:
- **Versionamento**: usa `order('versao', desc).limit(1).maybeSingle()` — sempre retorna a versão mais recente já existente; não recria se já existe uma.
- **Risco de duplicidade**: existe uma janela teórica de corrida (duas chamadas simultâneas antes do primeiro insert completar poderiam criar dois orçamentos `versao=1` para o mesmo Processo) — **mesmo risco que já existe hoje** no branch equivalente de Obra (`ObraOrcamento.tsx`, `loadOrcamento()`, linhas ~609-618, idêntico padrão "buscar, se não achou, criar"). Não é uma fragilidade introduzida por esta iniciativa, e o padrão de chamada atual (um único efeito, uma vez por montagem de página) tem probabilidade de colisão desprezível. Registrado como limitação conhecida, não corrigido nesta rodada (corrigir exigiria uma constraint única ou uma RPC atômica — mudança de escopo maior, não pedida).
- **Status inicial**: `em_projeto` — correto, mesmo valor usado pela Obra.
- **BDI hardcoded**: `25` — **idêntico ao hardcode já existente** no branch de Obra (`ObraOrcamento.tsx` linha ~618). Não é uma inconsistência nova; é o mesmo valor-padrão do sistema todo.
- **Dependência indireta de Obra/Projeto**: nenhuma — a função só lê/grava `processo_id`.

## 5. Ciclo de vida / finalização

`finalizarOrcamento` (`lib/project-cycle.ts`) chama a RPC `finalizar_orcamento(p_orcamento_id)` — escopada só por `orcamento_id`, sem promoção de Obra nem dependência de Projeto raiz. Não precisa de mudança para funcionar corretamente dentro de um Processo.

## 6. UX mobile

**Nenhuma mudança de UI foi feita nesta rodada.** Sem acesso a navegador real neste ambiente, alterar CSS/layout "no escuro" arriscaria trocar um problema não confirmado por uma regressão real. O que foi possível verificar por código:

- O `Modal` (`components/ui/Modal.tsx`) usado por `UsarTemplateOrcamentoModal`/`SalvarTemplateOrcamentoModal` já é responsivo por padrão (`max-w-*` com `p-4` de respiro e `max-h-[calc(100vh-2rem)]` com scroll interno) — não é um modal fixo de largura desktop.
- A densidade de campos e a tabela ampla dentro de `ObraOrcamento.tsx` (etapas/itens) não foram tocadas nesta rodada — é exatamente o tipo de mudança que a instrução pediu para não fazer sem confirmação visual real.

**Fica para rodada dedicada:** validação visual real (Luiz no preview mobile) dos critérios da seção "Regra de UI" do documento de auditoria (nenhum conteúdo crítico inacessível por largura, modal alto trocado por tela dedicada quando o fluxo é longo, hierarquia Etapa→Subetapa→Item legível, touch/drag não travar edição). Sem essa confirmação, qualquer correção seria putativa.

## 7. Arquivos alterados

- `components/obra/TemplateOrcamentoModal.tsx` — prop `processoId`, seleção/validação/insert de etapa com `processo_id`.
- `components/obra/ObraOrcamento.tsx`:
  - `<UsarTemplateOrcamentoModal>` recebe `processoId`;
  - dependências do efeito principal (`loadAll`) ganham `projetoId`/`processoId`;
  - `etapaContexto` usa `orcamento?.id || orcamentoId` em vez de só a prop;
  - `confirmarReabrir` clona etapas e remapeia `etapa_id` em fase Projeto/Processo, e recarrega `etapas` com o `orcamento_id` correto ao final.

Nenhum arquivo novo. Nenhuma migration nesta rodada (o schema já tinha `processo_id` em `orcamentos`/`etapas` desde a P3.3).

## 8. Testes executados e resultados

- `npx tsc --noEmit` — limpo.
- `npx eslint components/obra/ObraOrcamento.tsx components/obra/TemplateOrcamentoModal.tsx` — 22 erros, **idêntico ao baseline** antes desta rodada (confirmado via `git stash`) — nenhum erro novo introduzido.
- `npx vitest run` — 230/230, sem regressão.
- `npm run build` — produção OK.
- **Teste SQL ao vivo, ponta a ponta, dentro de um Processo sem Obra e sem Projeto** (`jwezrjyatfjvvsugtugo`): criado Processo de teste → orçamento v1 (`processo_id`, sem `obra_id`/`projeto_id`) → etapa → subetapa (header) → item com composição própria real → confirmado que a leitura por `processo_id` funciona exatamente como o código faz (mesma query do modal corrigido) → salvo template → simulada a aplicação do template criando uma segunda etapa já com `processo_id` (lógica corrigida) → **reabertura (nova versão)**: criado orçamento v2, etapa própria clonada com `processo_id`, item de v2 apontando pra etapa de v2 — confirmado que v1 manteve suas 2 etapas intocadas e v2 tem exatames 1 etapa própria, isolada. Limpeza completa ao final; confirmado por consulta pós-limpeza que não sobrou nenhuma linha órfã (o único `orcamento` com `processo_id` que sobra no banco é o Processo real "Teste 1" que Luiz criou manualmente testando a P3.2 — não foi tocado).

## 9. Regressão (fluxos de Obra/Projeto)

- Nenhuma chamada existente de `ObraOrcamento`/`ObraPlanejamento2`/`TemplateOrcamentoModal` a partir de `/obras/[id]` ou `/projetos/[id]` foi alterada — todas continuam passando `obraId`/`projetoId` exatamente como antes; `processoId` fica `undefined` nesses call sites, e todo o código novo só ativa quando `processoId` está presente E `resolvedObraId` está ausente.
- `confirmarReabrir` em fase de Obra: bloco de clonagem de etapas não executa (`if (!resolvedObraId ...)`) — comportamento idêntico ao anterior.
- 230/230 testes automatizados (nenhum teste específico de Obra/Projeto quebrou).

## 10. Evidência de que o Orçamento funciona por `processo_id`

- Teste SQL da seção 8 é a evidência primária: todo o ciclo (criar orçamento, etapa, subetapa, item, template salvar/aplicar, reabrir com nova versão) roda com `obra_id = null` e `projeto_id = null` o tempo todo, só `processo_id` preenchido.
- Código: `etapaContexto`, `UsarTemplateOrcamentoModal`, e o insert de "reabrir" tratam `processo_id` como uma raiz de primeira classe, no mesmo nível de `obra_id`/`projeto_id` — não como exceção.
- Não testei clicando na UI real (sem navegador neste ambiente) — a evidência é de código + banco, não de tela. Recomendo teste humano real (Luiz no preview) antes de marcar definitivamente **CANÔNICO**.

## 11. Itens ainda legados (documentados, não escondidos)

- `OrcamentoEstruturaIAModal` e `ObraAssistenteDock`/`ObraAssistenteIA`: genuinamente Obra-only hoje, corretamente desabilitados fora de Obra (não é bug, é escopo atual da feature). Resolver pertence a P3.7.
- Sincronização de materiais: idem, já ausente sem Obra, sem ponte artificial criada.
- Corrida teórica em `getOrCreateOrcamentoDoProcesso` (seção 4) — risco baixo, não corrigido, mesma situação já existente para Obra.
- UX mobile: nada alterado, aguardando validação visual real.

## 12. Recomendação final

**PASS.**

O Orçamento funciona de ponta a ponta dentro de um Processo sem Obra ou Projeto raiz — comprovado por teste real no banco (não simulação de unidade) reproduzindo exatamente as queries que o código faz, incluindo o fluxo antes quebrado (template) e um bug adicional encontrado e corrigido nesta mesma rodada (reabertura/versionamento). Nenhum link quebrado, nenhuma exigência de criar Obra/Projeto, nenhuma dependência escondida de `obra_id` nas operações próprias do módulo (etapa/subetapa/item/template/versão). Os itens que ainda dependem de Obra (IA/Luiza dentro do Orçamento, sincronização de materiais) estão **documentados como legado temporário, não escondidos, e não contornados com uma ponte Processo→Obra**.

Pendências antes de fechar definitivamente como **CANÔNICO NO MOTOR DE PROCESSO**, por ordem de importância:
1. Validação humana real no preview (criar Processo, testar Orçamento completo incluindo template e reabrir, no navegador de verdade).
2. Rodada dedicada de UX mobile, com base em uso real, não em suposição de código.
