# BuildSmart — Auditoria do Orçamento (Gate P3 — antes de continuar migração)

Branch: `processo`
Executor: Claude Code
Status: **AUDITORIA CONCLUÍDA — aguardando aprovação do plano de correção antes de codar**

Segue `PROCESSO_P3_REGRA_AUDITORIA_ANTES_MIGRACAO.md` (commit `1331e99`): nenhuma correção foi feita nesta rodada. Só mapeamento, reprodução do bug relatado e classificação. As correções abaixo são uma proposta, não uma execução.

---

## 1. Bug reproduzido: "Usar Template" ignora `processo_id`

**Causa raiz confirmada em código**, sem precisar reproduzir na UI:

`components/obra/TemplateOrcamentoModal.tsx`, função `UsarTemplateOrcamentoModal`:

- Props: `obraId?`, `projetoId?`, `orcamentoId` — **não existe `processoId`**.
- Linha 195: `select('id, obra_id, projeto_id')` — **não seleciona `processo_id`** do orçamento.
- Linhas 199-204:
  ```ts
  const obraIdEfetivo = orcamento.obra_id || obraId || null
  const projetoIdEfetivo = orcamento.projeto_id || projetoId || null
  if (!obraIdEfetivo && !projetoIdEfetivo) throw new Error('O orçamento precisa estar vinculado a um projeto ou obra.')
  ```
  Para um orçamento de Processo (`obra_id` e `projeto_id` ambos `null`), isso sempre lança o erro — é exatamente a mensagem que Luiz viu.
- Linhas 233-241: ao criar uma etapa nova a partir do template, o insert grava só `obra_id`/`projeto_id` — **mesmo que o guard acima fosse removido, a etapa criada não ganharia `processo_id`**, ficando invisível para `etapaContexto` (que filtra por `processo_id` quando é esse o contexto).

`components/obra/ObraOrcamento.tsx`, linha 3298-3305, chama esse modal sem passar `processoId`:
```tsx
<UsarTemplateOrcamentoModal
  open={showUsarTemplate} onClose={...}
  obraId={resolvedObraId || ''}
  projetoId={projetoId || orcamento.projeto_id || undefined}
  orcamentoId={orcamento.id}
  onApplied={() => loadAll()}
/>
```

**Causa raiz:** na P3.3, generalizei `etapaContexto` **dentro de `ObraOrcamento.tsx`**, mas esse mesmo raciocínio (obra_id/projeto_id → também processo_id) **não foi propagado para `TemplateOrcamentoModal.tsx`**, que resolve o contexto de etapa de forma própria e duplicada, sem reaproveitar `etapaContexto`. Isso é exatamente o tipo de "regra duplicada" que a nova diretriz de auditoria pede para caçar.

## 2. Segundo bug encontrado (não relatado por Luiz, achado nesta auditoria): "Estrutura via IA" nunca funcionou em fase de Projeto

`components/obra/OrcamentoEstruturaIAModal.tsx`:
- Prop `obraId: string` **obrigatória**, sem `projetoId` nem `processoId`.
- Linha 100: `supabase.from('etapas').select(...).eq('obra_id', obraId)`.
- Linha 111: `.insert({ obra_id: obraId, ... })`.

`ObraOrcamento.tsx` chama esse modal com `obraId={resolvedObraId || ''}` (linha 3318) e **o botão "Estrutura via IA" não é escondido em fase de Projeto** (mesma condição `!isReadonly` do botão "Usar template", sem checar `resolvedObraId`) — ou seja, esse recurso **já estava quebrado hoje em qualquer orçamento de Projeto sem Obra**, antes de existir Processo. Não é uma regressão desta iniciativa; é dívida pré-existente que a auditoria descobriu por estar seguindo o mesmo raciocínio.

## 3. Terceiro achado: "Reabrir (nova versão)" pode deixar itens da nova versão sem etapas visíveis fora de Obra

Em fase de Obra, `etapas` são compartilhadas entre versões do orçamento (filtradas só por `obra_id`) — reabrir funciona porque a hierarquia de etapas não muda.

Em fase de Projeto/Processo, `etapas` são **isoladas por `orcamento_id`** (comentário no próprio código: *"cada orçamento tem sua própria hierarquia de etapas... isolada por orcamento_id"*). Ao "Reabrir (nova versão)" (`confirmarReabrir`, linha ~2163), o código cria um novo `orcamentos` (novo `id`) e copia `orcamento_itens` — mas **cada item copiado mantém o `etapa_id` antigo**, que pertence à hierarquia da versão anterior. A nova versão nunca cria etapas próprias.

