import type { SupabaseClient } from '@supabase/supabase-js'

// Camada Organização → Pessoas. Primeira peça: um jeito seguro de listar
// quem está na organização ativa da sessão, sem abrir `profiles` inteiro —
// ver a RPC `organization_members_list` (SECURITY DEFINER, escopada por
// current_organization_id(), nunca por platform_admin) na migration
// 20260918232619_organization_members_directory.sql.
//
// Esta é a única fonte aprovada pra "quem é essa pessoa" fora do próprio
// perfil — Responsável do Processo é o primeiro consumidor; agentes,
// compartilhamento e aprovações devem usar a mesma função, não reabrir
// `profiles` por conta própria.
export type MembroOrganizacao = {
  profile_id: string
  nome: string
  foto_url: string | null
  papel: 'owner' | 'admin' | 'member'
  ativo: boolean
}

export async function listarMembrosDaOrganizacaoAtiva(supabase: SupabaseClient): Promise<MembroOrganizacao[]> {
  const { data, error } = await supabase.rpc('organization_members_list')
  if (error) throw error
  return (data ?? []) as MembroOrganizacao[]
}
