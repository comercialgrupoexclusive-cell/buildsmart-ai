# BuildSmart — P3 Plano de Ação do Novo Motor de Processo

Branch: `processo`
Executor de implementação: Claude
Status: aprovado para execução técnica

## 1. Objetivo

Implementar um Motor de Processo novo, canônico e modular no BuildSmart, sem reutilizar `projetos` ou `obras` como raiz disfarçada.

O novo domínio deve ter uma única raiz operacional: `processos`.

O desenho deve aproveitar a ideia central do OpenConstructionERP: core pequeno, módulos autocontidos, ativáveis/desativáveis e todos consumindo uma camada canônica de dados. Não copiar sua escala nem sua quantidade de infraestrutura.

Princípios obrigatórios:
- Processo é a única raiz operacional.
- Módulos existentes devem ser preservados quando funcionam; adaptar vínculos e contratos, não reescrever por estética.
- Cada módulo deve poder evoluir sem acoplamento direto às tabelas de outro módulo.
- Toda escrita de negócio passa por Actions/Services do domínio dono.
- IA, interface e API resolvem primeiro o Processo.
- Sem `obra_id` ou `projeto_id` como raiz operacional no código novo.
- Legado só permanece durante a migração e não pode definir a arquitetura nova.

## 2. Separação obrigatória de indicadores

Não misturar os três eixos abaixo:

### 2.1 Avanço físico
Representa execução real da obra/processo.
Fonte: medições físicas, quantidades executadas, etapas/subetapas, progresso acumulado.
Nunca derivar avanço físico de pagamento.

### 2.2 Avanço financeiro
Representa desembolso/custo realizado do Processo.
Fonte: compras, materiais, mão de obra, equipamentos, gerenciamento, serviços e demais lançamentos financeiros.
Pode ser comparado ao orçamento, mas continua sendo indicador próprio.

### 2.3 Financiamento
Representa fonte/liberação/reembolso de recursos.
Fonte: contrato de financiamento, medições do agente financeiro, liberações, FGTS, recursos próprios, reembolsos recebidos e pendentes.
Não confundir financiamento com custo executado nem com avanço físico.

O dashboard e relatórios devem tratar os três como séries e estados independentes, ainda que possam ser comparados em uma mesma visão.

## 3. Arquitetura alvo mínima

### 3.1 Core do Motor
Criar domínio `processo` com responsabilidade apenas por:
- identidade do Processo;
- dados gerais;
- status principal;
- template/tipo;
- módulos habilitados;
- responsáveis/permissões;
- auditoria de alterações do Processo;
- registro/descoberta dos módulos disponíveis.

O Core NÃO deve conter regra de orçamento, medição, compra, cronograma, financiamento ou projeto técnico.

### 3.2 Entidade raiz
Criar tabela/entidade real `processos`.
Campos mínimos sugeridos para primeira implementação:
- `id uuid pk`
- `organization_id` nullable nesta fase, se Organization ainda não estiver operacional
- `nome`
- `tipo/template`
- `cliente_id` ou referência equivalente, se já houver modelo confiável
- `endereco` / dados gerais necessários
- `responsavel_id` ou referência equivalente
- `status`
- `created_at`
- `updated_at`
- `archived_at` nullable

Não transportar automaticamente todos os campos de `projetos` e `obras`. Cada campo legado deve justificar sua presença no novo Core.

### 3.3 Registry de módulos
Criar um mecanismo simples, explícito e tipado de registro de módulos. Evitar framework de plugins genérico neste momento.

Contrato mínimo conceitual:

```ts
type ProcessoModuleDefinition = {
  key: string
  label: string
  enabledByDefault?: boolean
  routes?: string[]
  capabilities?: string[]
}
```

E vínculo de habilitação por Processo, por exemplo `processo_modulos`.

Objetivo: permitir que cada Processo ative somente o necessário sem condicionar o Core às regras internas do módulo.

