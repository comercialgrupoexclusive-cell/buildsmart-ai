'use client'

// Pesquisa Imobiliária — cadastro/edição MANUAL de comparável (sem automação
// web nesta etapa). Grava pela Action do domínio (registrar/atualizar), que
// deriva o R$/m² e nunca infere dado ausente. Reaproveita os mesmos campos do
// processo canônico (doc "Processo e Modelos de Saída", §6).
import { useState } from 'react'
import { Plus, X, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { registrarComparavelManual, atualizarComparavelManual, calcularPrecoM2, type ComparavelManualInput } from '@/lib/investidor'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import type { ProspeccaoComparavel } from '@/lib/types'

type FormState = {
  titulo: string; tipo: string; similaridade: string
  area: string; tipo_area: string
  dormitorios: string; banheiros: string; vagas: string; andar: string
  preco: string; url: string; url_confirmada: boolean
  fonte: string; data_evidencia: string; disponibilidade: string
  diferencas: string; possivel_duplicado: boolean
}

const VAZIO: FormState = {
  titulo: '', tipo: '', similaridade: '', area: '', tipo_area: '',
  dormitorios: '', banheiros: '', vagas: '', andar: '', preco: '', url: '', url_confirmada: false,
  fonte: '', data_evidencia: '', disponibilidade: '', diferencas: '', possivel_duplicado: false,
}

function daComparavel(c: ProspeccaoComparavel): FormState {
  const s = (v: unknown) => (v == null ? '' : String(v))
  return {
    titulo: s(c.titulo), tipo: s(c.tipo), similaridade: s(c.similaridade),
    area: s(c.area), tipo_area: s(c.tipo_area),
    dormitorios: s(c.dormitorios), banheiros: s(c.banheiros), vagas: s(c.vagas), andar: s(c.andar),
    preco: s(c.preco), url: s(c.url), url_confirmada: !!c.url_confirmada,
    fonte: s(c.fonte), data_evidencia: s(c.data_evidencia), disponibilidade: s(c.disponibilidade),
    diferencas: s(c.diferencas), possivel_duplicado: !!c.possivel_duplicado,
  }
}

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const inteiro = (s: string): number | null => {
  const n = num(s)
  return n == null ? null : Math.round(n)
}

export function ComparavelManualForm({ prospeccaoId, editando, onSaved, onCancelar }: {
  prospeccaoId: string
  editando: ProspeccaoComparavel | null
  onSaved: () => void
  onCancelar: () => void
}) {
  const [form, setForm] = useState<FormState>(editando ? daComparavel(editando) : VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
    setErro(null)
  }

  // R$/m² é sempre derivado (nunca digitado). Mostra em tempo real; fica "—"
  // quando preço ou área são desconhecidos.
  const precoM2 = calcularPrecoM2(num(form.preco), num(form.area))

  async function salvar() {
    if (!form.titulo.trim()) { setErro('Informe ao menos o endereço/identificação do comparável.'); return }
    setSalvando(true)
    setErro(null)
    const input: ComparavelManualInput = {
      titulo: form.titulo,
      tipo: form.tipo || null,
      area: num(form.area),
      tipo_area: (form.tipo_area || null) as ComparavelManualInput['tipo_area'],
      dormitorios: inteiro(form.dormitorios),
      banheiros: inteiro(form.banheiros),
      vagas: inteiro(form.vagas),
      andar: form.andar || null,
      preco: num(form.preco),
      url: form.url || null,
      url_confirmada: form.url_confirmada,
      fonte: form.fonte || null,
      data_evidencia: form.data_evidencia || null,
      disponibilidade: form.disponibilidade || null,
      diferencas: form.diferencas || null,
      similaridade: (form.similaridade || null) as ComparavelManualInput['similaridade'],
      possivel_duplicado: form.possivel_duplicado,
    }
    const supabase = createClient()
    try {
      if (editando) await atualizarComparavelManual(supabase, editando.id, input)
      else await registrarComparavelManual(supabase, prospeccaoId, input)
    } catch (e) {
      setSalvando(false)
      setErro(`Não foi possível salvar: ${e instanceof Error ? e.message : 'erro'}`)
      return
    }
    setSalvando(false)
    if (!editando) setForm(VAZIO)
    onSaved()
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {editando ? 'Editar comparável' : 'Adicionar comparável (manual)'}
        </h3>
        {editando && (
          <button onClick={onCancelar} className="p-1 rounded hover:bg-[var(--bg-secondary)]" title="Cancelar edição">
            <X size={15} style={{ color: 'var(--text-secondary)' }} />
          </button>
        )}
      </div>

      <Input label="Endereço / identificação *" placeholder="Rua Exemplo, 123 — apto 42" value={form.titulo} onChange={e => set('titulo', e.target.value)} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input label="Tipo" placeholder="Apartamento, sobrado…" value={form.tipo} onChange={e => set('tipo', e.target.value)} />
        <Select label="Semelhança" value={form.similaridade} onChange={e => set('similaridade', e.target.value)}>
          <option value="">—</option>
          <option value="mesmo_predio">Mesmo prédio</option>
          <option value="mesma_rua">Mesma rua</option>
          <option value="entorno">Entorno</option>
          <option value="bairro">Bairro</option>
        </Select>
        <Input label="Andar" placeholder="2º, térreo…" value={form.andar} onChange={e => set('andar', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Input label="Área (m²)" type="number" inputMode="decimal" value={form.area} onChange={e => set('area', e.target.value)} />
        <Select label="Tipo da área" value={form.tipo_area} onChange={e => set('tipo_area', e.target.value)}>
          <option value="">—</option>
          <option value="util">Útil</option>
          <option value="privativa">Privativa</option>
          <option value="construida">Construída</option>
          <option value="total">Total</option>
          <option value="outro">Outro</option>
        </Select>
        <Input label="Preço (R$)" type="number" inputMode="decimal" value={form.preco} onChange={e => set('preco', e.target.value)} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>R$/m² (derivado)</label>
          <div className="px-2 py-2 rounded-lg text-sm tabular-nums" style={{ background: 'var(--bg-secondary)', color: precoM2 == null ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
            {precoM2 == null ? '—' : `${formatCurrency(precoM2)}/m²`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Input label="Quartos" type="number" inputMode="numeric" value={form.dormitorios} onChange={e => set('dormitorios', e.target.value)} />
        <Input label="Banheiros" type="number" inputMode="numeric" value={form.banheiros} onChange={e => set('banheiros', e.target.value)} />
        <Input label="Vagas" type="number" inputMode="numeric" value={form.vagas} onChange={e => set('vagas', e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Fonte / site" placeholder="Ex.: Chaves na Mão, imobiliária…" value={form.fonte} onChange={e => set('fonte', e.target.value)} />
        <Input label="Link do anúncio" type="url" placeholder="https://…" value={form.url} onChange={e => set('url', e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Data da consulta" type="date" value={form.data_evidencia} onChange={e => set('data_evidencia', e.target.value)} />
        <Select label="Disponibilidade" value={form.disponibilidade} onChange={e => set('disponibilidade', e.target.value)}>
          <option value="">—</option>
          <option value="disponivel">Disponível</option>
          <option value="indisponivel">Indisponível</option>
        </Select>
      </div>

      <Textarea label="Observações (divergências, garagem, limitações)" rows={2} value={form.diferencas} onChange={e => set('diferencas', e.target.value)} />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={form.url_confirmada} onChange={e => set('url_confirmada', e.target.checked)} /> Link conferido
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={form.possivel_duplicado} onChange={e => set('possivel_duplicado', e.target.checked)} /> Possível duplicado
        </label>
      </div>

      {erro && <p className="text-xs" style={{ color: 'var(--danger)' }}>{erro}</p>}

      <div className="flex items-center gap-2">
        <Button onClick={salvar} loading={salvando} icon={editando ? <Save size={14} /> : <Plus size={14} />}>
          {editando ? 'Salvar comparável' : 'Adicionar comparável'}
        </Button>
        {editando && <Button variant="secondary" onClick={onCancelar} disabled={salvando}>Cancelar</Button>}
      </div>
    </div>
  )
}
