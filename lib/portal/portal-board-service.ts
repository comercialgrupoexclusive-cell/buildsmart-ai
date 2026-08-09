import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import { hashPortalToken } from './portal-service'
import type { PortalBoardStatus, PortalCategoria, PortalTourPosition } from './types'

const CATEGORIAS: PortalCategoria[] = ['observacao', 'duvida', 'aprovacao', 'alteracao', 'pendencia', 'nao_conformidade']
const STATUS: PortalBoardStatus[] = ['aberto', 'em_analise', 'aguardando_cliente', 'aguardando_equipe', 'resolvido', 'arquivado']

function db() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
export type CreatePortalBoardItem = {
  orcamentoId?: string | null
  titulo: string
  descricao?: string | null
  categoria?: PortalCategoria
  ambiente?: string | null
  tour?: PortalTourPosition | null
}

export async function createPortalBoardItem(token: string, input: CreatePortalBoardItem, origem: 'portal' | 'portal_ai' = 'portal') {
  const titulo = input.titulo.trim()
  if (!titulo) throw new Error('Informe um titulo para a anotacao.')
  const categoria = CATEGORIAS.includes(input.categoria || 'observacao') ? (input.categoria || 'observacao') : 'observacao'
  const { data, error } = await db().rpc('portal_board_create', {
    p_token_hash: hashPortalToken(token),
    p_orcamento_id: input.orcamentoId || 'todos',
    p_titulo: titulo,
    p_descricao: input.descricao?.trim() || null,
    p_categoria: categoria,
    p_ambiente: input.ambiente?.trim() || input.tour?.ambiente || null,
    p_node_id: input.tour?.nodeId || null,
    p_yaw: input.tour?.yaw ?? null,
    p_pitch: input.tour?.pitch ?? null,
    p_origem: origem,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function updatePortalBoardItem(
  token: string,
  itemId: string,
  patch: { titulo?: string; descricao?: string; categoria?: PortalCategoria; status?: PortalBoardStatus; ambiente?: string },
  origem: 'portal' | 'portal_ai' = 'portal',
) {
  if (patch.categoria && !CATEGORIAS.includes(patch.categoria)) throw new Error('Categoria invalida.')
  if (patch.status && !STATUS.includes(patch.status)) throw new Error('Status invalido.')
  const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
  const { data, error } = await db().rpc('portal_board_update', {
    p_token_hash: hashPortalToken(token),
    p_item_id: itemId,
    p_patch: cleanPatch,
    p_origem: origem,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function commentPortalBoardItem(token: string, itemId: string, mensagem: string, origem: 'portal' | 'portal_ai' = 'portal') {
  if (!mensagem.trim()) throw new Error('Escreva um comentario.')
  const { data, error } = await db().rpc('portal_board_comment', {
    p_token_hash: hashPortalToken(token),
    p_item_id: itemId,
    p_mensagem: mensagem.trim(),
    p_origem: origem,
  })
  if (error) throw new Error(error.message)
  return data
}