Efeito: ao carregar a versão nova em Projeto/Processo, `loadEtapas()` filtra `etapas` por `orcamento_id` da versão nova e não encontra nenhuma — a lista de etapas fica vazia, mas os itens copiados apontam para etapas "invisíveis" da versão antiga. Isso pré-existe desde a Estabilização V1 (afeta qualquer orçamento de Projeto reaberto), e vale igualmente para Processo. Não testei o efeito exato na tela (pode já ter alguma resiliência não vista no código-fonte), mas a lógica de dados aponta para esse problema.

## 4. Mapeamento — tabela manter / corrigir / extrair / remover depois

| Item | Classificação | Nota |
|---|---|---|
| `etapaContexto` em `ObraOrcamento.tsx` (leitura/criação/duplicidade/importação de etapas) | **MANTER** | Único ponto de bifurcação, já correto para obra/projeto/processo. Boa base para o contrato canônico do módulo. |
| CRUD de `orcamento_itens` (etapa/subetapa/item, composição própria, SINAPI, insumo livre) | **MANTER** | Escopado só por `orcamento_id`, sem dependência de raiz. Funciona igual em Obra/Projeto/Processo. |
| Totais e cálculos (BDI, gerenciamento, custo por item, breakdown M/MO/E) | **MANTER** | Calculado client-side a partir de `itens`, sem dependência de raiz. |
| `UsarTemplateOrcamentoModal` | **CORRIGIR** | Bug #1 acima — precisa aceitar `processoId`, ler `processo_id` do orçamento, e gravar `processo_id` nas etapas novas. Correção pequena e local (mesmo padrão já usado em `ObraOrcamento.tsx`). |
| `SalvarTemplateOrcamentoModal` | **MANTER** | Não depende de raiz nenhuma; já é agnóstico. |
| `OrcamentoEstruturaIAModal` | **CORRIGIR (bug pré-existente, não causado por Processo)** | Precisa do mesmo tratamento de `etapaContexto` — hoje só funciona em Obra. |
| "Reabrir (nova versão)" em fase Projeto/Processo | **CORRIGIR (bug pré-existente)** | Precisa recriar/realocar etapas da nova versão, não só copiar `orcamento_itens` com `etapa_id` antigo. |
| `ObraAssistenteDock` / `ObraAssistenteIA` (Luiza dentro do Orçamento) | **FORA DO ESCOPO desta rodada** | Exige `obraId` obrigatório; sem Obra, roda com string vazia (comportamento indefinido). Resolver isso é parte de P3.7 (IA/Luiza), não do saneamento estrutural do Orçamento. Por ora, classificar como legado tolerado. |
| `lib/materiais-sync.ts` (Sincronizar materiais) | **LEGADO — já ausente sem Obra, comportamento correto de não fazer nada, falta só feedback ao usuário** | Fora de escopo (Materiais é P3.6). Sugestão de UX simples (desabilitar/ocultar o botão sem Obra) pode entrar no saneamento sem tocar em Materiais. |
| `ImportarExportarOrcamentoModal.tsx` (XLSX) | **MANTER** | Sem dependência de obra_id/projeto_id encontrada; opera sobre `orcamento_id`/etapas via `etapaContexto` do componente pai. |
| Links/navegação para `/obras` e `/projetos` dentro do fluxo de Orçamento | **NÃO ENCONTRADO** | Não há `<Link href="/obras...">` nem `/projetos...` dentro de `ObraOrcamento.tsx` ou dos modais auditados — o componente em si não força navegação para fora do Processo. |
| Dependência de `ObraOrcamentoProvider`/`useObraOrcamento` | **NÃO ENCONTRADO** | Confirmado (grep) que `ObraOrcamento.tsx` e os modais não chamam esse hook — mesma conclusão da P3.3. |
| UI mobile (modais, densidade, navegação) | **REDESENHO MOBILE — necessário, não mapeado em detalhe nesta rodada** | Os problemas citados por Luiz (modais altos, densidade de campos, tabela desktop espremida) são plausíveis pela estrutura do componente (tabela ampla com muitas colunas, modais `size="lg"` para fluxos longos como template/importação), mas eu não tenho como validar visualmente neste ambiente. Preciso de: (a) confirmação visual de Luiz no preview mobile real, ou (b) uma rodada dedicada de redesenho mobile-first depois do saneamento funcional, conforme a seção "Regra de UI" do documento de auditoria. |

