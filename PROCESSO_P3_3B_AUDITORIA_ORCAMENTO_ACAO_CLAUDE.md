# BuildSmart — P3.3B Auditoria e saneamento do Orçamento

Status: execução imediata na branch `processo`.

## Objetivo
O Orçamento já foi conectado ao Processo, mas ainda NÃO é considerado módulo canônico concluído. Antes de avançar para qualquer outro módulo, auditar o existente, corrigir dependências legadas e só então consolidá-lo no Motor de Processo.

Regra desta rodada:

AUDITAR → DEFINIR ALVO → SANEAR → MIGRAR → TESTAR REAL → CANONIZAR

Não avançar para Financeiro, Financiamento, Compras, Medições ou outro módulo enquanto o Orçamento não passar neste gate.

## Fatos já confirmados

1. `/processos/[id]` renderiza diretamente `components/obra/ObraOrcamento.tsx` com `processoId` e `orcamentoId`. Isso foi útil para integração rápida, mas significa que o shell novo ainda depende de um componente concebido originalmente para Obra.

2. `lib/processo/orcamento.ts` já cria/resolve `orcamentos` por `processo_id`, portanto a raiz nova existe e deve ser a única referência canônica para o novo fluxo.

3. `components/obra/TemplateOrcamentoModal.tsx` ainda trabalha com `obraId`/`projetoId` e consulta apenas `id, obra_id, projeto_id`. Se ambos estiverem vazios, lança: `O orçamento precisa estar vinculado a um projeto ou obra.`

4. Ao criar etapas via template, esse modal grava `obra_id` e `projeto_id`, sem `processo_id`. Esse é um bug funcional já reproduzido no mobile.

5. Existem ainda links/contextos globais antigos de Obra em áreas relacionadas a orçamento, materiais, medições e relatórios. Eles devem ser mapeados, mas corrigidos somente quando fizerem parte do fluxo do Orçamento nesta rodada; não transformar isso em refactor geral.

## Resultado obrigatório da auditoria
Antes de alterar código, gerar no relatório desta rodada um inventário de todas as ocorrências do fluxo do Orçamento que dependem de:
- `obraId` / `obra_id`;
- `projetoId` / `projeto_id`;
- rotas `/obras` ou `/projetos`;
- `useObraOrcamento` ou contexto global de Obra;
- mensagens/regras que exigem Projeto ou Obra como raiz;
- funções de `project-cycle` chamadas pelo Orçamento;
- sincronizações laterais para materiais/execução que pressuponham Obra;
- modais/componentes auxiliares do Orçamento com contrato legado.

Classificar cada ocorrência como:
A. reutilizável sem alteração;
B. corrigir para `processo_id`;
C. mover para domínio/Action do Orçamento;
D. manter legado apenas fora do fluxo Processo;
E. remover do fluxo canônico.

## Arquitetura alvo do módulo

`Processo -> Orçamento -> Actions/Services/Repositories -> dados do Orçamento`

Não aceitar como arquitetura final:

`Processo -> ObraOrcamento -> exceções para Processo`

O componente visual pode ser reaproveitado, mas a regra de negócio do novo fluxo deve reconhecer Processo como raiz nativa.

## Correções mínimas obrigatórias nesta rodada

### 1. Template de orçamento
Atualizar `UsarTemplateOrcamentoModal` para suportar `processoId` nativamente.

Requisitos:
- prop `processoId?: string`;
- consulta do orçamento deve incluir `processo_id`;
- validar coerência quando `processoId` for fornecido;
- aceitar orçamento ligado somente a Processo;
- remover, no fluxo Processo, a exigência de `obra_id` ou `projeto_id`;
- novas `etapas` criadas pelo template devem receber `processo_id`;
- preservar comportamento legado de Obra/Projeto fora do fluxo novo, se ainda necessário;
- teste explícito: aplicar template em orçamento que tenha apenas `processo_id`.

### 2. Adicionar etapa / subetapa / item
Auditar todos os inserts/updates de `etapas` e `orcamento_itens` usados pelo Orçamento.

No fluxo Processo:
- toda etapa pertencente ao orçamento deve estar coerentemente vinculada ao Processo;
- nenhuma criação pode depender de existir Obra ou Projeto;
- itens continuam pertencendo ao `orcamento_id`; não adicionar FKs redundantes sem necessidade.

### 3. Versões do orçamento
Auditar criação/reabertura/nova versão.

