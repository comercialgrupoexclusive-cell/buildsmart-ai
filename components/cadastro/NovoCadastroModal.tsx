'use client'

import { useState, useRef } from 'react'
import { X, Plus, Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SINAPI_UFS } from '@/lib/types'

export type CadastroTipoNovo = 'projeto' | 'obra' | 'orcamento'

interface Props {
  tipo: CadastroTipoNovo
  templates?: { id: string; nome: string }[]
  profiles?: { id: string; name: string; apelido: string | null }[]
  obras?: { id: string; nome: string }[]
  projetos?: { id: string; nome: string }[]
  onClose: () => void
  onCreated: () => void
}

const EMPTY_FORM = {
  nome: '',
  cliente: '',
  endereco: '',
  data_inicio: '',
  data_previsao: '',
  foto_url: '',
  area_m2: '',
  uf: 'SP',
  template_id: '',
  obra_id: '',
  projeto_id: '',
}

export function NovoCadastroModal({ tipo: tipoProp, templates = [], profiles = [], obras = [], projetos = [], onClose, onCreated }: Props) {
  const supabase = createClient()
  const [tipo, setTipo] = useState<CadastroTipoNovo>(tipoProp)
  const [form, setForm] = useState(EMPTY_FORM)
  // Fix #2: lista de IDs dos responsáveis selecionados (sem datalist instável)
  const [responsaveis, setResponsaveis] = useState<string[]>([])
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fotoRef = useRef<HTMLInputElement>(null)

  function handleFoto(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploadingFoto(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') { setUploadingFoto(false); return }
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxSize = 1200
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) { setForm(f => ({ ...f, foto_url: dataUrl })); setUploadingFoto(false); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setForm(f => ({ ...f, foto_url: canvas.toDataURL('image/jpeg', 0.8) }))
        setUploadingFoto(false)
      }
      img.onerror = () => { setForm(f => ({ ...f, foto_url: dataUrl })); setUploadingFoto(false) }
      img.src = dataUrl
    }
    reader.onerror = () => setUploadingFoto(false)
    reader.readAsDataURL(file)
  }

  function addResponsavel(profileId: string) {
    if (!profileId || responsaveis.includes(profileId)) return
    setResponsaveis(prev => [...prev, profileId])
  }

  function removeResponsavel(profileId: string) {
    setResponsaveis(prev => prev.filter(x => x !== profileId))
  }

  function getProfileLabel(id: string) {
    const p = profiles.find(x => x.id === id)
    return p ? (p.apelido ?? p.name) : id
  }

  // Profiles ainda não selecionados (para o select de adição)
  const profilesDisponiveis = profiles.filter(p => !responsaveis.includes(p.id))

  async function handleSave() {
    setError('')
    if (!form.nome.trim() && tipo !== 'orcamento') { setError('Nome é obrigatório.'); return }
    setSaving(true)

    try {
      if (tipo === 'obra') {
        const { data: obra, error: obraErr } = await supabase.from('obras').insert({
          nome: form.nome.trim(),
          endereco: form.endereco.trim() || null,
          data_inicio: form.data_inicio || null,
          data_previsao: form.data_previsao || null,
          foto_url: form.foto_url || null,
          area_m2: form.area_m2 ? Number(form.area_m2) : null,
          uf: form.uf || 'SP',
          status: 'ativa',
        }).select().single()

        if (obraErr || !obra) throw new Error(obraErr?.message ?? 'Erro ao criar obra')

        // Salvar responsáveis
        if (responsaveis.length > 0) {
          await supabase.from('obra_usuarios').insert(
            responsaveis.map(pid => ({ obra_id: obra.id, profile_id: pid, papel: 'responsavel' }))
          )
        }

      } else if (tipo === 'projeto') {
        const { data: proj, error: projErr } = await supabase.from('projetos').insert({
          nome: form.nome.trim(),
          cliente: form.cliente.trim() || null,
          endereco: form.endereco.trim() || null,
          data_inicio: form.data_inicio || null,
          data_previsao: form.data_previsao || null,
          foto_url: form.foto_url || null,
          status: 'em_andamento',
        }).select().single()

        if (projErr || !proj) throw new Error(projErr?.message ?? 'Erro ao criar projeto')

        // Salvar responsáveis
        if (responsaveis.length > 0) {
          await supabase.from('projeto_usuarios').insert(
            responsaveis.map(pid => ({ projeto_id: proj.id, profile_id: pid, papel: 'responsavel' }))
          )
        }

        // Aplicar template se selecionado
        if (form.template_id) {
          const { data: tmpl } = await supabase.from('projeto_templates').select('itens').eq('id', form.template_id).single()
          if (tmpl?.itens && Array.isArray(tmpl.itens)) {
            const flatItems: { projeto_id: string; parent_id: string | null; nome: string; nivel: number; ordem: number; concluido: boolean }[] = []
            function flattenTemplate(items: { nome: string; nivel: number; children?: unknown[] }[], parentId: string | null) {
              items.forEach((item, idx) => {
                flatItems.push({ projeto_id: proj.id, parent_id: parentId, nome: item.nome, nivel: item.nivel, ordem: idx, concluido: false })
              })
            }
            flattenTemplate(tmpl.itens as { nome: string; nivel: number; children?: unknown[] }[], null)
            if (flatItems.length > 0) await supabase.from('projeto_itens').insert(flatItems)
          }
        }

      } else {
        // tipo === 'orcamento'
        let proxVersao = 1
        if (form.obra_id) {
          const { data: existentes } = await supabase.from('orcamentos').select('versao').eq('obra_id', form.obra_id).order('versao', { ascending: false }).limit(1)
          proxVersao = existentes?.[0]?.versao ? existentes[0].versao + 1 : 1
        }

        await supabase.from('orcamentos').insert({
          obra_id: form.obra_id || null,
          projeto_id: form.projeto_id || null,
          nome: form.nome.trim() || null,
          tipo: 'executivo',
          bdi_percentual: 25,
          status: 'rascunho',
          versao: proxVersao,
        })
      }

      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const showFotoAndResponsaveis = tipo !== 'orcamento'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-enter"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Novo cadastro
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
            <X size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Seletor de tipo */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Tipo</label>
            <div className="flex gap-2">
              {([
                { value: 'projeto', label: '📐 Projeto' },
                { value: 'obra', label: '🏗️ Obra' },
                { value: 'orcamento', label: '📋 Orçamento' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTipo(value)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: tipo === value ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: tipo === value ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Campos para Orçamento */}
          {tipo === 'orcamento' && (
            <div className="flex flex-col gap-3">
              <Input
                label="Nome do orçamento"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Orçamento Reforma Fachada"
              />
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Obra (opcional)</label>
                <select
                  value={form.obra_id}
                  onChange={e => setForm(f => ({ ...f, obra_id: e.target.value }))}
                  className="input-base w-full"
                >
                  <option value="">Sem obra vinculada</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Projeto (opcional)</label>
                <select
                  value={form.projeto_id}
                  onChange={e => setForm(f => ({ ...f, projeto_id: e.target.value }))}
                  className="input-base w-full"
                >
                  <option value="">Sem projeto vinculado</option>
                  {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <p className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }}>
                Vincular a uma obra ou projeto é opcional. Você pode vincular depois.
              </p>
            </div>
          )}

          {/* Campos para Projeto e Obra */}
          {tipo !== 'orcamento' && (
            <>
              {/* Foto */}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Foto</label>
                <div className="flex items-center gap-3">
                  <div
                    className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  >
                    {form.foto_url ? (
                      <img src={form.foto_url} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={20} style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <button
                      type="button"
                      onClick={() => fotoRef.current?.click()}
                      disabled={uploadingFoto}
                      className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {uploadingFoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                      {uploadingFoto ? 'Processando...' : 'Escolher foto'}
                    </button>
                    {form.foto_url && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, foto_url: '' }))}
                        className="text-xs text-left"
                        style={{ color: 'var(--danger)' }}
                      >
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>
                <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={e => handleFoto(e.target.files)} />
              </div>

              <Input
                label="Nome *"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do projeto ou obra"
              />

              {tipo === 'projeto' && (
                <Input
                  label="Cliente"
                  value={form.cliente}
                  onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                  placeholder="Nome do cliente"
                />
              )}

              <Input
                label="Endereço"
                value={form.endereco}
                onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                placeholder="Endereço"
              />

              <div className="grid grid-cols-2 gap-3">
                <Input label="Data Início" type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
                <Input label="Data Previsão" type="date" value={form.data_previsao} onChange={e => setForm(f => ({ ...f, data_previsao: e.target.value }))} />
              </div>

              {tipo === 'obra' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>UF</label>
                    <select
                      value={form.uf}
                      onChange={e => setForm(f => ({ ...f, uf: e.target.value }))}
                      className="input-base w-full"
                    >
                      {SINAPI_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                  <Input
                    label="Área (m²)"
                    type="number"
                    value={form.area_m2}
                    onChange={e => setForm(f => ({ ...f, area_m2: e.target.value }))}
                    placeholder="Ex.: 120"
                  />
                </div>
              )}

              {tipo === 'projeto' && templates.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Template (opcional)</label>
                  <select
                    value={form.template_id}
                    onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}
                    className="input-base w-full"
                  >
                    <option value="">Sem template</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
              )}

              {/* Fix #2 — Responsáveis com select estável + botão + */}
              {profiles.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Responsáveis</label>
                  <div className="flex flex-col gap-2">
                    {/* Lista dos já adicionados */}
                    {responsaveis.map(pid => (
                      <div
                        key={pid}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                      >
                        <span>👤 {getProfileLabel(pid)}</span>
                        <button
                          type="button"
                          onClick={() => removeResponsavel(pid)}
                          className="p-1 rounded hover:bg-red-500/20 transition-colors"
                          style={{ color: 'var(--danger)' }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}

                    {/* Select para adicionar novo */}
                    {profilesDisponiveis.length > 0 && (
                      <div className="flex gap-2">
                        <select
                          id="select-responsavel"
                          className="input-base flex-1"
                          defaultValue=""
                        >
                          <option value="" disabled>Selecionar responsável...</option>
                          {profilesDisponiveis.map(p => (
                            <option key={p.id} value={p.id}>{p.apelido ?? p.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const sel = document.getElementById('select-responsavel') as HTMLSelectElement
                            if (sel?.value) { addResponsavel(sel.value); sel.value = '' }
                          }}
                          className="px-3 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
                          style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button loading={saving} onClick={handleSave} className="flex-1">Criar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
