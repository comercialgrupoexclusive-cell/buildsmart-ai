'use client'

// ═══════════════════════════════════════════════════════════════════════════
// Boletim de Medição — documento numerado por período.
//
// Lê o avanço físico REAL do cronograma (via prog) e, ao fechar, congela um
// snapshot por etapa (medicao_itens): % anterior, % atual, avanço e valor do
// período. Base para saldo, acumulado e Curva S. (uso interno/gestão)
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react'
import { Plus, FileBarChart, Lock, Trash2, ChevronDown, ChevronRight, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ObraProgresso } from '@/lib/obra-progresso'
import type { Medicao, MedicaoItem } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmt = (d: string) => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
const hoje = () => new Date().toISOString().slice(0, 10)

export function ObraBoletins({ obraId, prog, onMedicaoFechada }: {
  obraId: string
  prog: ObraProgresso | null
  onMedicaoFechada: () => void
}) {
  const supabase = createClient()
  const [boletins, setBoletins] = useState<Medicao[]>([])
  const [itensPorMedicao, setItensPorMedicao] = useState<Record<string, MedicaoItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', periodo_inicio: hoje(), periodo_fim: hoje() })
  const [saving, setSaving] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('medicoes').select('*').eq('obra_id', obraId).order('numero', { ascending: false, nullsFirst: false }).order('periodo_fim', { ascending: false })
    setBoletins((data || []) as Medicao[])
    setLoading(false)
  }, [obraId, supabase])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  async function carregarItens(medicaoId: string) {
    if (itensPorMedicao[medicaoId]) return
    const { data } = await supabase.from('medicao_itens').select('*').eq('medicao_id', medicaoId).order('valor_periodo', { ascending: false })
    setItensPorMedicao(prev => ({ ...prev, [medicaoId]: (data || []) as MedicaoItem[] }))
  }

  function toggleExpand(id: string) {
    const novo = expandido === id ? null : id
    setExpandido(novo)
    if (novo) carregarItens(novo)
  }

  // ── Cria o boletim (rascunho) ───────────────────────────────────────────────
  async function criar() {
    setSaving(true)
    const { data: max } = await supabase.from('medicoes').select('numero').eq('obra_id', obraId).order('numero', { ascending: false, nullsFirst: false }).limit(1)
    const numero = ((max?.[0]?.numero as number) || 0) + 1
    const { error } = await supabase.from('medicoes').insert({
      obra_id: obraId, numero, status: 'rascunho',
      nome: form.nome.trim() || `Medição ${numero}`,
      periodo_inicio: form.periodo_inicio, periodo_fim: form.periodo_fim,
      percentual_executado: 0, fotos: [], updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (error) { alert(`Não foi possível criar o boletim.\n\n${error.message}`); return }
    setShowForm(false); setForm({ nome: '', periodo_inicio: hoje(), periodo_fim: hoje() })
    carregar()
  }

  // ── Fecha o boletim: congela snapshot por etapa ────────────────────────────
  async function fechar(b: Medicao) {
    if (!prog) return
    if (!confirm(`Fechar ${b.nome || 'boletim'}? Isso congela o avanço atual do cronograma como a medição deste período.`)) return
    setSaving(true)

    // % acumulado anterior por etapa = pct_atual do último boletim fechado
    const { data: anterioresRows } = await supabase
      .from('medicao_itens')
      .select('item_id, pct_atual, medicao_id, medicoes!inner(obra_id, status, periodo_fim)')
      .eq('medicoes.obra_id', obraId)
      .eq('medicoes.status', 'fechada')
    const anteriorPorEtapa: Record<string, number> = {}
    ;((anterioresRows || []) as { item_id: string; pct_atual: number }[]).forEach(r => {
      // mantém o maior acumulado já registrado por etapa
      anteriorPorEtapa[r.item_id] = Math.max(anteriorPorEtapa[r.item_id] || 0, Number(r.pct_atual))
    })

    const itens = prog.etapas.map(e => {
      const antes = anteriorPorEtapa[e.id] || 0
      const atual = e.percentual
      const delta = Math.max(0, atual - antes)
      return {
        medicao_id: b.id, item_tipo: 'etapa' as const, item_id: e.id, nome: e.nome,
        valor_contratado: e.valorContratado,
        pct_anterior: antes, pct_atual: atual,
        valor_periodo: (delta / 100) * e.valorContratado,
      }
    })

    const valorPeriodo = itens.reduce((a, i) => a + i.valor_periodo, 0)
    const valorAcumulado = prog.valorTotal * prog.avancoPonderado / 100
    // avanço do período ponderado por valor
    const avancoPeriodo = prog.valorTotal > 0
      ? itens.reduce((a, i) => a + (i.pct_atual - i.pct_anterior) * i.valor_contratado, 0) / prog.valorTotal
      : 0

    // Remove snapshot antigo (se refechar) e grava o novo
    await supabase.from('medicao_itens').delete().eq('medicao_id', b.id)
    if (itens.length > 0) await supabase.from('medicao_itens').insert(itens)
    const { error } = await supabase.from('medicoes').update({
      status: 'fechada',
      percentual_executado: prog.avancoPonderado,
      avanco_acumulado: prog.avancoPonderado,
      avanco_periodo: avancoPeriodo,
      valor_periodo: valorPeriodo,
      valor_acumulado: valorAcumulado,
      updated_at: new Date().toISOString(),
    }).eq('id', b.id)

    setSaving(false)
    if (error) { alert(`Não foi possível fechar o boletim.\n\n${error.message}`); return }
    setItensPorMedicao(prev => { const n = { ...prev }; delete n[b.id]; return n })
    carregar(); onMedicaoFechada()
  }

  async function reabrir(b: Medicao) {
    if (!confirm('Reabrir este boletim para rascunho? O snapshot congelado será descartado.')) return
    await supabase.from('medicao_itens').delete().eq('medicao_id', b.id)
    await supabase.from('medicoes').update({ status: 'rascunho', updated_at: new Date().toISOString() }).eq('id', b.id)
    setItensPorMedicao(prev => { const n = { ...prev }; delete n[b.id]; return n })
    carregar()
  }

  async function remover(id: string) {
    if (!confirm('Remover este boletim de medição?')) return
    await supabase.from('medicoes').delete().eq('id', id)
    setBoletins(prev => prev.filter(b => b.id !== id))
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
  }

  return (
    <div className="flex flex-col gap-3 pb-16">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Boletins de medição</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Um boletim mede um período. Você cria com nome e datas; ao <strong>fechar</strong>, ele congela o avanço atual do cronograma e calcula quanto avançou no período (saldo e valor).</p>
        </div>
        {!showForm && <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 flex-shrink-0"><Plus size={15} /> Novo boletim</button>}
      </div>

      {showForm && (
        <div className="card p-4 flex flex-col gap-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Passo 1 de 2 — identifique o período. Depois de criar, você fecha o boletim para congelar a medição.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Nome</label>
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Medição 1 — Julho" className="input-base w-full" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Período — início</label>
              <input type="date" value={form.periodo_inicio} onChange={e => setForm(f => ({ ...f, periodo_inicio: e.target.value }))} className="input-base w-full" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Período — fim</label>
              <input type="date" value={form.periodo_fim} onChange={e => setForm(f => ({ ...f, periodo_fim: e.target.value }))} className="input-base w-full" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Cancelar</button>
            <button onClick={criar} disabled={saving} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-60"><Plus size={15} /> {saving ? 'Criando…' : 'Criar boletim'}</button>
          </div>
        </div>
      )}

      {boletins.length === 0 && !showForm ? (
        <EmptyState icon={FileBarChart} title="Nenhum boletim ainda" description="Crie o primeiro boletim de medição para registrar formalmente o avanço do período." />
      ) : (
        <div className="flex flex-col gap-2">
          {boletins.map(b => {
            const aberto = expandido === b.id
            const fechada = b.status === 'fechada'
            const itens = itensPorMedicao[b.id] || []
            return (
              <div key={b.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => toggleExpand(b.id)}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                    <FileBarChart size={16} style={{ color: fechada ? 'var(--success)' : 'var(--accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.numero != null && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: fechada ? 'var(--success)' : 'var(--accent)', color: '#fff' }}>Nº {b.numero}</span>}
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{b.nome || 'Boletim'}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{fmt(b.periodo_inicio)} → {fmt(b.periodo_fim)}</span>
                      {fechada
                        ? <span className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}><Lock size={10} /> Fechada</span>
                        : <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>Rascunho</span>}
                    </div>
                    {fechada && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Acumulado <strong style={{ color: 'var(--accent)' }}>{Number(b.avanco_acumulado || 0).toFixed(1)}%</strong>
                        {' · '}período <strong style={{ color: 'var(--success)' }}>+{Number(b.avanco_periodo || 0).toFixed(1)}%</strong>
                        {prog?.temValores ? ` · ${brl(b.valor_periodo || 0)} no período` : ''}
                      </p>
                    )}
                  </div>
                  {aberto ? <ChevronDown size={15} style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={15} style={{ color: 'var(--text-secondary)' }} />}
                </div>

                {aberto && (
                  <div className="flex flex-col gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                    {fechada ? (
                      itens.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs" style={{ color: 'var(--text-primary)' }}>
                            <thead>
                              <tr style={{ color: 'var(--text-secondary)' }}>
                                <th className="text-left font-medium pb-1.5">Etapa</th>
                                <th className="text-right font-medium pb-1.5">Ant.</th>
                                <th className="text-right font-medium pb-1.5">Atual</th>
                                <th className="text-right font-medium pb-1.5">Δ</th>
                                {prog?.temValores && <th className="text-right font-medium pb-1.5">Valor período</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {itens.map(it => (
                                <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td className="py-1.5 pr-2">{it.nome}</td>
                                  <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{Number(it.pct_anterior).toFixed(0)}%</td>
                                  <td className="py-1.5 text-right tabular-nums">{Number(it.pct_atual).toFixed(0)}%</td>
                                  <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: 'var(--success)' }}>+{(Number(it.pct_atual) - Number(it.pct_anterior)).toFixed(0)}%</td>
                                  {prog?.temValores && <td className="py-1.5 text-right tabular-nums">{brl(it.valor_periodo)}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem itens no snapshot.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>Passo 2 de 2.</strong> Este boletim ainda está aberto. Ao fechar, o avanço atual do cronograma vira a medição deste período.
                        </p>
                        {prog && (
                          <div className="flex items-center gap-4 rounded-lg p-3 text-sm" style={{ background: 'var(--bg-secondary)' }}>
                            <div>
                              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Será capturado agora</p>
                              <p className="font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{prog.avancoPonderado.toFixed(1)}%</p>
                            </div>
                            {prog.temValores && (
                              <div>
                                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Valor acumulado</p>
                                <p className="font-bold tabular-nums" style={{ color: 'var(--success)' }}>{brl(prog.valorTotal * prog.avancoPonderado / 100)}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1 flex-wrap">
                      {!fechada ? (
                        <button onClick={() => fechar(b)} disabled={saving} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"><Check size={13} /> Fechar medição</button>
                      ) : (
                        <button onClick={() => reabrir(b)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}>Reabrir</button>
                      )}
                      <button onClick={() => remover(b.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-500/10" style={{ color: 'var(--danger)' }}><Trash2 size={12} /> Remover</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
