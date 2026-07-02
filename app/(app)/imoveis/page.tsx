'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Building2, Search, MapPin, ChevronLeft, ChevronRight, User, Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Imovel, ImovelFase, SINAPI_UFS } from '@/lib/types'
import { formatCurrency, FASE_IMOVEL_LABEL, FASE_IMOVEL_COLOR, ORIGEM_IMOVEL_LABEL, TIPO_IMOVEL_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

const FASES_KANBAN: ImovelFase[] = ['prospeccao', 'analise', 'aquisicao', 'reforma', 'venda', 'concluido']

function nextFase(fase: ImovelFase): ImovelFase | null {
  const i = FASES_KANBAN.indexOf(fase)
  return i >= 0 && i < FASES_KANBAN.length - 1 ? FASES_KANBAN[i + 1] : null
}
function prevFase(fase: ImovelFase): ImovelFase | null {
  const i = FASES_KANBAN.indexOf(fase)
  return i > 0 ? FASES_KANBAN[i - 1] : null
}

export default function ImoveisPage() {
  const router = useRouter()
  const supabase = createClient()
  const [imoveis, setImoveis] = useState<Imovel[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [showDescartados, setShowDescartados] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    titulo: '', origem: 'anuncio', link_anuncio: '', endereco: '', bairro: '', cidade: '', uf: 'SP',
    tipo_imovel: 'casa', area_m2: '', quartos: '', banheiros: '', vagas: '',
    valor_compra_estimado: '', responsavel_id: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data }, { data: profs }] = await Promise.all([
      supabase.from('imoveis').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,name').order('name'),
    ])
    setImoveis((data || []) as Imovel[])
    setUsuarios((profs || []) as { id: string; name: string }[])
    setLoading(false)
  }

  async function proximoCodigo() {
    const { count } = await supabase.from('imoveis').select('id', { count: 'exact', head: true })
    return `IM-${String((count ?? 0) + 1).padStart(4, '0')}`
  }

  async function handleCreate() {
    if (!form.titulo.trim()) return
    setSaving(true)
    const codigo = await proximoCodigo()
    const { data: imovel, error } = await supabase
      .from('imoveis')
      .insert({
        codigo,
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
        valor_compra_estimado: form.valor_compra_estimado ? parseFloat(form.valor_compra_estimado) : null,
        responsavel_id: form.responsavel_id || null,
        fase: 'prospeccao',
      })
      .select()
      .single()

    setSaving(false)
    if (error) { alert('Erro ao criar imóvel: ' + error.message); return }
    setShowModal(false)
    resetForm()
    if (imovel) router.push(`/imoveis/${imovel.id}`)
  }

  function resetForm() {
    setForm({
      titulo: '', origem: 'anuncio', link_anuncio: '', endereco: '', bairro: '', cidade: '', uf: 'SP',
      tipo_imovel: 'casa', area_m2: '', quartos: '', banheiros: '', vagas: '',
      valor_compra_estimado: '', responsavel_id: '',
    })
  }

  async function moverFase(imovel: Imovel, fase: ImovelFase) {
    setImoveis(prev => prev.map(i => i.id === imovel.id ? { ...i, fase } : i))
    const { error } = await supabase.from('imoveis').update({ fase }).eq('id', imovel.id)
    if (error) alert('Erro ao mover: ' + error.message)
  }

  const filtrados = imoveis.filter(i => {
    const matchBusca = !busca ||
      i.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      (i.endereco || '').toLowerCase().includes(busca.toLowerCase()) ||
      (i.cidade || '').toLowerCase().includes(busca.toLowerCase()) ||
      i.codigo.toLowerCase().includes(busca.toLowerCase())
    return matchBusca
  })

  const emAndamento = imoveis.filter(i => !['concluido', 'descartado'].includes(i.fase))
  const capitalEmAndamento = emAndamento.reduce((s, i) => s + (i.valor_compra_final ?? i.valor_compra_estimado ?? 0), 0)
  const concluidos = imoveis.filter(i => i.fase === 'concluido')
  const lucroTotal = concluidos.reduce((s, i) => {
    const investimento = (i.valor_compra_final ?? 0) + (i.custo_documentacao_real ?? 0) + (i.custos_aquisicao_extra ?? 0)
      + (i.orcamento_reforma ?? 0) + (i.comissao_valor ?? 0)
    return s + ((i.preco_venda_final ?? 0) - investimento)
  }, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Em andamento" value={String(emAndamento.length)} icon={Building2} />
        <KpiCard label="Capital investido (em andamento)" value={formatCurrency(capitalEmAndamento)} icon={Wallet} />
        <KpiCard label="Concluídos" value={String(concluidos.length)} icon={Building2} />
        <KpiCard label="Lucro líquido acumulado" value={formatCurrency(lucroTotal)} icon={Wallet} accent={lucroTotal >= 0} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showDescartados} onChange={e => setShowDescartados(e.target.checked)} className="w-4 h-4 rounded" />
          Mostrar descartados
        </label>

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por título, endereço, código..."
              className="input-base input-search"
            />
          </div>
          <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>
            Novo Imóvel
          </Button>
        </div>
      </div>

      {/* Kanban por fase */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhum imóvel cadastrado"
          description="Comece registrando a primeira oportunidade prospectada."
          action={<Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>Novo Imóvel</Button>}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {FASES_KANBAN.map(fase => {
            const itens = filtrados.filter(i => i.fase === fase)
            return (
              <div key={fase} className="flex-shrink-0 w-72 flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: FASE_IMOVEL_COLOR[fase] }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{FASE_IMOVEL_LABEL[fase]}</span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{itens.length}</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {itens.map(imovel => (
                    <ImovelCard key={imovel.id} imovel={imovel} onMover={moverFase} usuarios={usuarios} />
                  ))}
                  {itens.length === 0 && (
                    <div className="rounded-xl p-4 text-center text-xs" style={{ border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}>
                      Vazio
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {showDescartados && (
            <div className="flex-shrink-0 w-72 flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: FASE_IMOVEL_COLOR.descartado }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Descartados</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{filtrados.filter(i => i.fase === 'descartado').length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {filtrados.filter(i => i.fase === 'descartado').map(imovel => (
                  <ImovelCard key={imovel.id} imovel={imovel} onMover={moverFase} usuarios={usuarios} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal novo imóvel */}
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm() }} title="Novo Imóvel" size="lg">
        <div className="flex flex-col gap-4">
          <Input
            label="Título / identificação *"
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ex: Casa Bairro Nova Esperança"
          />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Origem" value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}>
              {Object.entries(ORIGEM_IMOVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select label="Tipo de imóvel" value={form.tipo_imovel} onChange={e => setForm(f => ({ ...f, tipo_imovel: e.target.value }))}>
              {Object.entries(TIPO_IMOVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <Input
            label="Link do anúncio / leilão"
            value={form.link_anuncio}
            onChange={e => setForm(f => ({ ...f, link_anuncio: e.target.value }))}
            placeholder="https://..."
          />
          <Input
            label="Endereço"
            value={form.endereco}
            onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
            placeholder="Rua, número"
          />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Bairro" value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} />
            <Input label="Cidade" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} />
            <Select label="UF" value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value }))}>
              {SINAPI_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Input label="Área (m²)" type="number" value={form.area_m2} onChange={e => setForm(f => ({ ...f, area_m2: e.target.value }))} />
            <Input label="Quartos" type="number" value={form.quartos} onChange={e => setForm(f => ({ ...f, quartos: e.target.value }))} />
            <Input label="Banheiros" type="number" value={form.banheiros} onChange={e => setForm(f => ({ ...f, banheiros: e.target.value }))} />
            <Input label="Vagas" type="number" value={form.vagas} onChange={e => setForm(f => ({ ...f, vagas: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Valor pretendido / anunciado (R$)"
              type="number"
              value={form.valor_compra_estimado}
              onChange={e => setForm(f => ({ ...f, valor_compra_estimado: e.target.value }))}
            />
            <Select label="Responsável" value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); resetForm() }}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.titulo.trim()} onClick={handleCreate}>
              Criar Imóvel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof Building2; accent?: boolean }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color: 'var(--accent)' }} />
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <p
        className="text-xl font-semibold tabular-nums"
        style={{ color: accent === false ? 'var(--danger)' : 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}

function ImovelCard({ imovel, onMover, usuarios }: { imovel: Imovel; onMover: (i: Imovel, f: ImovelFase) => void; usuarios: { id: string; name: string }[] }) {
  const responsavelNome = usuarios.find(u => u.id === imovel.responsavel_id)?.name
  const localidade = [imovel.bairro, imovel.cidade].filter(Boolean).join(', ')
  const anterior = prevFase(imovel.fase)
  const proxima = nextFase(imovel.fase)
  const valor = imovel.valor_compra_final ?? imovel.valor_compra_estimado

  return (
    <div
      className="rounded-xl p-3.5 flex flex-col gap-2 transition-transform hover:scale-[1.01]"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <Link href={`/imoveis/${imovel.id}`} className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{imovel.codigo}</span>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ORIGEM_IMOVEL_LABEL[imovel.origem]}</span>
        </div>
        <h4 className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{imovel.titulo}</h4>
        {localidade && (
          <div className="flex items-center gap-1.5">
            <MapPin size={11} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{localidade}</span>
          </div>
        )}
        {valor != null && (
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(valor)}</span>
        )}
        {responsavelNome && (
          <div className="flex items-center gap-1.5">
            <User size={11} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{responsavelNome}</span>
          </div>
        )}
      </Link>
      {imovel.fase !== 'descartado' && (
        <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            disabled={!anterior}
            onClick={() => anterior && onMover(imovel, anterior)}
            className="p-1 rounded disabled:opacity-30 hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Fase anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            disabled={!proxima}
            onClick={() => proxima && onMover(imovel, proxima)}
            className="p-1 rounded disabled:opacity-30 hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Próxima fase"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