## 4. Módulos funcionais iniciais

Priorizar os módulos que o BuildSmart já possui e que a operação Allegra precisa:

1. Dados Gerais
2. Projeto técnico
3. Orçamento
4. Cronograma / Planejamento
5. Tarefas
6. Execução / Canteiro
7. Medições / evolução física
8. Materiais / Compras
9. Financeiro / custos realizados
10. Financiamento
11. RDO / Diário / evidências
12. Relatórios / Portal

Não criar novamente funcionalidades que já existem e funcionam. Criar primeiro os contratos de ligação ao Processo e migrar módulo por módulo.

## 5. Contrato entre módulos

Regra estrutural:

`UI / API / Luiza -> Action do módulo -> Service -> Repository -> tabela(s) do módulo`

Módulo A não deve gravar diretamente na tabela do módulo B.

Cada registro operacional novo deve possuir `processo_id` como contexto canônico quando fizer parte de um Processo.

Exemplos:
- orçamento pertence a `processo_id`;
- tarefa pertence a `processo_id`;
- lançamento de compra pertence a `processo_id`;
- medição física pertence a `processo_id`;
- evento de financiamento pertence a `processo_id`.

Relações internas mais específicas podem existir dentro do módulo, mas não substituem `processo_id`.

## 6. Actions mínimas do Motor

Implementar primeiro:
- `criarProcesso(input)`
- `obterProcesso(id)`
- `listarProcessos(filters)`
- `atualizarDadosProcesso(id, patch)`
- `alterarStatusProcesso(id, status)`
- `habilitarModulo(processoId, moduleKey)`
- `desabilitarModulo(processoId, moduleKey)`
- `listarModulosDoProcesso(processoId)`

Todas devem ser testáveis sem depender da UI.

Status canônico desejado para o Processo:
- `ACTIVE`
- `ON_HOLD`
- `COMPLETED`
- `ARCHIVED`

Se o banco atual usa outro vocabulário, não misturar silenciosamente. Adaptar na migração ou declarar mapeamento explícito.

## 7. Contexto canônico da aplicação

Criar `ProcessContext` (ou nome equivalente) como contexto global operacional.

Deve persistir/fornecer apenas `processoId` como raiz de seleção.

Não incluir no contrato público do novo contexto:
- `obraId`
- `projetoId` legado

Módulos antigos ainda não migrados podem ter adaptadores temporários internos durante a transição, mas estes não podem aparecer na API pública, UI canônica ou tools da IA.

## 8. Rotas e navegação

Criar fluxo canônico:
- `/processos`
- `/processos/novo`
- `/processos/[id]`
- módulos em contexto do Processo, preferencialmente abaixo de `/processos/[id]/...` ou através de uma navegação interna equivalente.

A navegação principal deve evoluir para Processo como raiz. Porém não remover rotas legadas até o equivalente novo estar funcional e testado.

Ao final da rodada correspondente, `/obras` e `/projetos` não podem continuar sendo caminhos de criação de novas raízes.

## 9. IA / Luiza

Nova ontologia obrigatória:

`Organização -> Processo -> Módulo -> Registro`

Tools públicas da IA devem evoluir para:
- `listar_processos`
- `criar_processo`
- `obter_processo`
- actions específicas de cada módulo com `processo_id`

Remover da superfície canônica da IA:
- `criar_obra`
- `criar_projeto` como raiz

Exemplos de resolução:
- “crie uma nova obra Allegra” -> `criar_processo`
- “comprei cimento para Allegra” -> resolver Processo Allegra -> Action do módulo Compras/Materiais
- “adicione o projeto estrutural do Allegra” -> resolver Processo Allegra -> módulo Projeto técnico

## 10. Harness / qualidade

