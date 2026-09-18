import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarMembrosDaOrganizacaoAtiva } from '../organizacao/membros'

// A regra de segurança de verdade mora no banco (RPC organization_members_list,
// SECURITY DEFINER escopada por current_organization_id — validada ao vivo:
// owner/admin/member vendo a própria organização, seleção cruzada negada,
// nome atualizado refletindo, membro inativo/removido tratado). Este teste só
// trava o contrato do lado do cliente: chama a RPC certa, propaga erro em vez
// de engolir, nunca aceita um segundo parâmetro (não haveria como escopar por
// outra organização mesmo se alguém tentasse).
describe('listarMembrosDaOrganizacaoAtiva', () => {
  it('chama a RPC organization_members_list sem parâmetros e devolve a lista', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ profile_id: 'p1', nome: 'Fulana', foto_url: null, papel: 'owner', ativo: true }],
      error: null,
    })
    const supabase = { rpc } as unknown as SupabaseClient

    const lista = await listarMembrosDaOrganizacaoAtiva(supabase)

    expect(rpc).toHaveBeenCalledWith('organization_members_list')
    expect(lista).toEqual([{ profile_id: 'p1', nome: 'Fulana', foto_url: null, papel: 'owner', ativo: true }])
  })

  it('propaga o erro do Supabase em vez de devolver lista vazia silenciosamente', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS negou' } }),
    } as unknown as SupabaseClient

    await expect(listarMembrosDaOrganizacaoAtiva(supabase)).rejects.toEqual({ message: 'RLS negou' })
  })

  it('devolve lista vazia quando data vem null (organização sem membros visíveis)', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as unknown as SupabaseClient

    await expect(listarMembrosDaOrganizacaoAtiva(supabase)).resolves.toEqual([])
  })
})
