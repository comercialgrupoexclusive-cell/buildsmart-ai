'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { loadObraProgresso, propagarAvancoServicos, type AvancoEixo, type EtapaProg, type ObraProgresso } from '@/lib/obra-progresso'
import { ProgressControl } from '@/components/obra/ProgressControl'
import { formatCurrency } from '@/lib/utils'

export function ObraEixoAvanco({ obraId, orcamentoId, eixo }: { obraId: string; orcamentoId: string; eixo: Exclude<AvancoEixo, 'fisico'> }) {
  const supabase = useMemo(() => createClient(), [])
  const [dados, setDados] = useState<ObraProgresso | null>(null)
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const carregar = useCallback(async () => {
    const resultado = await loadObraProgresso(supabase, obraId, eixo, orcamentoId ? [orcamentoId] : undefined)
    setDados(resultado)
    setAbertas(atual => Object.keys(atual).length ? atual : Object.fromEntries(resultado.etapas.map(etapa => [etapa.id, true])))
  }, [supabase, obraId, orcamentoId, eixo])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const campo = eixo === 'mao_obra' ? 'percentual_mao_obra' : 'percentual_gerenciamento'
  async function salvarEtapa(etapa: EtapaProg, percentual: number) {
    setSaving(true)
    const servicos = etapa.subetapas.flatMap(sub => sub.servicos.map(servico => ({ servicoId: servico.id, percentual })))
    if (servicos.length) await propagarAvancoServicos(supabase, obraId, servicos, eixo)
    else {
      await Promise.all([
        supabase.from('etapas').update({ [campo]: percentual }).eq('id', etapa.id),
        ...etapa.subetapas.map(sub => supabase.from('subetapas_cronograma').update({ [campo]: percentual }).eq('id', sub.id)),
      ])
    }
    await carregar(); setSaving(false)
  }

  async function salvarSub(etapa: EtapaProg, sub: EtapaProg['subetapas'][number], percentual: number) {
    setSaving(true)
    if (sub.servicos.length) await propagarAvancoServicos(supabase, obraId, sub.servicos.map(servico => ({ servicoId: servico.id, percentual })), eixo)
    else await supabase.from('subetapas_cronograma').update({ [campo]: percentual }).eq('id', sub.id)
    await carregar(); setSaving(false)
  }

  async function salvarServico(id: string, percentual: number) {
    setSaving(true)
    await propagarAvancoServicos(supabase, obraId, [{ servicoId: id, percentual }], eixo)
    await carregar(); setSaving(false)
  }

  if (!dados) return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  return <div className="flex flex-col gap-3 pb-16">
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold">Avanço físico de {eixo === 'mao_obra' ? 'mão de obra' : 'gerenciamento'}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ajuste pela barra ou pelo percentual. O salvamento ocorre ao soltar.</p></div>
        <strong className="text-lg tabular-nums" style={{ color: 'var(--accent)' }}>{dados.avancoPonderado.toFixed(1)}%</strong>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-secondary)' }}><div className="h-full rounded-full" style={{ width: `${dados.avancoPonderado}%`, background: 'var(--accent)' }} /></div>
      {saving && <p className="mt-2 text-xs" style={{ color: 'var(--accent)' }}>Salvando...</p>}
    </div>

    {dados.etapas.length === 0 ? <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum item disponível para este eixo.</div> : dados.etapas.map(etapa => {
      const peso = dados.valorTotal > 0 ? etapa.valorContratado / dados.valorTotal * 100 : 0
      return <div key={etapa.id} className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" style={{ background: 'var(--bg-secondary)' }}>
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setAbertas(v => ({ ...v, [etapa.id]: !v[etapa.id] }))}>
            {abertas[etapa.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{etapa.nome}</span><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Peso {peso.toFixed(1)}% · {formatCurrency(etapa.valorContratado)}</span></span>
          </button>
          <ProgressControl valor={etapa.percentual} onChange={valor => salvarEtapa(etapa, valor)} compact />
        </div>
        {abertas[etapa.id] && etapa.subetapas.map(sub => <div key={sub.id} style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:pl-8">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{sub.nome}</p><p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Peso na etapa {etapa.valorContratado > 0 ? (sub.valorContratado / etapa.valorContratado * 100).toFixed(1) : '0.0'}%</p></div>
            <ProgressControl valor={sub.percentual} onChange={valor => salvarSub(etapa, sub, valor)} compact />
          </div>
          {sub.servicos.map(servico => <div key={servico.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:pl-12" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <p className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{servico.nome}</p>
            <ProgressControl valor={servico.percentual} onChange={valor => salvarServico(servico.id, valor)} compact />
          </div>)}
        </div>)}
      </div>
    })}
  </div>
}
