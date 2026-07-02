'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Imovel, ImovelReformaItem, ImovelReformaEtapa, ImovelFoto } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Trash2, ArrowRight, Camera, X, ImageIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

type Props = { imovel: Imovel; onUpdate: (fields: Partial<Imovel>) => void }
type SubTab = 'orcamento' | 'cronograma' | 'fotos'

const CATEGORIA_LABEL: Record<string, string> = { servico: 'Serviço', material: 'Material', mao_de_obra: 'Mão de obra', outro: 'Outro' }
const STATUS_ITEM_LABEL: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' }

export function ImovelReforma({ imovel, onUpdate }: Props) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<SubTab>('orcamento')
  const [itens, setItens] = useState<ImovelReformaItem[]>([])
  const [etapas, setEtapas] = useState<ImovelReformaEtapa[]>([])
  const [fotos, setFotos] = useState<ImovelFoto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [datas, setDatas] = useState({
    orcamento_reforma: imovel.orcamento_reforma != null ? String(imovel.orcamento_reforma) : '',
    data_inicio_reforma: imovel.data_inicio_reforma || '',
    data_fim_reforma_prevista: imovel.data_fim_reforma_prevista || '',
    data_fim_reforma_real: imovel.data_fim_reforma_real || '',
  })

  useEffect(() => { load() }, [imovel.id])

  async function load() {
    setLoading(true)
    const [itensRes, etapasRes, fotosRes] = await Promise.all([
      supabase.from('imovel_reforma_itens').select('*').eq('imovel_id', imovel.id).order('ordem'),
      supabase.from('imovel_reforma_etapas').select('*').eq('imovel_id', imovel.id).order('ordem'),
      supabase.from('imovel_fotos').select('*').eq('imovel_id', imovel.id).order('created_at', { ascending: false }),
    ])
    setItens((itensRes.data || []) as ImovelReformaItem[])
    setEtapas((etapasRes.data || []) as ImovelReformaEtapa[])
    setFotos((fotosRes.data || []) as ImovelFoto[])
    setLoading(false)
  }

  async function salvarDatas() {
    setSaving(true)
    const fields = {
      orcamento_reforma: datas.orcamento_reforma ? parseFloat(datas.orcamento_reforma) : null,
      data_inicio_reforma: datas.data_inicio_reforma || null,
      data_fim_reforma_prevista: datas.data_fim_reforma_prevista || null,
      data_fim_reforma_real: datas.data_fim_reforma_real || null,
    }
    onUpdate(fields as Partial<Imovel>)
    const { error } = await supabase.from('imoveis').update(fields).eq('id', imovel.id)
    setSaving(false)
    if (error) alert('Erro ao salvar: ' + error.message)
  }

  async function avancarVenda() {
    await salvarDatas()
    onUpdate({ fase: 'venda' })
    await supabase.from('imoveis').update({ fase: 'venda' }).eq('id', imovel.id)
  }

  const totalPrevisto = itens.reduce((s, i) => s + (i.valor_previsto || 0), 0)
  const totalRealizado = itens.reduce((s, i) => s + (i.valor_realizado ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Reforma</h2>
          <div className="flex gap-3">
            <Button size="sm" variant="secondary" loading={saving} onClick={salvarDatas}>Salvar prazos</Button>
            {imovel.fase !== 'venda' && (
              <Button size="sm" icon={<ArrowRight size={14} />} onClick={avancarVenda}>Avançar para Venda</Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Orçamento total (R$)</label>
            <input type="number" className="input-base" value={datas.orcamento_reforma} onChange={e => setDatas(d => ({ ...d, orcamento_reforma: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Início</label>
            <input type="date" className="input-base" value={datas.data_inicio_reforma} onChange={e => setDatas(d => ({ ...d, data_inicio_reforma: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Previsão de fim</label>
            <input type="date" className="input-base" value={datas.data_fim_reforma_prevista} onChange={e => setDatas(d => ({ ...d, data_fim_reforma_prevista: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Fim real</label>
            <input type="date" className="input-base" value={datas.data_fim_reforma_real} onChange={e => setDatas(d => ({ ...d, data_fim_reforma_real: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {([['orcamento', 'Orçamento / Serviços'], ['cronograma', 'Cronograma'], ['fotos', 'Fotos']] as [SubTab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={subTab === id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : subTab === 'orcamento' ? (
        <ItensReforma imovelId={imovel.id} itens={itens} setItens={setItens} totalPrevisto={totalPrevisto} totalRealizado={totalRealizado} />
      ) : subTab === 'cronograma' ? (
        <EtapasReforma imovelId={imovel.id} etapas={etapas} setEtapas={setEtapas} />
      ) : (
        <FotosReforma imovelId={imovel.id} fotos={fotos} setFotos={setFotos} />
      )}
    </div>
  )
}

// ─── Orçamento — itens previsto x realizado ──────────────────────────────────
function ItensReforma({ imovelId, itens, setItens, totalPrevisto, totalRealizado }: {
  imovelId: string; itens: ImovelReformaItem[]; setItens: (v: ImovelReformaItem[]) => void
  totalPrevisto: number; totalRealizado: number
}) {
  const supabase = createClient()
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ categoria: 'servico', descricao: '', fornecedor: '', valor_previsto: '', valor_realizado: '', status: 'pendente', data_prevista: '' })

  async function handleAdd() {
    if (!form.descricao.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('imovel_reforma_itens').insert({
      imovel_id: imovelId,
      categoria: form.categoria,
      descricao: form.descricao,
      fornecedor: form.fornecedor || null,
      valor_previsto: form.valor_previsto ? parseFloat(form.valor_previsto) : 0,
      valor_realizado: form.valor_realizado ? parseFloat(form.valor_realizado) : null,
      status: form.status,
      data_prevista: form.data_prevista || null,
      ordem: itens.length,
    }).select().single()
    setSaving(false)
    if (error) { alert('Erro ao adicionar: ' + error.message); return }
    if (data) setItens([...itens, data as ImovelReformaItem])
    setShowModal(false)
    setForm({ categoria: 'servico', descricao: '', fornecedor: '', valor_previsto: '', valor_realizado: '', status: 'pendente', data_prevista: '' })
  }

  async function handleRemove(id: string) {
    setItens(itens.filter(i => i.id !== id))
    await supabase.from('imovel_reforma_itens').delete().eq('id', id)
  }

  async function handleUpdateField(id: string, fields: Partial<ImovelReformaItem>) {
    setItens(itens.map(i => i.id === id ? { ...i, ...fields } : i))
    await supabase.from('imovel_reforma_itens').update(fields).eq('id', id)
  }

  return (
    <div className="card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Itens da reforma</h3>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>Adicionar item</Button>
      </div>

      {itens.length === 0 ? (
        <EmptyState icon={ImageIcon} title="Nenhum item cadastrado" description="Registre serviços e materiais previstos para acompanhar previsto x realizado." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Categoria', 'Descrição', 'Fornecedor', 'Previsto', 'Realizado', 'Status', ''].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-2 px-2"><Badge variant="info">{CATEGORIA_LABEL[item.categoria]}</Badge></td>
                  <td className="py-2 px-2" style={{ color: 'var(--text-primary)' }}>{item.descricao}</td>
                  <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{item.fornecedor || '—'}</td>
                  <td className="py-2 px-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.valor_previsto)}</td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      defaultValue={item.valor_realizado ?? ''}
                      placeholder="—"
                      className="input-base w-28 py-1"
                      onBlur={e => handleUpdateField(item.id, { valor_realizado: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={item.status}
                      onChange={e => handleUpdateField(item.id, { status: e.target.value as ImovelReformaItem['status'] })}
                      className="input-base py-1 text-xs"
                    >
                      {Object.entries(STATUS_ITEM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <button onClick={() => handleRemove(item.id)} className="p-1.5 rounded hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-2 px-2 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>Total</td>
                <td className="py-2 px-2 font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalPrevisto)}</td>
                <td className="py-2 px-2 font-semibold tabular-nums" style={{ color: totalRealizado > totalPrevisto ? 'var(--danger)' : 'var(--success)' }}>{formatCurrency(totalRealizado)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Adicionar item de reforma" size="md">
        <div className="flex flex-col gap-4">
          <Select label="Categoria" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
            {Object.entries(CATEGORIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input label="Descrição *" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Pintura interna" />
          <Input label="Fornecedor" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor previsto (R$)" type="number" value={form.valor_previsto} onChange={e => setForm(f => ({ ...f, valor_previsto: e.target.value }))} />
            <Input label="Valor realizado (R$)" type="number" value={form.valor_realizado} onChange={e => setForm(f => ({ ...f, valor_realizado: e.target.value }))} />
          </div>
          <Input label="Data prevista" type="date" value={form.data_prevista} onChange={e => setForm(f => ({ ...f, data_prevista: e.target.value }))} />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.descricao.trim()} onClick={handleAdd}>Adicionar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Cronograma — etapas simples ─────────────────────────────────────────────
function EtapasReforma({ imovelId, etapas, setEtapas }: { imovelId: string; etapas: ImovelReformaEtapa[]; setEtapas: (v: ImovelReformaEtapa[]) => void }) {
  const supabase = createClient()
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: '', data_inicio: '', data_fim: '' })

  async function handleAdd() {
    if (!form.nome.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('imovel_reforma_etapas').insert({
      imovel_id: imovelId, nome: form.nome, data_inicio: form.data_inicio || null, data_fim: form.data_fim || null,
      percentual_executado: 0, ordem: etapas.length,
    }).select().single()
    setSaving(false)
    if (error) { alert('Erro ao adicionar: ' + error.message); return }
    if (data) setEtapas([...etapas, data as ImovelReformaEtapa])
    setShowModal(false)
    setForm({ nome: '', data_inicio: '', data_fim: '' })
  }

  async function handleRemove(id: string) {
    setEtapas(etapas.filter(e => e.id !== id))
    await supabase.from('imovel_reforma_etapas').delete().eq('id', id)
  }

  async function handlePercentual(id: string, percentual: number) {
    setEtapas(etapas.map(e => e.id === id ? { ...e, percentual_executado: percentual } : e))
    await supabase.from('imovel_reforma_etapas').update({ percentual_executado: percentual }).eq('id', id)
  }

  return (
    <div className="card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Etapas da reforma</h3>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>Nova etapa</Button>
      </div>

      {etapas.length === 0 ? (
        <EmptyState icon={ImageIcon} title="Nenhuma etapa cadastrada" description="Divida a reforma em etapas para acompanhar o cronograma." />
      ) : (
        <div className="flex flex-col gap-3">
          {etapas.map(etapa => (
            <div key={etapa.id} className="flex items-center gap-4 p-3 rounded-lg" style={{ border: '1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(etapa.data_inicio)} → {formatDate(etapa.data_fim)}</p>
              </div>
              <div className="w-32 flex-shrink-0">
                <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="h-full rounded-full" style={{ width: `${etapa.percentual_executado}%`, background: 'var(--accent)' }} />
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  defaultValue={etapa.percentual_executado}
                  onMouseUp={e => handlePercentual(etapa.id, parseFloat((e.target as HTMLInputElement).value))}
                  onTouchEnd={e => handlePercentual(etapa.id, parseFloat((e.target as HTMLInputElement).value))}
                  className="w-full"
                />
                <p className="text-xs text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{etapa.percentual_executado}%</p>
              </div>
              <button onClick={() => handleRemove(etapa.id)} className="p-1.5 rounded hover:bg-[var(--bg-secondary)] flex-shrink-0" style={{ color: 'var(--danger)' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nova etapa" size="sm">
        <div className="flex flex-col gap-4">
          <Input label="Nome *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Demolição / Alvenaria" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Início" type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
            <Input label="Fim" type="date" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.nome.trim()} onClick={handleAdd}>Adicionar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Fotos — acompanhamento visual ───────────────────────────────────────────
function FotosReforma({ imovelId, fotos, setFotos }: { imovelId: string; fotos: ImovelFoto[]; setFotos: (v: ImovelFoto[]) => void }) {
  const supabase = createClient()
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ url: '', categoria: 'durante', descricao: '' })

  function handleUpload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') { setUploading(false); return }
      const img = new Image()
      img.onload = () => {
        const max = 1280
        const escala = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * escala)
        const h = Math.round(img.height * escala)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { setForm(f => ({ ...f, url: dataUrl })); setUploading(false); return }
        ctx.drawImage(img, 0, 0, w, h)
        setForm(f => ({ ...f, url: canvas.toDataURL('image/jpeg', 0.8) }))
        setUploading(false)
      }
      img.onerror = () => { setForm(f => ({ ...f, url: dataUrl })); setUploading(false) }
      img.src = dataUrl
    }
    reader.onerror = () => setUploading(false)
    reader.readAsDataURL(file)
  }

  async function handleAdd() {
    if (!form.url.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('imovel_fotos').insert({
      imovel_id: imovelId, url: form.url, categoria: form.categoria, descricao: form.descricao || null,
    }).select().single()
    setSaving(false)
    if (error) { alert('Erro ao adicionar: ' + error.message); return }
    if (data) setFotos([data as ImovelFoto, ...fotos])
    setShowModal(false)
    setForm({ url: '', categoria: 'durante', descricao: '' })
  }

  async function handleRemove(id: string) {
    setFotos(fotos.filter(f => f.id !== id))
    await supabase.from('imovel_fotos').delete().eq('id', id)
  }

  return (
    <div className="card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Fotos e acompanhamento</h3>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>Adicionar foto</Button>
      </div>

      {fotos.length === 0 ? (
        <EmptyState icon={Camera} title="Nenhuma foto cadastrada" description="Registre o antes, durante e depois da reforma." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {fotos.map(foto => (
            <div key={foto.id} className="relative rounded-lg overflow-hidden group" style={{ border: '1px solid var(--border)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt={foto.descricao || foto.categoria} className="w-full h-32 object-cover" />
              <div className="absolute top-1.5 left-1.5">
                <Badge variant="info">{foto.categoria}</Badge>
              </div>
              <button
                onClick={() => handleRemove(foto.id)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}
              >
                <X size={12} />
              </button>
              {foto.descricao && (
                <p className="text-xs p-1.5 truncate" style={{ color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>{foto.descricao}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Adicionar foto" size="md">
        <div className="flex flex-col gap-4">
          {form.url ? (
            <div className="relative h-40 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.url} alt="Prévia" className="w-full h-full object-cover" />
              <button type="button" onClick={() => setForm(f => ({ ...f, url: '' }))} className="absolute top-2 right-2 p-1.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 h-24 rounded-xl cursor-pointer transition-all hover:opacity-80" style={{ border: '1px dashed var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
              <Camera size={15} /> {uploading ? 'Carregando...' : 'Anexar imagem do dispositivo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e.target.files)} disabled={uploading} />
            </label>
          )}
          <Input label="Ou cole uma URL" value={form.url.startsWith('data:') ? '' : form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." />
          <Select label="Categoria" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
            <option value="antes">Antes</option>
            <option value="durante">Durante</option>
            <option value="depois">Depois</option>
            <option value="documento">Documento</option>
          </Select>
          <Input label="Descrição" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.url.trim()} onClick={handleAdd}>Adicionar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
