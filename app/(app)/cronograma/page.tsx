'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa, Obra } from '@/lib/types'
import { formatDate, diasAteData, STATUS_ETAPA_COLOR, STATUS_ETAPA_LABEL } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'
import { CronogramaGantt } from '@/components/obra/CronogramaGantt'

export default function CronogramaPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapas, setSubetapas] = useState<{ id: string; etapa_id: string | null; nome: string; codigo?: string | null; quantidade?: number; unidade?: string | null }[]>([])
  const [obraId, setObraId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadObras()
  }, [])

  useEffect(() => {
    if (obraId) loadEtapas(obraId)
    else { setEtapas([]); setSubetapas([]) }
  }, [obraId])

  async function loadObras() {
    const { data } = await supabase.from('obras').select('*').order('created_at', { ascending: false })
    const list = data || []
    setObras(list)
    if (list.length > 0) setObraId(list[0].id)
  }

  async function loadEtapas(id: string) {
    setLoading(true)
    const [{ data }, { data: orcamentos }] = await Promise.all([
      supabase.from('etapas').select('*').eq('obra_id', id).order('ordem'),
      supabase.from('orcamentos').select('id').eq('obra_id', id),
    ])
    setEtapas(data || [])

    const orcamentoIds = ((orcamentos || []) as { id: string }[]).map(o => o.id)
    if (orcamentoIds.length > 0) {
      const { data: itens } = await supabase
        .from('orcamento_itens')
        .select('*')
        .in('orcamento_id', orcamentoIds)
        .order('updated_at')

      setSubetapas(((itens || []) as any[])
        .filter(item => item.etapa_id)
        .map(item => ({
          id: item.id,
          etapa_id: item.etapa_id,
          nome: item.subetapa || item.descricao_snapshot || 'Item do orçamento',
          codigo: item.codigo_snapshot,
          quantidade: item.quantidade,
          unidade: item.unidade_snapshot,
        })))
    } else {
      setSubetapas([])
    }

    setLoading(false)
  }

  async function updateStatus(etapaId: string, status: Etapa['status']) {
    await supabase.from('etapas').update({ status }).eq('id', etapaId)
    setEtapas(prev => prev.map(e => e.id === etapaId ? { ...e, status } : e))
  }

  const obraAtual = obras.find(o => o.id === obraId)

  return (
    <div className="flex flex-col gap-6">
      {/* Seletor de obra */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
            Obra
          </label>
          <select
            value={obraId}
            onChange={e => setObraId(e.target.value)}
            className="input-base min-w-72"
          >
            {obras.map(o => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        </div>
        {obraAtual && (
          <Link
            href={`/obras/${obraAtual.id}?tab=cronograma`}
            className="text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ color: 'var(--accent)' }}
          >
            Abrir na obra →
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !obraId ? (
        <EmptyState icon={CalendarDays} title="Selecione uma obra" description="Escolha uma obra acima para ver o cronograma." />
      ) : etapas.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma etapa cadastrada"
          description="Acesse a aba Cronograma dentro da obra para adicionar etapas, ou finalize o orçamento para gerar automaticamente."
          action={
            <Link href={`/obras/${obraId}?tab=cronograma`}
              className="btn-primary px-4 py-2 text-sm rounded-lg inline-flex">
              Ir para a obra
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <CronogramaGantt etapas={etapas} subetapas={subetapas} titulo={`Gantt - ${obraAtual?.nome || 'obra'}`} />

          {/* Linha do tempo */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <CalendarDays size={18} style={{ color: 'var(--accent)' }} />
              {etapas.length} etapa{etapas.length !== 1 ? 's' : ''} — {obraAtual?.nome}
            </h2>
            <div className="flex flex-col gap-2">
              {etapas.map(etapa => {
                const dias = etapa.data_inicio ? diasAteData(etapa.data_inicio) : null
                const critica = dias !== null && dias <= 7 && etapa.status !== 'concluida'
                return (
                  <div
                    key={etapa.id}
                    className="flex items-center gap-4 p-3 rounded-lg border"
                    style={{
                      background: 'var(--bg-secondary)',
                      borderColor: critica ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: 'var(--accent)', opacity: etapa.status === 'concluida' ? 0.5 : 1 }}>
                      {etapa.ordem}
                    </div>
                    {critica && <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_ETAPA_COLOR[etapa.status]}`}>
                          {STATUS_ETAPA_LABEL[etapa.status]}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {etapa.data_inicio ? `${formatDate(etapa.data_inicio)} → ${formatDate(etapa.data_fim)}` : 'Datas a definir'}
                        {dias !== null && dias > 0 && ` · inicia em ${dias} dias`}
                        {dias !== null && dias === 0 && ' · começa hoje'}
                        {dias !== null && dias < 0 && ` · iniciou há ${Math.abs(dias)} dias`}
                      </p>
                    </div>
                    <select
                      value={etapa.status}
                      onChange={e => updateStatus(etapa.id, e.target.value as Etapa['status'])}
                      className="text-xs rounded-lg px-2 py-1 flex-shrink-0"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    >
                      <option value="planejada">A executar</option>
                      <option value="em_andamento">Em execucao</option>
                      <option value="concluida">Concluida</option>
                      <option value="atrasada">Ponto de atencao</option>
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
