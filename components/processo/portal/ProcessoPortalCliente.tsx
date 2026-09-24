'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { listarMembrosDaOrganizacaoAtiva, type MembroOrganizacao } from '@/lib/organizacao/membros'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchInput } from '@/components/ui/SearchInput'

// Portal do Cliente do Processo: quem, de fora da equipe, acompanha este
// Processo. A lista de pessoas vem da RPC organization_members_list — a
// única fonte aprovada de "quem é essa pessoa" fora do próprio perfil —,
// nunca de um select direto em `profiles`.

type Convidado = { id: string; profile_id: string; created_at: string }

export function ProcessoPortalCliente({ processoId }: { processoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [convidados, setConvidados] = useState<Convidado[]>([])
  const [membros, setMembros] = useState<MembroOrganizacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [{ data, error }, lista] = await Promise.all([
        supabase.from('processo_convidados').select('id, profile_id, created_at').eq('processo_id', processoId),
        listarMembrosDaOrganizacaoAtiva(supabase),
      ])
      if (error) throw error
      setConvidados((data ?? []) as Convidado[])
      setMembros(lista)
    } catch {
      setErro('Não foi possível carregar o portal deste processo.')
    } finally {
      setCarregando(false)
    }
  }, [supabase, processoId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  const convidadosIds = new Set(convidados.map(c => c.profile_id))
  const nomePorProfile = new Map(membros.map(m => [m.profile_id, m.nome]))

  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return membros
      .filter(m => !convidadosIds.has(m.profile_id))
      .filter(m => !termo || m.nome.toLowerCase().includes(termo))
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membros, busca, convidados])

  async function convidar(profileId: string) {
    if (ocupado) return
    setErro('')
    setOcupado(true)
    try {
      const { error } = await supabase.from('processo_convidados').insert({ processo_id: processoId, profile_id: profileId })
      if (error) throw error
      await carregar()
      setBusca('')
    } catch {
      setErro('Não foi possível dar acesso a essa pessoa.')
    } finally {
      setOcupado(false)
    }
  }

  async function remover(id: string) {
    if (ocupado) return
    setErro('')
    setOcupado(true)
    try {
      const { error } = await supabase.from('processo_convidados').delete().eq('id', id)
      if (error) throw error
      await carregar()
    } catch {
      setErro('Não foi possível remover o acesso.')
    } finally {
      setOcupado(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Users size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Quem acompanha este processo</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Pessoas com acesso de acompanhamento ao Processo. Só quem já está na organização aparece aqui.
        </p>

        {convidados.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ninguém com acesso ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {convidados.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              >
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {nomePorProfile.get(c.profile_id) ?? 'Pessoa removida da organização'}
                </span>
                <button
                  type="button"
                  onClick={() => void remover(c.id)}
                  disabled={ocupado}
                  aria-label="Remover acesso"
                  className="p-1 rounded disabled:opacity-40"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Dar acesso</h2>
        </div>

        <SearchInput placeholder="Buscar pessoa…" value={busca} onChange={e => setBusca(e.target.value)} />

        <div className="mt-3 space-y-1.5">
          {candidatos.map(m => (
            <div
              key={m.profile_id}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{m.nome}</span>
              <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void convidar(m.profile_id)}>
                Dar acesso
              </Button>
            </div>
          ))}
          {candidatos.length === 0 && (
            <EmptyState icon={Users} title="Ninguém para adicionar" description="Todos os membros já têm acesso, ou nenhum nome bate com a busca." />
          )}
        </div>
      </div>

      {erro && <p className="text-xs px-1" style={{ color: '#f87171' }}>{erro}</p>}
    </div>
  )
}
