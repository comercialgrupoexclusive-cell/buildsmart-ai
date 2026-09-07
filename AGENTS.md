<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BuildSmart — sistema operacional de desenvolvimento

Estas regras são canônicas para agentes que implementam o BuildSmart, inclusive Claude.

## 1. Unidade de trabalho: capacidade completa, não microtarefa

Trabalhar por **pacote funcional coerente**: uma capacidade que o usuário consiga testar de ponta a ponta.

Exemplos de pacote adequado:
- concluir CRUD de Orçamento mobile, incluindo navegação, adicionar, editar, excluir, estados vazios e validação;
- concluir importação de orçamento até o dado aparecer corretamente na UI;
- concluir fluxo de Planejamento de uma etapa do orçamento até edição e persistência.

Não transformar cada botão, campo, modal, ajuste visual, bug correlato ou arquivo em rodada separada.

Ao receber um objetivo amplo:
1. auditar o estado atual;
2. levantar causas e dependências;
3. definir internamente o menor conjunto coerente de mudanças que resolve o objetivo;
4. executar esse conjunto inteiro;
5. validar localmente;
6. entregar para teste humano apenas quando a capacidade estiver utilizável.

Perguntar ao usuário somente quando existir decisão de produto realmente não inferível ou ação irreversível relevante. Problemas técnicos normais devem ser resolvidos pelo executor.

## 2. Push e deploy são checkpoints, não etapas de raciocínio

A integração Git da Vercel cria Preview Deployment a cada push em branch não produtiva. Portanto:

- fazer investigação, edição, correções e testes localmente dentro do pacote;
- não fazer push para cada submudança;
- não usar deploy como substituto de teste local;
- consolidar o pacote em **um push ao final**, depois de `tsc`, testes relevantes e build passarem;
- um segundo push no mesmo pacote só se o teste humano revelar defeito real que não poderia ser validado localmente;
- não criar commit/push exclusivo para relatório, comentário, renome de botão ou ajuste cosmético isolado quando isso puder acompanhar o pacote atual.

Hotfix de produção é exceção: pode ser isolado quando reduzir risco ou permitir rollback claro.

## 3. Gates proporcionais ao risco

Não aplicar o mesmo ritual a toda alteração.

### Mudança local/reversível de UI
Validar componente/fluxo afetado + TypeScript/lint relevante. Incorporar no pacote funcional atual.

### Mudança de regra de negócio ou persistência
Testar leitura/escrita real, casos principais e não regressão do contrato afetado. Build antes do push.

### Migration/schema/segurança/dados financeiros
Tratar como mudança de alto risco: migration incremental/reversível quando possível, teste explícito, checagem de dados e rollback definido antes do push.

## 4. Auditoria antes de reescrever

Antes de criar módulo, componente, regra ou tabela nova:
- verificar o que já existe;
- reutilizar o que funciona;
- corrigir causa raiz antes de adicionar camada paralela;
- remover duplicação somente quando a substituição estiver comprovada.

Não criar abstração, pasta, campo, tabela, processo ou regra sem evidência de necessidade.

## 5. Correções correlatas pertencem ao mesmo pacote

Se durante a execução forem encontrados bugs diretamente ligados ao objetivo, corrigi-los no mesmo pacote quando:
- a causa for compreendida;
- a correção for de baixo/médio risco;
- houver teste objetivo;
- não ampliar o domínio para uma iniciativa diferente.

Não interromper a entrega para pedir uma nova “rodada” apenas porque surgiu um segundo arquivo ou uma segunda tela do mesmo fluxo.

## 6. Relatórios e documentação

Relatório não é entrega de software.

- atualizar documentação canônica existente quando houver mudança arquitetural ou de contrato;
- gerar relatório de milestone somente quando ele registrar uma decisão relevante, migração importante ou aceite de fase;
- não gerar um novo `RELATORIO_*.md` para cada microcorreção;
- não fazer push separado apenas para documentação operacional que possa acompanhar a entrega funcional.

O resumo final do executor deve ser curto: capacidade concluída, testes, riscos restantes e URL/commit de teste quando aplicável.

## 7. Critério de pronto

Um pacote só está pronto quando:
- resolve o objetivo observável do usuário, não apenas uma parte interna;
- fluxo principal funciona de ponta a ponta;
- dados persistem pela fonte canônica;
- não cria uma segunda implementação concorrente sem necessidade;
- testes proporcionais ao risco passam;
- build passa quando a alteração afeta aplicação implantável;
- há no máximo um conjunto pequeno e explícito de pendências realmente fora do escopo.

## 8. Prioridade operacional

Quando houver conflito entre ritual antigo de “rodadas” e estas regras, **estas regras prevalecem**. Rodadas documentadas em planos antigos devem ser interpretadas como milestones/objetivos, não como obrigação de criar uma sessão, commit, deploy ou relatório para cada subitem.
