'use client'

import { useEffect, useState } from 'react'
import { LayoutTemplate, Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { criarPlanta, excluirPlanta, listarPlantas, renomearPlanta, type Planta } from '@/lib/processo/planta-baixa'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PlantaEditor } from './PlantaEditor'

// P4.6 Bloco B — Processo → Planta Baixa: lista de plantas do Processo,
// Nova Planta / Abrir, conforme pedido pelo P4.6 ("Processo → módulo/aba
// Planta Baixa → lista de plantas → Nova Planta / Abrir"). Cada linha é um
// cenário independente (nunca sobrescreve outra).
export function ProcessoPlantaBaixa({ processoId }: { processoId: string }) {
  const supabase = createClient()
  const { currentProfile } = useProfile()
  const [plantas, setPlantas] = useState<Planta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [criando, setCriando] = useState(false)
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null)
  const [nomeEdicao, setNomeEdicao] = useState('')

  async function carregar() {
    setLoading(true)
    setError('')
    try {
      setPlantas(await listarPlantas(supabase, processoId))
    } catch {
      setError('Não foi possível carregar as plantas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processoId])

  async function handleNovaPlanta() {
    setCriando(true)
    setError('')
    try {
      const numero = plantas.length + 1
      const nova = await criarPlanta(supabase, processoId, `Planta ${numero}`, currentProfile?.id)
      setPlantas(prev => [...prev, nova])
      setAbertaId(nova.id)
    } catch {
      setError('Não foi possível criar a planta.')
    } finally {
      setCriando(false)
    }
  }

  async function handleRenomear(id: string) {
    if (!nomeEdicao.trim()) { setRenomeandoId(null); return }
    try {
      await renomearPlanta(supabase, id, nomeEdicao.trim())
      setPlantas(prev => prev.map(p => p.id === id ? { ...p, nome: nomeEdicao.trim() } : p))
    } finally {
      setRenomeandoId(null)
    }
  }

  async function handleExcluir(planta: Planta) {
    if (!confirm(`Excluir "${planta.nome}"? Essa ação não pode ser desfeita.`)) return
    try {
      await excluirPlanta(supabase, planta.id)
      setPlantas(prev => prev.filter(p => p.id !== planta.id))
    } catch {
      setError('Não foi possível excluir a planta.')
    }
  }

  if (abertaId) {
    return (
      <PlantaEditor
        plantaId={abertaId}
        onClose={() => { setAbertaId(null); carregar() }}
      />
    )
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutTemplate size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Planta Baixa</h2>
        </div>
        <Button size="sm" icon={<Plus size={16} />} loading={criando} onClick={handleNovaPlanta}>
          Nova Planta
        </Button>
      </div>

      {error && (
        <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : plantas.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="Nenhuma planta ainda"
          description="Crie a primeira planta baixa deste Processo — paredes, portas, janelas e status de reforma (existente/construir/demolir)."
          action={<Button size="sm" icon={<Plus size={16} />} loading={criando} onClick={handleNovaPlanta}>Nova Planta</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {plantas.map(planta => (
            <div key={planta.id} className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <div className="min-w-0 flex-1">
                {renomeandoId === planta.id ? (
                  <input
                    autoFocus
                    className="input-base text-sm"
                    value={nomeEdicao}
                    onChange={e => setNomeEdicao(e.target.value)}
                    onBlur={() => handleRenomear(planta.id)}
                    onKeyDown={e => e.key === 'Enter' && handleRenomear(planta.id)}
                  />
                ) : (
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{planta.nome}</p>
                )}
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Atualizado em {new Date(planta.updated_at).toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setRenomeandoId(planta.id); setNomeEdicao(planta.nome) }}
                  className="p-2 rounded-lg hover:bg-[var(--bg-card)]"
                  title="Renomear"
                >
                  <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
                </button>
                <button
                  onClick={() => handleExcluir(planta)}
                  className="p-2 rounded-lg hover:bg-red-500/20"
                  title="Excluir"
                >
                  <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                </button>
                <Button size="sm" variant="secondary" onClick={() => setAbertaId(planta.id)}>
                  Abrir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
