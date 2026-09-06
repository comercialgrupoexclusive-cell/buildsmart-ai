# BuildSmart — Branch `processo` — P1 Inventário Técnico

Status: **P1 concluído para decisão arquitetural macro**.

## Objetivo

Mapear a fragmentação real entre `projetos`, `obras` e módulos associados antes de alterar o comportamento da aplicação.

## Fatos encontrados

- `projetos` já contém identidade e contexto suficientes para servir como base técnica do Processo: nome, cliente, endereço, responsável, datas, pasta Drive, foto, `fase_ciclo`, `contexto` e `fase_investimento`.
- `obras` também é hoje uma raiz independente e possui `projeto_id`.
- `projetos` possui `obra_id`. Portanto existe vínculo circular entre as duas raízes.
- `lib/project-cycle.ts` implementa a promoção atual `Projeto -> Obra` via RPC `iniciar_obra`, mantendo `projeto_id` e `obra_id`.
- `/projetos` cria diretamente em `projetos`.
- `/obras` cria diretamente em `obras`.
- o menu principal expõe Projetos, Obras, Orçamentos, Canteiro e Tarefas como entradas concorrentes.
- `GlobalObraOrcamentoBar` + `ObraOrcamentoProvider` usam `obra_id` como contexto operacional global para módulos como cronograma, materiais, medições e relatórios.
- a Luiza/WhatsApp expõe tools distintas `criar_obra` e `criar_projeto`; `criar_obra` grava diretamente em `obras`.
- orçamento, planejamento, cronograma e tarefas possuem combinações de `projeto_id`, `obra_id` ou ambos.
- materiais, medições, RDO, compras, financiamento, portal, fornecedores, diário e vários outros domínios dependem diretamente de `obra_id`.

## Conclusão

**Não criar uma nova tabela-raiz nem um segundo motor de Processo neste momento.**

A estratégia de menor risco é:

1. usar `projetos.id` como identidade técnica de `Processo` durante a convergência;
2. criar uma camada canônica `Processo` no código (Actions/Services/Resolver);
3. tratar `obras` como agregado legado de execução temporário, nunca mais como raiz escolhida por usuário/IA;
4. resolver `obra_id` internamente a partir do `processo_id` apenas enquanto módulos legados ainda precisarem dele;
5. criar uma única entrada `Criar Processo`;
6. retirar `Nova Obra`, `criar_obra` e rotas raiz concorrentes somente depois de existir caminho equivalente via Processo;
7. não migrar todas as FKs de uma vez; usar adaptadores e provar o fluxo com Allegra primeiro;
8. após o PASS do Allegra, remover/migrar o legado comprovadamente excedente.

## Próximo Gate — P2

Formalizar o contrato técnico do Motor de Processo:

- `Processo` como raiz única;
- Action `criarProcesso`;
- `resolveProcesso()` / contexto canônico;
- contrato de módulos;
- adaptadores temporários `processo_id -> obra_id`;
- política de status e auditoria;
- regras para IA: nunca escolher entre Projeto e Obra;
- critérios para desabilitar as entradas legadas sem quebrar módulos existentes.

Nenhum comportamento da aplicação foi alterado neste Gate; somente investigação e documentação.