Requisito:
- nova versão de orçamento de Processo deve preservar `processo_id`;
- não converter nem criar Obra/Projeto como efeito colateral;
- estados/status devem permanecer do domínio Orçamento, sem alterar status global do Processo salvo Action explícita.

### 4. Finalização do orçamento
Auditar uso de `finalizarOrcamento` importado de `lib/project-cycle.ts`.

Decidir com evidência:
- se a função contém regra de Projeto/Obra, não usá-la como Action canônica do Processo;
- extrair/criar Action do domínio Orçamento para o novo fluxo;
- preservar a função antiga apenas para legado enquanto necessário.

### 5. Sincronização de materiais
Auditar `sincronizarMateriaisDoOrcamento` e qualquer efeito colateral disparado pelo Orçamento.

Não adaptar Materiais inteiro nesta rodada.
Somente garantir que:
- o Orçamento funcione completamente sem precisar de uma Obra;
- qualquer ação que dependa de módulo ainda não migrado fique explicitamente indisponível ou desacoplada no fluxo Processo, em vez de criar entidade legada escondida.

### 6. Links e navegação interna
No fluxo aberto por `/processos/[id]`:
- nenhuma ação do Orçamento pode mandar o usuário para `/obras/...` ou `/projetos/...`;
- voltar, editar, exportar, importar, template e demais ações devem permanecer dentro do contexto do Processo;
- rotas legadas podem continuar existindo para legado, mas não devem vazar para o novo shell.

## UX / mobile — correção nesta rodada
Não fazer redesign visual amplo antes do saneamento funcional, mas corrigir os problemas que impedem uso mobile do Orçamento.

Critérios mínimos:
- nenhum modal pode ultrapassar a viewport sem scroll interno funcional;
- tabs internas não podem depender de uma faixa horizontal cortada sem affordance clara;
- ação principal deve permanecer acessível em 360–430 px;
- formulário “Adicionar item” deve priorizar Etapa, Subetapa, fonte/item, quantidade e valor; campos secundários entram por progressive disclosure;
- evitar modal gigante com todos os campos simultaneamente;
- sem overflow lateral da página;
- touch targets adequados;
- testar pelo menos em viewport 390x844.

Não “embelezar” o legado por inteiro. Corrigir a casca apenas onde necessário para tornar o módulo funcional e utilizável no Processo.

## Testes obrigatórios
Criar/ajustar testes para pelo menos:
1. criar/obter orçamento por `processo_id`;
2. criar etapa em orçamento de Processo;
3. aplicar template em orçamento com somente `processo_id`;
4. nova versão preserva `processo_id`;
5. nenhum fluxo canônico exige `obra_id`/`projeto_id`;
6. ausência de navegação para `/obras`/`/projetos` a partir do fluxo Processo testado;
7. operações legadas existentes continuam funcionando quando explicitamente fora do fluxo Processo.

Executar ao final:
- TypeScript;
- testes;
- build;
- lint dos arquivos alterados;
- teste manual mobile do fluxo principal.

## Teste real Allegra — gate do módulo
Antes de marcar Orçamento como CANÔNICO, executar no Processo Allegra:
- abrir orçamento;
- aplicar template;
- criar etapa;
- criar subetapa;
- adicionar composição própria;
- adicionar insumo;
- adicionar item livre;
- editar quantidade/valor;
- salvar/reabrir versão se aplicável;
- verificar totais;
- abrir Planejamento sem quebrar o vínculo;
- repetir o essencial no mobile.

Registrar PASS/FAIL por item.

## Critério de saída
Orçamento só pode ser marcado como migrado/canônico quando:
- opera com `processo_id` como raiz nativa;
- não exige Projeto/Obra no fluxo Processo;
- templates funcionam;
- links não escapam para legado;
- ações principais funcionam no mobile;
- testes/build passam;
- Allegra passa no teste real.

## Relatório obrigatório
Criar na raiz do repositório ao concluir:
`RELATORIO_PROCESSO_P3_3B_ORCAMENTO.md`

O relatório deve conter:
- inventário encontrado;
- decisões A/B/C/D/E;
- arquivos alterados;
- bugs corrigidos;
- o que permaneceu legado e por quê;
- testes executados e resultado;
- resultado do teste mobile;
- resultado do teste Allegra;
- pendências reais, se houver.

Não iniciar o próximo módulo enquanto este relatório não estiver concluído e o Orçamento não tiver PASS.