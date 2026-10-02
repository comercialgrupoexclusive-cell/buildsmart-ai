import type { SupabaseClient } from '@supabase/supabase-js'

// Caixa de Entrada do Processo — objeto de realidade bruta (ver
// supabase/migrations/20260919120000_processo_caixa_entrada.sql).
//
// Regra que este arquivo nunca pode violar: a entrada, uma vez gravada, é
// append-only. Não existe (e não deve existir) uma função de editar ou
// apagar aqui — RLS nem tem policy de UPDATE/DELETE para authenticated. Uma
// futura camada de agentes/Flow lê estas linhas e escreve interpretação em
// tabelas próprias, nunca aqui.
//
// `autor_profile_id` nunca é enviado pelo cliente: um trigger no banco
// (processo_caixa_entrada_set_autor) sempre reescreve a partir de
// current_profile_id(), então nem tentamos mandar esse campo no insert.
export type CaixaEntradaTipo = 'texto' | 'imagem' | 'documento' | 'audio'
export type CaixaEntradaStatus = 'novo' | 'processando' | 'revisado' | 'arquivado'

export type EntradaCaixa = {
  id: string
  // Nulo quando a entrada nasceu na Caixa global — o usuário jogou algo lá
  // antes de existir Processo para aquilo (migration 20260924040000). A
  // organização vem por trigger nos dois casos.
  processo_id: string | null
  organization_id: string | null
  autor_profile_id: string | null
  tipo: CaixaEntradaTipo
  origem: string
  conteudo_texto: string | null
  arquivo_url: string | null
  arquivo_nome: string | null
  arquivo_tipo: string | null
  arquivo_tamanho: number | null
  duracao_segundos: number | null
  status: CaixaEntradaStatus
  created_at: string
}

// processoId nulo = Caixa global: traz tudo que a RLS deixa ver, incluindo
// o que está dentro de Processos. É a visão de "tudo que eu joguei".
export async function listarEntradasCaixa(
  supabase: SupabaseClient,
  processoId: string | null,
): Promise<EntradaCaixa[]> {
  let query = supabase.from('processo_caixa_entrada').select('*')
  if (processoId) query = query.eq('processo_id', processoId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EntradaCaixa[]
}

export async function criarEntradaTexto(
  supabase: SupabaseClient,
  processoId: string | null,
  texto: string,
): Promise<EntradaCaixa> {
  const { data, error } = await supabase
    .from('processo_caixa_entrada')
    .insert({ processo_id: processoId, tipo: 'texto', conteudo_texto: texto.trim() })
    .select('*')
    .single()
  if (error) throw error
  return data as EntradaCaixa
}

function tipoDoArquivo(mime: string): 'imagem' | 'documento' | 'audio' {
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('audio/')) return 'audio'
  return 'documento'
}

// Mesmo padrão de components/investidor/ProspeccaoArquivos.tsx: tabela
// pequena e dedicada + bucket já existente `project-files`, prefixo próprio.
export async function criarEntradaArquivo(
  supabase: SupabaseClient,
  processoId: string | null,
  arquivo: File,
  opts?: { duracaoSegundos?: number },
): Promise<EntradaCaixa> {
  const ext = arquivo.name.split('.').pop() || 'bin'
  const path = `caixa-entrada/${processoId ?? 'global'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: upErr } = await supabase.storage.from('project-files').upload(path, arquivo)
  if (upErr) throw upErr
  const url = supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl

  const { data, error } = await supabase
    .from('processo_caixa_entrada')
    .insert({
      processo_id: processoId,
      tipo: tipoDoArquivo(arquivo.type || 'application/octet-stream'),
      arquivo_url: url,
      arquivo_nome: arquivo.name,
      arquivo_tipo: arquivo.type || 'arquivo',
      arquivo_tamanho: arquivo.size,
      duracao_segundos: opts?.duracaoSegundos ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as EntradaCaixa
}
