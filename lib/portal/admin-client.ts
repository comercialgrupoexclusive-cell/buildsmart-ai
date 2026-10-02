// Chamador client-side das RPCs administrativas do Portal/Feed. Substitui
// `supabase.rpc(...)` para essas funcoes especificas (que agora exigem
// service_role no banco) por uma chamada ao proxy server-side em
// /api/portal-admin, que injeta o profile_id verdadeiro (via sessao
// assinada) em vez do que for passado aqui. Mantem o mesmo formato de
// retorno { data, error } usado nos componentes, para minimizar mudancas
// nos pontos de chamada.
export async function adminRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  try {
    const res = await fetch('/api/portal-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn, args }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      return { data: null, error: { message: json?.error || 'Nao foi possivel completar a operacao.', code: json?.code } }
    }
    return { data: (json?.data ?? null) as T | null, error: null }
  } catch {
    return { data: null, error: { message: 'Falha de rede.' } }
  }
}
