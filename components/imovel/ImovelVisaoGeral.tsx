'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Imovel } from '@/lib/types'
import { formatCurrency, formatDate, ORIGEM_IMOVEL_LABEL, TIPO_IMOVEL_LABEL, FASE_IMOVEL_LABEL } from '@/lib/utils'
import { Pencil, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

type Props = { imovel: Imovel; onUpdate: (fields: Partial<Imovel>) => void }

export function ImovelVisaoGeral({ imovel, onUpdate }: Props) {
  const supabase = createClient()
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    titulo: imovel.titulo,
    origem: imovel.origem,
    link_anuncio: imovel.link_anuncio || '',
    endereco: imovel.endereco || '',
    bairro: imovel.bairro || '',
    cidade: imovel.cidade || '',
    uf: imovel.uf || '',
    tipo_imovel: imovel.tipo_imovel,
    area_m2: imovel.area_m2 != null ? String(imovel.area_m2) : '',
    quartos: imovel.quartos != null ? String(imovel.quartos) : '',
    banheiros: imovel.banheiros != null ? String(imovel.banheiros) : '',
    vagas: imovel.vagas != null ? String(imovel.vagas) : '',
    caracteristicas: imovel.caracteristicas || '',
    motivo_descarte: imovel.motivo_descarte || '',
  })

  function openEdit() {
    setForm({
      titulo: imovel.titulo,
      origem: imovel.origem,
      link_anuncio: imovel.link_anuncio || '',
      endereco: imovel.endereco || '',
      bairro: imovel.bairro || '',
      cidade: imovel.cidade || '',
      uf: imovel.uf || '',
      tipo_imovel: imovel.tipo_imovel,
      area_m2: imovel.area_m2 != null ? String(imovel.area_m2) : '',
      quartos: imovel.quartos != null ? String(imovel.quartos) : '',
      banheiros: imovel.banheiros != null ? String(imovel.banheiros) : '',
      vagas: imovel.vagas != null ? String(imovel.vagas) : '',
      caracteristicas: imovel.caracteristicas || '',
      motivo_descarte: imovel.motivo_descarte || '',
    })
    setShowEdit(true)
  }

  async function handleSave() {
    if (!form.titulo.trim()) return
    setSaving(true)
    const fields = {
      titulo: form.titulo,
      origem: form.origem,
      link_anuncio: form.link_anuncio || null,
      endereco: form.endereco || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      uf: form.uf || null,
      tipo_imovel: form.tipo_imovel,
      area_m2: form.area_m2 ? parseFloat(form.area_m2) : null,
      quartos: form.quartos ? parseInt(form.quartos) : null,
      banheiros: form.banheiros ? parseInt(form.banheiros) : null,
      vagas: form.vagas ? parseInt(form.vagas) : null,
      caracteristicas: form.caracteristicas || null,
      motivo_descarte: form.motivo_descarte || null,
    }
    onUpdate(fields as Partial<Imovel>)
    const { error } = await supabase.from('imoveis').update(fields).eq('id', imovel.id)
    setSaving(false)
    setShowEdit(false)
    if (error) alert('Erro ao salvar: ' + error.message)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Dados da Prospecção</h2>
            <button
              onClick={openEdit}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Pencil size={13} /> Editar
            </button>
          </div>
          <dl className="flex flex-col gap-3">
            {[
              { label: 'Título', value: imovel.titulo },
              { label: 'Origem', value: ORIGEM_IMOVEL_LABEL[imovel.origem] },
              { label: 'Tipo', value: TIPO_IMOVEL_LABEL[imovel.tipo_imovel] },
              { label: 'Endereço', value: imovel.endereco || '—' },
              { label: 'Bairro', value: imovel.bairro || '—' },
              { label: 'Cidade / UF', value: [imovel.cidade, imovel.uf].filter(Boolean).join(' / ') || '—' },
              { label: 'Área', value: imovel.area_m2 ? `${imovel.area_m2} m²` : '—' },
              { label: 'Quartos / Banheiros / Vagas', value: `${imovel.quartos ?? '—'} / ${imovel.banheiros ?? '—'} / ${imovel.vagas ?? '—'}` },
              { label: 'Status atual', value: FASE_IMOVEL_LABEL[imovel.fase] },
              { label: 'Cadastrado em', value: formatDate(imovel.created_at) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm gap-3">
                <dt style={{ color: 'var(--text-secondary)' }}>{label}</dt>
                <dd className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value}</dd>
              </div>
            ))}
            {imovel.link_anuncio && (
              <div className="flex justify-between text-sm gap-3">
                <dt style={{ color: 'var(--text-secondary)' }}>Anúncio</dt>
                <dd className="font-medium text-right">
                  <a href={imovel.link_anuncio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--accent)' }}>
                    Ver anúncio <ExternalLink size={12} />
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card p-6 flex flex-col gap-4">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Características</h2>
          {imovel.caracteristicas ? (
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{imovel.caracteristicas}</p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma característica registrada ainda. Clique em Editar para adicionar detalhes relevantes (estado de conservação, pontos fortes/fracos, observações da visita).</p>
          )}

          {imovel.fase === 'descartado' && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--danger)' }}>Motivo do descarte</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{imovel.motivo_descarte || 'Não informado.'}</p>
            </div>
          )}

          {imovel.valor_compra_estimado != null && (
            <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Valor pretendido / anunciado</p>
              <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(imovel.valor_compra_estimado)}</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Editar Dados do Imóvel" size="lg">
        <div className="flex flex-col gap-4">
          <Input label="Título *" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Origem" value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value as Imovel['origem'] }))}>
              {Object.entries(ORIGEM_IMOVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select label="Tipo de imóvel" value={form.tipo_imovel} onChange={e => setForm(f => ({ ...f, tipo_imovel: e.target.value as Imovel['tipo_imovel'] }))}>
              {Object.entries(TIPO_IMOVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <Input label="Link do anúncio / leilão" value={form.link_anuncio} onChange={e => setForm(f => ({ ...f, link_anuncio: e.target.value }))} />
          <Input label="Endereço" value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Bairro" value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} />
            <Input label="Cidade" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} />
            <Input label="UF" value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase().slice(0, 2) }))} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Input label="Área (m²)" type="number" value={form.area_m2} onChange={e => setForm(f => ({ ...f, area_m2: e.target.value }))} />
            <Input label="Quartos" type="number" value={form.quartos} onChange={e => setForm(f => ({ ...f, quartos: e.target.value }))} />
            <Input label="Banheiros" type="number" value={form.banheiros} onChange={e => setForm(f => ({ ...f, banheiros: e.target.value }))} />
            <Input label="Vagas" type="number" value={form.vagas} onChange={e => setForm(f => ({ ...f, vagas: e.target.value }))} />
          </div>
          <Textarea
            label="Características / observações"
            rows={3}
            value={form.caracteristicas}
            onChange={e => setForm(f => ({ ...f, caracteristicas: e.target.value }))}
            placeholder="Estado de conservação, pontos fortes/fracos, observações da visita..."
          />
          {imovel.fase === 'descartado' && (
            <Textarea
              label="Motivo do descarte"
              rows={2}
              value={form.motivo_descarte}
              onChange={e => setForm(f => ({ ...f, motivo_descarte: e.target.value }))}
            />
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowEdit(false)}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.titulo.trim()} onClick={handleSave}>Salvar alterações</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
