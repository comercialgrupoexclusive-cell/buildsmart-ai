'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, HardHat, FolderOpen, Link2, Unlink, Pencil, Check, X } from 'lucide-react'
import Link from 'next/link'
import { ObraOrcamento } from '@/components/obra/ObraOrcamento'
import { formatCurrency } from '@/lib/utils'

type OrcamentoHeader = {
  id: string
  nome: string | null
  obra_id: string | null
  projeto_id: string | null
  tipo: string
  bdi_percentual: number
  status: string
  versao: number
  created_at: string
  cliente: string | null
  endereco: string | null
  responsavel: string | null
  area_m2: number | null
  uf: string | null
  data_inicio: string | null
  data_previsao: string | null
  observacoes: string | null
}

type LinkedEntity = { id: string; nome: string }

export default function OrcamentoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [orcamento, setOrcamento] = useState<OrcamentoHeader | null>(null)
  const [obra, setObra] = useState<LinkedEntity | null>(null)
  const [projeto, setProjeto] = useState<LinkedEntity | null>(null)
  const [loading, setLoading] = useState(true)
  const [obraUf, setObraUf] = useState('SP')
  const [areaM2, setAreaM2] = useState<number | null>(null)

  // Dados gerais
  const [editDados, setEditDados] = useState(false)
  const [dadosForm, setDadosForm] = useState({
    cliente: '', endereco: '', responsavel: '', area_m2: '' as string, uf: '', data_inicio: '', data_previsao: '', observacoes: ''
  })
  const [savingDados, setSavingDados] = useState(false)

  // Vincular
  const [showVincular, setShowVincular] = useState(false)
  const [vinculoTipo, setVinculoTipo] = useState<'obra' | 'projeto'>('obra')
  const [obrasDisponiveis, setObrasDisponiveis] = useState<LinkedEntity[]>([])
  const [projetosDisponiveis, setProjetosDisponiveis] = useState<LinkedEntity[]>([])
  const [vinculoId, setVinculoId] = useState('')

  useEffect(() => {
    loadOrcamento()
  }, [id])

  async function loadOrcamento() {
    setLoading(true)
    const { data: orc } = await supabase.from('orcamentos').select('*').eq('id', id).single()
    if (!orc) { setLoading(false); return }
    setOrcamento(orc)

    if (orc.obra_id) {
      const { data: o } = await supabase.from('obras').select('id, nome, uf, area_m2').eq('id', orc.obra_id).single()
      if (o) { setObra({ id: o.id, nome: o.nome }); setObraUf(o.uf || 'SP'); setAreaM2(o.area_m2) }
    }
    if (orc.projeto_id) {
      const { data: p } = await supabase.from('projetos').select('id, nome').eq('id', orc.projeto_id).single()
      if (p) setProjeto({ id: p.id, nome: p.nome })
    }
    setLoading(false)
  }

  async function openVincular() {
    const [{ data: obrasData }, { data: projData }] = await Promise.all([
      supabase.from('obras').select('id, nome').order('nome'),
      supabase.from('projetos').select('id, nome').order('nome'),
    ])
    setObrasDisponiveis((obrasData || []) as LinkedEntity[])
    setProjetosDisponiveis((projData || []) as LinkedEntity[])
    setVinculoTipo(obra ? 'projeto' : 'obra')
    setVinculoId('')
    setShowVincular(true)
  }

  async function handleVincular() {
    if (!vinculoId) return
    const update: Record<string, any> = vinculoTipo === 'obra' ? { obra_id: vinculoId } : { projeto_id: vinculoId }

    if (vinculoTipo === 'obra') {
      const { data: obraData } = await supabase.from('obras').select('uf, endereco, responsavel, area_m2, data_inicio, data_previsao').eq('id', vinculoId).single()
      if (obraData && orcamento) {
        if (!orcamento.endereco && obraData.endereco) update.endereco = obraData.endereco
        if (!orcamento.responsavel && obraData.responsavel) update.responsavel = obraData.responsavel
        if (!orcamento.area_m2 && obraData.area_m2) update.area_m2 = obraData.area_m2
        if (!orcamento.uf && obraData.uf) update.uf = obraData.uf
        if (!orcamento.data_inicio && obraData.data_inicio) update.data_inicio = obraData.data_inicio
        if (!orcamento.data_previsao && obraData.data_previsao) update.data_previsao = obraData.data_previsao
      }
    }

    await supabase.from('orcamentos').update(update).eq('id', id)
    setShowVincular(false)
    await loadOrcamento()
  }

  async function handleDesvincular(tipo: 'obra' | 'projeto') {
    const update = tipo === 'obra' ? { obra_id: null } : { projeto_id: null }
    await supabase.from('orcamentos').update(update).eq('id', id)
    if (tipo === 'obra') setObra(null)
    else setProjeto(null)
    setOrcamento(prev => prev ? { ...prev, ...(tipo === 'obra' ? { obra_id: null } : { projeto_id: null }) } : null)
  }

  function startEditDados() {
    if (!orcamento) return
    setDadosForm({
      cliente: orcamento.cliente || '',
      endereco: orcamento.endereco || '',
      responsavel: orcamento.responsavel || '',
      area_m2: orcamento.area_m2 != null ? String(orcamento.area_m2) : '',
      uf: orcamento.uf || '',
      data_inicio: orcamento.data_inicio || '',
      data_previsao: orcamento.data_previsao || '',
      observacoes: orcamento.observacoes || '',
    })
    setEditDados(true)
  }

  async function saveDados() {
    setSavingDados(true)
    const update = {
      cliente: dadosForm.cliente || null,
      endereco: dadosForm.endereco || null,
      responsavel: dadosForm.responsavel || null,
      area_m2: dadosForm.area_m2 ? parseFloat(dadosForm.area_m2) : null,
      uf: dadosForm.uf || null,
      data_inicio: dadosForm.data_inicio || null,
      data_previsao: dadosForm.data_previsao || null,
      observacoes: dadosForm.observacoes || null,
    }
    await supabase.from('orcamentos').update(update).eq('id', id)
    setOrcamento(prev => prev ? { ...prev, ...update } : null)
    if (update.uf) setObraUf(update.uf)
    if (update.area_m2 != null) setAreaM2(update.area_m2)
    setEditDados(false)
    setSavingDados(false)
  }

  const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!orcamento) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p style={{ color: 'var(--text-secondary)' }}>Orçamento não encontrado.</p>
        <Link href="/orcamentos" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Voltar aos orçamentos</Link>
      </div>
    )
  }

  const nomeExibido = orcamento.nome || obra?.nome || `Orçamento v${orcamento.versao}`

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href="/orcamentos" className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80 w-fit" style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={16} /> Orçamentos
        </Link>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{nomeExibido}</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {orcamento.tipo} · v{orcamento.versao} · BDI {orcamento.bdi_percentual}%
            </p>
          </div>
          <button
            onClick={openVincular}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Link2 size={14} /> Vincular
          </button>
        </div>

        {/* Vínculos */}
        {(obra || projeto) && (
          <div className="flex flex-wrap gap-2">
            {obra && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <HardHat size={14} style={{ color: 'var(--accent)' }} />
                <Link href={`/obras/${obra.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                  {obra.nome}
                </Link>
                <button onClick={() => handleDesvincular('obra')} className="ml-1 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                  <Unlink size={12} />
                </button>
              </div>
            )}
            {projeto && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
                <Link href={`/projetos/${projeto.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                  {projeto.nome}
                </Link>
                <button onClick={() => handleDesvincular('projeto')} className="ml-1 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                  <Unlink size={12} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dados Gerais */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Dados Gerais</h2>
          {!editDados ? (
            <button onClick={startEditDados} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80" style={{ color: 'var(--accent)' }}>
              <Pencil size={13} /> Editar
            </button>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={() => setEditDados(false)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                <X size={13} /> Cancelar
              </button>
              <button onClick={saveDados} disabled={savingDados} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                <Check size={13} /> Salvar
              </button>
            </div>
          )}
        </div>

        {editDados ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Cliente</label>
              <input value={dadosForm.cliente} onChange={e => setDadosForm(p => ({ ...p, cliente: e.target.value }))} className="input-base w-full text-sm" placeholder="Nome do cliente" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Responsável</label>
              <input value={dadosForm.responsavel} onChange={e => setDadosForm(p => ({ ...p, responsavel: e.target.value }))} className="input-base w-full text-sm" placeholder="Engenheiro responsável" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>UF</label>
              <select value={dadosForm.uf} onChange={e => setDadosForm(p => ({ ...p, uf: e.target.value }))} className="input-base w-full text-sm">
                <option value="">Selecione...</option>
                {UF_LIST.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Endereço</label>
              <input value={dadosForm.endereco} onChange={e => setDadosForm(p => ({ ...p, endereco: e.target.value }))} className="input-base w-full text-sm" placeholder="Endereço da obra / local" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Área (m²)</label>
              <input type="number" step="0.01" value={dadosForm.area_m2} onChange={e => setDadosForm(p => ({ ...p, area_m2: e.target.value }))} className="input-base w-full text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Data Início</label>
              <input type="date" value={dadosForm.data_inicio} onChange={e => setDadosForm(p => ({ ...p, data_inicio: e.target.value }))} className="input-base w-full text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Previsão Término</label>
              <input type="date" value={dadosForm.data_previsao} onChange={e => setDadosForm(p => ({ ...p, data_previsao: e.target.value }))} className="input-base w-full text-sm" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Observações</label>
              <textarea value={dadosForm.observacoes} onChange={e => setDadosForm(p => ({ ...p, observacoes: e.target.value }))} className="input-base w-full text-sm" rows={3} placeholder="Notas adicionais..." />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {[
              { label: 'Cliente', value: orcamento.cliente },
              { label: 'Responsável', value: orcamento.responsavel },
              { label: 'UF', value: orcamento.uf },
              { label: 'Endereço', value: orcamento.endereco },
              { label: 'Área', value: orcamento.area_m2 ? `${orcamento.area_m2} m²` : null },
              { label: 'Data Início', value: orcamento.data_inicio ? new Date(orcamento.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : null },
              { label: 'Previsão Término', value: orcamento.data_previsao ? new Date(orcamento.data_previsao + 'T12:00:00').toLocaleDateString('pt-BR') : null },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{f.label}</p>
                <p className="text-sm font-medium" style={{ color: f.value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {f.value || '—'}
                </p>
              </div>
            ))}
            {orcamento.observacoes && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Observações</p>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{orcamento.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Orçamento editor */}
      <ObraOrcamento
        orcamentoId={id}
        obraId={orcamento.obra_id || undefined}
        areaM2={areaM2}
        obraName={nomeExibido}
        obraUf={obraUf}
      />

      {/* Modal vincular */}
      {showVincular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowVincular(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Vincular orçamento</h3>

            <div className="flex gap-2 mb-4">
              {['obra', 'projeto'].map(t => (
                <button
                  key={t}
                  onClick={() => { setVinculoTipo(t as 'obra' | 'projeto'); setVinculoId('') }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={vinculoTipo === t
                    ? { background: 'var(--accent)', color: 'white' }
                    : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {t === 'obra' ? 'Obra' : 'Projeto'}
                </button>
              ))}
            </div>

            <select
              value={vinculoId}
              onChange={e => setVinculoId(e.target.value)}
              className="input-base w-full mb-4"
            >
              <option value="">Selecione...</option>
              {(vinculoTipo === 'obra' ? obrasDisponiveis : projetosDisponiveis).map(e => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowVincular(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button
                onClick={handleVincular}
                disabled={!vinculoId}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                Vincular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
