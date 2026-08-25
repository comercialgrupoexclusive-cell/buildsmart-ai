'use client'

// Aba "Evidências" da Prospecção (Hotfix pré-reunião). Até aqui, evidências
// só podiam ser registradas via chat com a Luiza (propose_create_evidencia,
// Rodada 7) — não havia UI própria. Reaproveita 100% a estrutura já
// existente (tabela `prospeccao_evidencias`, mesmos campos: informação,
// tipo, fonte, link, data e a classificação observado/inferido/estimado) —
// nenhuma plataforma nova de comparáveis. Fluxo da especificação: Evidências
// → Premissas → Cenários (ver aba Análise, components/investidor/
// ProspeccaoCenarios.tsx).
import { useEffect, useState } from 'react'
import { Plus, Trash2, ExternalLink, FileSearch } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ProspeccaoEvidencia } from '@/lib/types'

const NATUREZA_LABEL: Record<ProspeccaoEvidencia['natureza'], string> = {
  observado: 'Observado',
  inferido: 'Inferido',
  estimado: 'Estimado',
}

const NATUREZA_COLOR: Record<ProspeccaoEvidencia['natureza'], string> = {
  observado: '#10b981',
  inferido: 'var(--accent)',
  estimado: '#f59e0b',
}

function fmtData(iso: string | null) {
  if (!iso) return null
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

const FORM_VAZIO = { informacao: '', tipo: '', fonte: '', url: '', data_evidencia: '', natureza: 'observado' as ProspeccaoEvidencia['natureza'] }

export function ProspeccaoEvidencias({ prospeccaoId }: { prospeccaoId: string }) {
  const [evidencias, setEvidencias] = useState<ProspeccaoEvidencia[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_VAZIO)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('prospeccao_evidencias')
      .select('*')
      .eq('prospeccao_id', prospeccaoId)
      .order('created_at', { ascending: false })
    setEvidencias((data ?? []) as ProspeccaoEvidencia[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [prospeccaoId])

  // A Luiza (Rodada 7) também registra evidência via chat — recarrega sem
  // precisar de F5, mesmo padrão das outras abas do Investidor.
  useEffect(() => {
    function onChanged() { void carregar() }
    window.addEventListener('buildsmart:investidor-changed', onChanged)
    return () => window.removeEventListener('buildsmart:investidor-changed', onChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospeccaoId])

  function abrirNova() {
    setForm(FORM_VAZIO)
    setShowModal(true)
  }

  async function salvar() {
    if (!form.informacao.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('prospeccao_evidencias').insert({
      prospeccao_id: prospeccaoId,
      informacao: form.informacao.trim(),
      tipo: form.tipo.trim() || null,
      fonte: form.fonte.trim() || null,
      url: form.url.trim() || null,
      data_evidencia: form.data_evidencia || null,
      natureza: form.natureza,
    })
    setSaving(false)
    if (error) { alert(`Não foi possível registrar a evidência: ${error.message}`); return }
    setShowModal(false)
    void carregar()
  }

  async function excluir(id: string) {
    if (!confirm('Excluir esta evidência? Essa ação não pode ser desfeita.')) return
    setBusyId(id)
    const supabase = createClient()
    const { error } = await supabase.from('prospeccao_evidencias').delete().eq('id', id)
    setBusyId(null)
    if (error) { alert(`Não foi possível excluir: ${error.message}`); return }
    setEvidencias(prev => prev.filter(e => e.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Evidências</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              O que já se sabe sobre a oportunidade — pesquisas, comparáveis, dados do edital. Serve de base para as premissas dos Cenários (aba Análise).
            </p>
          </div>
          <Button onClick={abrirNova} icon={<Plus size={15} />} className="flex-shrink-0">Nova evidência</Button>
        </div>
      </div>

      {evidencias.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="Nenhuma evidência registrada"
          description="Peça para a Luiza pesquisar (web_search) ou registre manualmente o que já encontrou."
          action={<Button onClick={abrirNova} icon={<Plus size={15} />}>Nova evidência</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {evidencias.map(e => (
            <div key={e.id} className="card p-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${NATUREZA_COLOR[e.natureza]}22`, color: NATUREZA_COLOR[e.natureza] }}
                  >
                    {NATUREZA_LABEL[e.natureza]}
                  </span>
                  {e.tipo && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.tipo}</span>}
                  {fmtData(e.data_evidencia) && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>· {fmtData(e.data_evidencia)}</span>}
                </div>
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{e.informacao}</p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {e.fonte && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Fonte: {e.fonte}</span>}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--accent)' }}>
                      Link <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
              <button onClick={() => excluir(e.id)} disabled={busyId === e.id} className="p-1 rounded hover:bg-red-500/20 transition-colors flex-shrink-0 disabled:opacity-50" title="Excluir">
                <Trash2 size={14} style={{ color: 'var(--danger)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => !saving && setShowModal(false)} title="Nova evidência" size="sm">
        <div className="flex flex-col gap-4">
          <Textarea
            label="Informação encontrada *"
            placeholder="Ex.: Edital cita dívida de IPTU de R$ 8.000; apartamento vizinho anunciado por R$ 420.000..."
            rows={3}
            value={form.informacao}
            onChange={e => setForm(f => ({ ...f, informacao: e.target.value }))}
            autoFocus
          />
          <Select
            label="Natureza"
            value={form.natureza}
            onChange={e => setForm(f => ({ ...f, natureza: e.target.value as ProspeccaoEvidencia['natureza'] }))}
          >
            <option value="observado">Observado — está literalmente na fonte</option>
            <option value="inferido">Inferido — concluí a partir do que vi</option>
            <option value="estimado">Estimado — é uma suposição/cálculo meu</option>
          </Select>
          <Input label="Tipo" placeholder="Ex.: edital, matrícula, anúncio, valor de mercado" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} />
          <Input label="Fonte" placeholder="Ex.: Edital do leilão, print enviado pelo usuário" value={form.fonte} onChange={e => setForm(f => ({ ...f, fonte: e.target.value }))} />
          <Input label="Link" type="url" placeholder="https://..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
          <Input label="Data da evidência" type="date" value={form.data_evidencia} onChange={e => setForm(f => ({ ...f, data_evidencia: e.target.value }))} />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} loading={saving} disabled={!form.informacao.trim()}>Registrar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
