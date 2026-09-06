# BuildSmart — Regra canônica: auditar antes de migrar módulo para Processo

Status: APROVADO por Luiz em 2026-09-06.
Branch: `processo`.

## Regra principal

Nenhum módulo legado entra no novo Motor de Processo apenas por receber `processo_id` ou por ser renderizado dentro de `/processos/[id]`.

A partir desta regra, a sequência obrigatória para cada módulo é:

**AUDITAR → DEFINIR ALVO → SANEAR → MIGRAR → TESTAR REAL → CANONIZAR**

A implementação anterior de Orçamento e Planejamento dentro de Processo deve ser tratada como integração inicial/protótipo até passar por este gate.

## Motivo

O legado atual contém decisões estruturais de `obra_id`, `projeto_id`, rotas `/obras` e `/projetos`, contexto global de Obra, componentes desktop-heavy e fluxos que já apresentam bugs no uso real. Migrar isso diretamente para Processo transfere dívida técnica para o novo motor.

O objetivo é reaproveitar capacidades maduras sem carregar a arquitetura antiga.

## Gate obrigatório por módulo

### A. Auditoria do existente

Antes de alterar o módulo, mapear:

- telas, rotas, componentes e modais;
- tabelas, FKs e queries;
- Actions/Services existentes;
- dependências de `obra_id` e `projeto_id`;
- links ou redirects para `/obras` e `/projetos`;
- dependência de `ObraOrcamentoProvider` ou outros contextos raiz legados;
- gravações diretas no Supabase fora do domínio dono;
- regras duplicadas;
- erros funcionais já observáveis;
- fluxos incompletos;
- problemas mobile;
- componentes e cálculos que já funcionam e devem ser preservados;
- código específico de Obra/Projeto que não deve sobreviver no módulo canônico.

Entrega da auditoria: tabela curta `manter / corrigir / extrair / remover depois`.

### B. Definir o módulo-alvo

Antes de migrar, escrever o contrato mínimo:

- responsabilidade do módulo;
- entidades próprias;
- Actions públicas;
- Services/Repositories necessários;
- dados que pertencem ao módulo;
- dados que são somente leitura de outro módulo;
- vínculo canônico exclusivamente por `processo_id`;
- eventos/saídas que outros módulos podem consumir;
- comportamento mobile esperado.

Nenhum módulo pode assumir que Processo é Obra.

### C. Saneamento

Corrigir o módulo antes de chamá-lo de migrado:

- remover dependências raiz de Obra/Projeto do novo fluxo;
- corrigir links e navegação;
- corrigir bugs conhecidos;
- separar domínio de UI quando necessário;
- centralizar escrita por Actions;
- eliminar regras duplicadas onde houver evidência;
- adaptar para mobile-first sem alterar regra de negócio;
- preservar comportamento validado.

### D. Migração

Somente após saneamento:

- vincular dados por `processo_id`;
- encaixar no shell de Processo;
- impedir criação/uso de raiz paralela;
- adicionar testes do fluxo canônico;
- manter legado apenas onde ainda houver dependência comprovada e temporária.

### E. Teste real

Usar o Allegra como teste operacional sempre que o módulo fizer parte do seu ciclo.

Um módulo só recebe status `CANÔNICO NO PROCESSO` depois de passar por uso real suficiente para comprovar:

- criação/leitura/edição/exclusão corretas;
- ausência de dependência funcional de raiz Obra/Projeto;
- navegação correta dentro do Processo;
- comportamento mobile aceitável;
- dados corretos;
- build/testes limpos dentro do escopo da rodada.

## Orçamento — próximo módulo a reavaliar

A próxima rodada deve ser uma auditoria e saneamento do Orçamento antes de continuar a migração de outros módulos.

### Bugs/evidências já observados

1. `TemplateOrcamentoModal` ainda exige orçamento vinculado a Projeto ou Obra e ignora `processo_id`.
2. Há links e fluxos herdados de `/obras`/`/projetos`.
3. `ObraOrcamento` foi reutilizado quase integralmente dentro de Processo; isso foi útil para provar integração, mas não é por si só prova de arquitetura canônica.
4. UI atual apresenta problemas claros no mobile: modais muito altos, navegação horizontal comprimida, densidade de campos excessiva e comportamento de desktop comprimido.

### Escopo da rodada de Orçamento

Primeiro mapear, sem refatoração ampla:

- `components/obra/ObraOrcamento.tsx`;
- `components/obra/TemplateOrcamentoModal.tsx`;
- todos os componentes importados diretamente pelo Orçamento;
- `lib/processo/orcamento.ts`;
- tabelas `orcamentos`, `etapas`, `orcamento_itens` e relacionamentos relevantes;
- links internos e navegação;
- uso de `obra_id`, `projeto_id`, `processo_id`;
- ações de template;
- adicionar/editar/remover etapa;
- subetapa;
- composição própria;
- SINAPI;
- insumos;
- totais e cálculos;
- versões/reabertura;
- integração com Planejamento.

Depois classificar cada fluxo:

- `OK — reaproveitar`;
- `BUG — corrigir`;
- `LEGADO — remover do fluxo Processo`;
- `REDESENHO MOBILE — necessário`;
- `FORA DO ESCOPO`.

## Regra de UI

Mobile-first passa a fazer parte do gate do módulo, não uma etapa estética posterior.

Princípios:

- progressive disclosure;
- uma ação principal evidente por contexto;
- evitar modal gigante para fluxos longos;
- quando a edição crescer, preferir sheet/tela dedicada;
- Etapa → Subetapa → Item como hierarquia de navegação do Orçamento;
- totais/resumo em posição de fácil consulta;
- touch targets adequados;
- sem tabelas desktop espremidas;
- desktop deve expandir a mesma arquitetura, não criar outro fluxo.

## Separação de indicadores no Motor

Para todos os módulos de execução e relatório:

- avanço físico é um domínio próprio de medição da execução;
- avanço financeiro é um domínio próprio de desembolsos/custos;
- financiamento é um domínio próprio de liberações/reembolsos/recursos;
- podem ser comparados em dashboards e relatórios;
- nunca inferir um diretamente do outro.

## Instrução imediata ao Claude

**Não avançar para novo módulo ainda.**

Executar primeiro uma rodada de **AUDITORIA DO ORÇAMENTO** na branch `processo`.

Nesta primeira subrodada:

1. não fazer refatoração ampla;
2. não criar outro Orçamento do zero;
3. não alterar regras de cálculo sem evidência/teste;
4. mapear todos os fluxos e dependências citados acima;
5. reproduzir o bug do template mostrado por Luiz;
6. identificar a causa no código;
7. entregar plano de correção priorizado;
8. registrar relatório na raiz do repositório;
9. só depois iniciar as correções aprovadas dentro da mesma disciplina.

O relatório deve terminar com uma decisão objetiva:

- `MANTER E SANEAR O MÓDULO ATUAL`, ou
- `EXTRAIR DOMÍNIO E SUBSTITUIR A CASCA`, ou
- `RECONSTRUIR O MÓDULO`.

A terceira opção exige evidência de que o custo/risco de sanear o existente é maior que reconstruir.

## Proibição

Não considerar um módulo “migrado” só porque:

- recebeu coluna `processo_id`;
- foi colocado numa aba de Processo;
- TypeScript/build passaram.

Esses itens são necessários, mas insuficientes.
