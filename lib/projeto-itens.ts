import { createClient } from '@/lib/supabase/client'

export type ItemArvore = {
  nome: string
  nivel: number
  children?: ItemArvore[]
}

export async function insertItensArvore(
  supabase: ReturnType<typeof createClient>,
  projetoId: string,
  itens: ItemArvore[],
  parentId: string | null = null,
  ordem = 0
) {
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]
    const { data } = await supabase.from('projeto_itens').insert({
      projeto_id: projetoId,
      parent_id: parentId,
      nome: it.nome,
      nivel: it.nivel,
      ordem: ordem + i,
    }).select('id').single()
    if (data?.id && it.children?.length) {
      await insertItensArvore(supabase, projetoId, it.children, data.id, 0)
    }
  }
}
