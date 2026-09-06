# BuildSmart — P2 — Contrato Canônico do Motor de Processo

Status: APROVADO para implementação na branch `processo`.

## 1. Princípio

`Processo` é uma entidade raiz nova e canônica. Não é alias de `projetos`, não é `obras` renomeada e não depende estruturalmente de nenhuma das duas.

As entidades atuais `projetos` e `obras` passam a ser consideradas legado de origem para absorção controlada de comportamento, dados e capacidades úteis.

Regra: reaproveitar comportamento útil; não reaproveitar a ambiguidade estrutural.

## 2. Entidade raiz

A implementação deve criar uma entidade canônica `processos` com, no mínimo:

- `id`
- `nome`
- `cliente_origem`
- `endereco`
- `responsavel_id` e/ou referência canônica equivalente
- `status`
- `template_id` ou origem de template
- `created_at`
- `updated_at`
- metadados necessários para auditoria

Status canônicos do Processo:

- `ACTIVE`
- `ON_HOLD`
- `COMPLETED`
- `ARCHIVED`

Nenhum módulo pode inventar um segundo status raiz concorrente.

## 3. Motor de Processo

O domínio deve existir como unidade própria, preferencialmente com a seguinte separação:

```text
processo/
  domain/
  actions/
  services/
  repositories/
  schemas/
  ui/
  tests/
```

Toda escrita de negócio relacionada à raiz deve passar por Actions do Motor de Processo.

Actions mínimas esperadas:

- `criarProcesso`
- `obterProcesso`
- `listarProcessos`
- `atualizarProcesso`
- `alterarStatusProcesso`
- `arquivarProcesso`
- `restaurarProcesso`
- `habilitarModulo`
- `desabilitarModulo`
- `resolverProcessoPorReferencia`

Nomes finais podem variar, desde que o contrato funcional seja preservado.

## 4. Módulos

Módulos não são novas raízes. Cada módulo opera subordinado a um `processo_id`.

Primeiros módulos que devem convergir:

- Dados Gerais
- Tarefas
- Projeto técnico
- Orçamento
- Cronograma
- Execução/Canteiro
- Medições
- RDO
- Compras/Materiais

O Investidor continua como origem/pipeline de aquisição; quando uma prospecção virar um trabalho operacional real, ela cria ou vincula um Processo.

## 5. Projeto técnico

`Projeto técnico` permanece como módulo interno do Processo.

O atual `projeto_itens` pode fornecer estrutura e comportamento de referência, mas a implementação final deve operar por vínculo canônico ao Processo, sem depender de uma entidade raiz `projetos`.

A palavra “projeto” em linguagem natural pode continuar significando projeto arquitetônico, estrutural, elétrico etc.; isso nunca cria uma raiz concorrente.

## 6. Obra / execução

“Obra” passa a ser conceito operacional de execução dentro de um Processo, não entidade raiz escolhida pelo usuário ou pela IA.

Não deve existir no fluxo novo:

- `criar_obra` como criação raiz;
- seletor global que obriga o usuário a escolher uma entidade `obras` separada;
- necessidade de promover Processo para Obra;
- vínculo circular Processo ↔ Obra.

Capacidades úteis hoje dependentes de `obra_id` devem ser migradas para `processo_id` por etapas, com testes.

## 7. Persistência dos módulos

Diretriz canônica: novos vínculos usam `processo_id`.

Não criar novos `projeto_id` ou `obra_id` em funcionalidades novas.

Para cada tabela legada deve existir uma decisão explícita:

1. migrar FK para `processo_id`;
2. substituir por uma tabela nova de módulo corretamente modelada;
3. manter temporariamente apenas durante a migração;
4. remover após prova de ausência de dependência.

Nenhuma compatibilidade temporária pode se tornar contrato permanente do novo motor.

## 8. IA / Luiza

A ontologia operacional passa a ser:

`Organização → Processo → Módulo/Registro`

A IA nunca escolhe entre `projetos` e `obras` legados.

Exemplos:

- “Crie uma nova obra” → `criarProcesso`, usando template apropriado de obra para cliente.
- “Crie o projeto estrutural do Allegra” → resolver Processo Allegra → módulo Projeto técnico → action correspondente.
- “Comprei 20 sacos de cimento para o Allegra” → resolver Processo Allegra → módulo Compras/Materiais → action correspondente.

Se o Processo estiver ambíguo, a IA pede desambiguação entre Processos; nunca entre raízes legadas.

## 9. Entrada única

A UI raiz deve convergir para uma única entrada:

`Criar Processo`

Templates iniciais:

- Obra para cliente
- Investimento imobiliário
- Em branco

O template define módulos iniciais, mas não cria entidades raiz adicionais.

## 10. Estratégia de migração

A implementação não deve tentar migrar todo o legado em uma única mudança destrutiva.

Ordem recomendada:

1. criar domínio e tabela `processos`;
2. criar contrato de módulos ativos;
3. implementar `Criar Processo`;
4. implementar resolução canônica de Processo;
5. migrar Tarefas, Projeto técnico, Orçamento e Cronograma para `processo_id`;
6. migrar capacidades de execução hoje presas a `obra_id`;
7. alterar tools/actions da IA para Processo;
8. remover da navegação as raízes concorrentes;
9. cadastrar Allegra do zero;
10. provar o fluxo completo;
11. remover legado morto em etapas reversíveis.

## 11. Proibições

- Não transformar `projetos.id` em Processo disfarçado.
- Não transformar `obras.id` em Processo disfarçado.
- Não manter dois motores raiz em paralelo no estado final.
- Não adicionar novas features que gravem diretamente por `obra_id` ou `projeto_id`.
- Não excluir tabelas antes de substituir e testar suas dependências.
- Não reescrever lógica funcional que possa ser portada com segurança para o novo domínio.
- Não alterar banco ou produção sem Gate explícito e revisão.

## 12. Critério de PASS do P2

P2 está concluído quando houver um contrato técnico inequívoco para implementação e nenhuma decisão estrutural depender de `projetos` ou `obras` como raiz futura.

Próximo Gate: P3 — implementação mínima do Motor de Processo e da entrada `Criar Processo`, começando pelo schema/domínio/actions e testes, sem ainda remover fisicamente o legado.