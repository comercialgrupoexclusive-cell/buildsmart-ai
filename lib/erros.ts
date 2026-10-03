// Erros do Supabase (PostgrestError) são objetos comuns, não instâncias de
// `Error`. Um `e instanceof Error ? e.message : 'texto genérico'` joga fora o
// motivo real da falha — foi assim que um bloqueio de permissão no banco ficou
// escondido atrás de "Não foi possível adicionar o item.".

type ComMensagem = { message?: unknown }

function motivoDe(e: unknown): string | null {
  if (typeof e === 'string') return e || null
  if (e && typeof e === 'object') {
    const { message } = e as ComMensagem
    if (typeof message === 'string' && message) return message
  }
  return null
}

// Texto para mostrar ao usuário quando uma operação falha.
// - `Error` lançado pelo próprio app: a mensagem já é amigável, usa como está.
// - Erro do banco (objeto): "<texto amigável> (<motivo técnico>)".
// - Sem nenhuma informação: só o texto amigável.
export function mensagemDeErro(e: unknown, aoFalhar: string): string {
  if (e instanceof Error && e.message) return e.message
  const motivo = motivoDe(e)
  return motivo ? `${aoFalhar} (${motivo})` : aoFalhar
}