## 5. Escopo pedido explicitamente pelo documento — cobertura

| Fluxo pedido | Coberto? |
|---|---|
| Adicionar/editar/remover etapa | Sim — via `etapaContexto`, MANTER |
| Subetapa | Sim — via `orcamento_id`, MANTER |
| Composição própria / SINAPI / insumos | Sim — catálogos globais, sem dependência de raiz, MANTER |
| Totais e cálculos | Sim — MANTER |
| Versões/reabertura | Sim — bug #3 encontrado, CORRIGIR |
| Integração com Planejamento | Sim — já auditado na prática na P3.4 (mesmo padrão `etapaContexto`, replicado — não reaproveitado — dentro de `ObraPlanejamento2.tsx`; ver observação abaixo) |
| Ações de template | Sim — bug #1, CORRIGIR |

**Observação nova para o registro:** `ObraPlanejamento2.tsx` tem sua **própria cópia local** de `etapaContexto`, independente da de `ObraOrcamento.tsx` — são dois objetos com a mesma forma e propósito, mas duplicados em dois arquivos. Isso não é um bug funcional (ambos foram generalizados corretamente nas rodadas P3.3/P3.4), mas é exatamente o tipo de "regra duplicada" que a auditoria pede para não deixar passar. Registrado aqui para virar item do plano de saneamento (extrair `etapaContexto` para um helper único compartilhado por Orçamento e Planejamento) — não uma reescrita, uma extração pontual.

## 6. Plano de correção proposto (prioridade, não executado ainda)

1. **[Alta] Corrigir `UsarTemplateOrcamentoModal`** — aceitar `processoId`, selecionar `processo_id` do orçamento, gravar `processo_id` nas etapas novas. Reproduz exatamente o bug relatado por Luiz.
2. **[Alta] Corrigir "Reabrir (nova versão)" em fase Projeto/Processo** — a nova versão precisa recriar (ou realocar) as etapas, não só copiar itens com `etapa_id` da versão anterior. Afeta dados reais potencialmente hoje em Projeto, não só Processo — vale confirmar com Luiz se algum orçamento de Projeto real já foi "reaberto" e sofreu esse efeito antes de mexer.
3. **[Média] Extrair `etapaContexto` para um helper único** (ex.: `lib/processo/etapa-contexto.ts` ou local mais genérico, já que também serve Obra/Projeto legados), reaproveitado por `ObraOrcamento.tsx` e `ObraPlanejamento2.tsx` — elimina a duplicação registrada no item 5.
4. **[Baixa, pré-existente, fora do escopo do Processo] Corrigir `OrcamentoEstruturaIAModal`** para aceitar o mesmo contexto — bug antigo de fase Projeto, não causado por esta iniciativa. Priorizar conforme demanda real de uso (hoje incerto se alguém usa "Estrutura via IA" em fase de Projeto).
5. **[Baixa] Ocultar/desabilitar "Sincronizar materiais" quando não há Obra**, em vez de deixá-lo clicável sem efeito nem feedback.
6. **[Necessário, mas depende de validação visual de Luiz] Rodada de redesenho mobile-first do Orçamento**, separada desta — a auditoria não pode concluir por si só quais telas específicas estão ruins no mobile sem ver a tela real.

## 7. Decisão

**MANTER E SANEAR O MÓDULO ATUAL.**

Justificativa: o núcleo do módulo (`etapaContexto`, CRUD de itens/etapas, cálculos) está correto e já provou funcionar em 3 contextos (Obra, Projeto, Processo) sem duplicar dados nem regra de cálculo. Os bugs encontrados são **localizados e pequenos** (2 modais que não conhecem `processoId`, uma lacuna na duplicação de etapas ao reabrir versão) — não há evidência de que reconstruir o módulo custe menos que corrigir esses pontos específicos. Extrair a casca (opção 2) não se justifica: não há uma "casca legada" separável do domínio aqui, o componente já é essencialmente o domínio.

## 8. Instrução seguida

Conforme a instrução imediata do documento de auditoria: **nenhuma correção foi aplicada nesta rodada.** Aguardando aprovação do plano da seção 6 antes de iniciar qualquer código, dentro da mesma disciplina (SANEAR → MIGRAR → TESTAR REAL → CANONIZAR).