Aplicar disciplina de spec-driven development e quality gates:
- implementação deve seguir este documento;
- nenhuma alteração de banco destrutiva nesta primeira rodada;
- migrations devem ser incrementais e reversíveis;
- testes unitários do domínio Processo;
- testes de integração das Actions principais;
- `tsc`, lint e build obrigatórios;
- nenhuma chave/token/hardcode em código;
- registrar relatório de execução na raiz da branch.

Não criar um “framework de plugins” completo, event bus genérico ou abstrações sem caso real. A referência ao OpenConstructionERP é modularidade e dados canônicos, não reprodução da infraestrutura inteira.

## 11. Ordem de execução para Claude

### Rodada P3.1 — Fundação do domínio
- criar migration de `processos` e `processo_modulos`;
- criar domínio/types/schemas/repository/services/actions;
- criar registry simples dos módulos;
- implementar testes do Core;
- não alterar ainda dados operacionais legados.

### Rodada P3.2 — Entrada única
- criar `/processos`;
- criar `Criar Processo`;
- criar `/processos/[id]` com shell mínimo e navegação dos módulos habilitados;
- criar `ProcessContext`;
- testar criação, listagem, abertura e persistência de contexto.

### Rodada P3.3 — Primeiro módulo real: Orçamento
Escolher Orçamento como primeiro teste de integração porque já existe, é central e deve continuar funcionando.
- mapear implementação atual;
- introduzir `processo_id` sem duplicar o módulo;
- fazer leitura/escrita pelo contrato do módulo;
- testar orçamento dentro de um Processo.

### Rodada P3.4 — Planejamento + evolução física
- integrar Cronograma/Planejamento;
- integrar Medições/evolução física;
- garantir que avanço físico seja calculado somente por dados físicos/medições.

### Rodada P3.5 — Financeiro + Financiamento separados
- integrar custos/desembolsos;
- integrar financiamento em módulo próprio;
- garantir três eixos independentes: físico, financeiro e financiamento;
- criar agregadores de leitura para dashboard/relatório, sem misturar as fontes.

### Rodada P3.6 — demais módulos operacionais
- Tarefas;
- Compras/Materiais;
- Canteiro/RDO/Diário;
- Portal/Relatórios;
- Projeto técnico.

### Rodada P3.7 — IA e entradas legadas
Somente depois de o fluxo via Processo estar funcional:
- substituir tools raiz da IA;
- remover botões de criação raiz de Obra/Projeto;
- converter rotas legadas em redirect/aviso quando seguro;
- impedir novas gravações independentes em `obras` e `projetos`.

### Rodada P3.8 — Allegra como teste de aceite
Cadastrar Allegra como Processo real e reproduzir no sistema as informações que hoje estão na Planilha Central:
- orçamento;
- cronograma;
- evolução física;
- desembolsos;
- mão de obra;
- compras/materiais;
- financiamento e reembolsos;
- RDO/evidências;
- relatório mensal.

PASS somente se os três indicadores puderem ser vistos separadamente e conciliados sem dupla raiz:
1. avanço físico;
2. avanço financeiro;
3. financiamento.

## 12. Critérios de não regressão

- Não perder funcionalidades atuais úteis.
- Não introduzir terceira camada paralela entre Processo e módulos.
- Não manter `projetos` ou `obras` como requisito para criar um Processo novo.
- Não recalcular físico a partir de financeiro.
- Não usar reembolso/financiamento como custo realizado.
- Não fazer migração massiva sem teste módulo a módulo.
- Não apagar legado antes de Allegra funcionar no novo fluxo.

## 13. Entrega obrigatória de cada rodada

Claude deve deixar na raiz:
`RELATORIO_PROCESSO_P3_<RODADA>.md`

Conteúdo mínimo:
- objetivo executado;
- arquivos alterados;
- migrations criadas;
- testes executados e resultados;
- comportamento observado;
- dívida/pendência encontrada;
- riscos;
- próximo passo recomendado.

Não iniciar a rodada seguinte se houver falha de build/teste ou dúvida arquitetural que altere o contrato deste documento.
