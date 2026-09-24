import { NextRequest } from 'next/server'
import { readAccess } from '@/lib/auth/session'
import { authJson, requireSameOrigin } from '@/lib/auth/http'
import { triarEntrada, type EntradaParaTriagem } from '@/lib/caixa-entrada/triagem-runtime'

// Triagem de uma entrada da Caixa. Roda inteiramente sob o client da sessão
// (readAccess().db), então a RLS vale para tudo: ler a entrada, criar a
// tarefa e gravar a triagem. Nenhuma chave de service role aqui.

export async function POST(request: NextRequest) {
  const denied = requireSameOrigin(request)
  if (denied) return denied
  try {
    const body = await request.json().catch(() => null)
    const entradaId = typeof body?.entradaId === 'string' ? body.entradaId : null
    if (!entradaId) return authJson({ error: 'Entrada não informada.' }, 400)

    const access = await readAccess()
    if (!access) return authJson({ error: 'Sessão expirada.' }, 401)
    if (!access.active) return authJson({ error: 'Selecione uma organização.' }, 403)

    const { data: entrada, error } = await access.db
      .from('processo_caixa_entrada')
      .select('id, processo_id, tipo, conteudo_texto, arquivo_nome')
      .eq('id', entradaId)
      .maybeSingle()
    if (error) return authJson({ error: 'Não foi possível ler a entrada.' }, 503)
    if (!entrada) return authJson({ error: 'Entrada não encontrada.' }, 404)

    const resultado = await triarEntrada(access.db, entrada as EntradaParaTriagem, {
      profileId: access.profile?.id ?? null,
      actor: access.profile?.name || 'Caixa de Entrada',
      hojeISO: new Date().toISOString().slice(0, 10),
    })

    const { error: erroTriagem } = await access.db
      .from('caixa_entrada_triagem')
      .upsert({
        entrada_id: entradaId,
        status: resultado.status,
        resumo: resultado.resumo || null,
        tarefa_id: resultado.tarefaId ?? null,
        triado_por_ia: true,
        triado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'entrada_id' })
    if (erroTriagem) return authJson({ error: 'A triagem não pôde ser gravada.' }, 503)

    return authJson({ status: resultado.status, resumo: resultado.resumo, mensagem: resultado.mensagem })
  } catch {
    return authJson({ error: 'Não foi possível triar esta entrada.' }, 503)
  }
}
