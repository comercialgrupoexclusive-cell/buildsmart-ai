// Lógica pura de arraste do Kanban de Processos — sem IO, sem React. Extraída
// para ser testável sem simular um drag real (dnd-kit só decide COMO o gesto
// vira estas chamadas; o resultado de "mover item X da coluna A para a
// posição N da coluna B" é puro e determinístico).

export function moverItemEntreColunas<T extends string>(
  colunas: Record<string, T[]>,
  origem: string,
  destino: string,
  itemId: T,
  indiceDestino: number,
): Record<string, T[]> {
  if (!(origem in colunas) || !(destino in colunas)) return colunas

  const novasColunas: Record<string, T[]> = {}
  for (const chave of Object.keys(colunas)) novasColunas[chave] = [...colunas[chave]]

  const origemArr = novasColunas[origem]
  const idx = origemArr.indexOf(itemId)
  if (idx === -1) return colunas
  origemArr.splice(idx, 1)

  const destinoArr = novasColunas[destino]
  const posicao = Math.max(0, Math.min(indiceDestino, destinoArr.length))
  destinoArr.splice(posicao, 0, itemId)

  return novasColunas
}

// Reordena dentro da MESMA coluna (equivalente a arrayMove, mas sem depender
// do pacote dnd-kit para ser testado isoladamente).
export function reordenarNaColuna<T extends string>(colunas: Record<string, T[]>, coluna: string, deIndice: number, paraIndice: number): Record<string, T[]> {
  if (!(coluna in colunas)) return colunas
  const arr = colunas[coluna]
  if (deIndice < 0 || deIndice >= arr.length) return colunas
  const alvo = Math.max(0, Math.min(paraIndice, arr.length - 1))
  const copia = [...arr]
  const [item] = copia.splice(deIndice, 1)
  copia.splice(alvo, 0, item)
  return { ...colunas, [coluna]: copia }
}

// Encontra em qual coluna um item está — usado no onDragOver do Kanban para
// saber a coluna de origem/atual do item sendo arrastado.
export function colunaDoItem<T extends string>(colunas: Record<string, T[]>, itemId: T): string | null {
  for (const [chave, itens] of Object.entries(colunas)) {
    if (itens.includes(itemId)) return chave
  }
  return null
}
