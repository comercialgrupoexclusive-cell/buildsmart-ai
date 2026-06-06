# Memoria: Composicoes no Orcamento

Data: 05/06/2026

## Em linguagem simples

Implementamos a regra principal para o orcamento entender composicoes:

> quantidade lancada no orcamento x coeficiente do insumo = quantidade sugerida do insumo

Exemplo:

- Composicao: Concreto simples
- Quantidade no orcamento: 2 M3
- Coeficiente do cimento: 320 KG por M3
- Material sugerido: 2 x 320 = 640 KG de cimento

Assim, o usuario nao precisa digitar todos os materiais manualmente. Ele escolhe uma composicao, informa a quantidade principal, e o sistema sugere os insumos para compra.

## O que foi implementado

- O orcamento agora carrega composicoes proprias junto com seus insumos.
- O custo da composicao propria e calculado pela soma:
  - coeficiente do insumo x preco unitario do insumo.
- Ao adicionar uma composicao no orcamento:
  - o item entra com preco unitario calculado;
  - os materiais sugeridos sao criados ou atualizados na tabela `materiais`;
  - se ja existir o mesmo insumo na mesma obra/etapa, a quantidade e somada.
- Ao remover um item de composicao do orcamento:
  - o sistema abate as quantidades sugeridas dos materiais;
  - se a quantidade ficar zero ou negativa, remove o material.
- O modal de adicionar item mostra os insumos que serao sugeridos.

## O que foi criado para teste

Foram criadas 3 composicoes de teste no Supabase:

- `BS-COMP-001` - Concreto simples dosado em obra FCK 20 MPa
- `BS-COMP-002` - Alvenaria de bloco ceramico 9x19x19 cm
- `BS-COMP-003` - Pintura latex PVA duas demaos em parede

Tambem foi criado o arquivo `supabase/seed_composicoes_teste.sql` para recriar esses dados quando necessario.

## Validacao realizada

O build passou com sucesso:

```bash
npm.cmd run build
```

Teste controlado no Supabase:

- composicao: `BS-COMP-001`
- quantidade: `2 M3`
- custo unitario calculado: `R$ 452,23`
- total do item: `R$ 904,47`
- materiais sugeridos:
  - cimento: `640 KG`
  - areia: `1,1 M3`
  - brita: `1,5 M3`
  - servente: `4,4 H`

O teste removeu os registros temporarios ao final.

## Observacoes tecnicas

- A implementacao usa as tabelas ja existentes:
  - `composicoes_proprias`
  - `composicao_insumos`
  - `orcamento_itens`
  - `materiais`
- Nao foi criada tabela nova nesta etapa.
- Ainda nao existe uma tabela de snapshot detalhado por item, como `orcamento_item_insumos`.
- Por enquanto, os materiais sugeridos ficam consolidados por obra, etapa e insumo.

## Proximo passo recomendado

Criar uma experiencia melhor para subetapas:

1. Definir se subetapa sera uma tabela propria ou um campo agrupador dentro do item.
2. Mostrar os materiais sugeridos abaixo de cada item do orcamento.
3. Criar um snapshot tecnico dos insumos por item para preservar historico mesmo se a composicao mudar depois.
