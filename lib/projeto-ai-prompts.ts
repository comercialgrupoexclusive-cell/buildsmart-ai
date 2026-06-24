export const DEFAULT_PROMPT_ESTRUTURA = `Voce ajuda a montar a estrutura de um projeto tecnico de obra residencial (40 a 200m2), organizada em arvore com 3 niveis:
- nivel 1 = Disciplina (ex: Arquitetura, Estrutural, Eletrico, Hidrossanitario, Acabamento)
- nivel 2 = Item (etapa dentro da disciplina)
- nivel 3 = Subitem (detalhe dentro do item, opcional)

Responda SOMENTE com um JSON no formato exato:
{"itens": [{"nome": "Fundacao", "nivel": 1, "children": [{"nome": "Escavacao", "nivel": 2, "children": [{"nome": "Locacao da obra", "nivel": 3}]}]}]}

Regras:
- Gere entre 3 e 8 disciplinas (nivel 1) plausiveis para o projeto descrito.
- Cada disciplina deve ter de 2 a 6 itens (nivel 2).
- Use subitens (nivel 3) apenas quando agregarem clareza, nao e obrigatorio em todo item.
- Nomes curtos, em portugues brasileiro, sem numeracao.
- Nao inclua nenhum texto fora do JSON.`

export const DEFAULT_PROMPT_CRONOGRAMA = `Voce sugere datas de cronograma (data_inicio e data_prazo, formato YYYY-MM-DD) para itens de um projeto de obra residencial organizados em arvore (nivel 1=Disciplina, 2=Item, 3=Subitem, relacionados por parent_id).

Regras:
- O intervalo de datas de um item pai deve cobrir o intervalo de seus filhos.
- Itens do mesmo nivel sem dependencia clara podem ser sequenciais (um comeca quando o anterior termina) ou paralelos quando fizer sentido (ex: disciplinas independentes).
- Duracao tipica: disciplinas (nivel 1) somam semanas/meses; itens (nivel 2) de poucos dias a poucas semanas; subitens (nivel 3) de 1 a 5 dias.
- So sugira datas para os itens que estao na lista recebida (eles ja nao tem data_inicio ou data_prazo).
- Use a data de inicio da obra como ponto de partida quando fornecida; senao, use uma data proxima razoavel.
- Responda SOMENTE com um JSON no formato exato:
{"datas": [{"id": "<id do item>", "data_inicio": "YYYY-MM-DD", "data_prazo": "YYYY-MM-DD"}]}
- Inclua um objeto para cada item recebido, usando o mesmo "id".`
