'use client'

// Laboratório Investidor — hub com as 3 abas (Prospecções | Ativos |
// Comparador). Prospecções (Marco 2) e Ativos (Marco 4) têm funcionalidade
// real; Comparador segue navegação/placeholder (Marco 5, não antecipado).
// Ver RELATORIO_INVESTIDOR_RODADA_02.md e RELATORIO_INVESTIDOR_RODADA_04.md.
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Landmark, Columns3, Calendar, MapPin, ImagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import type { Prospeccao, ProspeccaoFase, ProspeccaoCenario } from '@/lib/types'

type ProspeccaoComPrincipal = Prospeccao & { prospeccao_cenarios?: ProspeccaoCenario[] }

// Ativo = Project com contexto='investimento' (Marco 4). Tipo mínimo local
// — a tela real de detalhe é a própria /projetos/[id], não uma tela nova.
type AtivoProjeto = {
  id: string
  nome: string
  endereco: string | null
  foto_url: string | null
  fase_ciclo: 'projeto' | 'em_obra' | 'entregue'
  created_at: string
}

const FASE_ATIVO_LABEL: Record<AtivoProjeto['fase_ciclo'], { label: string; color: string }> = {
  projeto: { label: 'Adquirido', color: '#8b5cf6' },
  em_obra: { label: 'Em reforma', color: 'var(--accent)' },
  entregue: { label: 'Pronto', color: '#10b981' },
}

const FASE_META: Record<ProspeccaoFase, { label: string; color: string }> = {
  nova: { label: 'Nova', color: '#64748b' },
  em_analise: { label: 'Em análise', color: 'var(--accent)' },
  aprovada: { label: 'Aprovada', color: '#10b981' },
  em_disputa: { label: 'Em disputa', color: '#f59e0b' },
  adquirida: { label: 'Adquirida', color: '#8b5cf6' },
  descartada: { label: 'Descartada', color: '#ef4444' },
  nao_adquirida: { label: 'Não adquirida', color: '#94a3b8' },
}

const FASES_ORDEM: ProspeccaoFase[] = ['nova', 'em_analise', 'aprovada', 'em_disputa', 'adquirida', 'descartada', 'nao_adquirida']

const EMPTY_FORM = { nome: '', endereco: '', link_leilao: '', data_leilao: '' }

export default function InvestidorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') as 'prospeccoes' | 'ativos' | 'comparador') ?? 'prospeccoes'

  function setTab(next: string) {
    router.push(`/investidor?tab=${next}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Landmark size={22} style={{ color: 'var(--accent)' }} /> Investidor
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Laboratório de investimento imobiliário — leilão, análise e aquisição.
          </p>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {[
          { id: 'prospeccoes', label: 'Prospecções' },
          { id: 'ativos', label: 'Ativos' },
          { id: 'comparador', label: 'Comparador' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
            style={tab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'prospeccoes' && <ProspeccoesTab />}
      {tab === 'ativos' && <AtivosTab />}
      {tab === 'comparador' && (
        <EmptyState
          icon={Columns3}
          title="Comparador"
          description="Compare 2 ou mais Prospecções lado a lado (avaliação, investimento, lucro, rentabilidade, prazo). Chega no Marco 5."
        />
      )}
    </div>
  )
}

function ProspeccoesTab() {
  const { isCliente } = usePermission()
  const [prospeccoes, setProspeccoes] = useState<ProspeccaoComPrincipal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [faseFilter, setFaseFilter] = useState<'todas' | ProspeccaoFase>('todas')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('prospeccoes')
      .select('*, prospeccao_cenarios(id,nome,principal,valor_arrematacao,lucro,rentabilidade)')
      .order('created_at', { ascending: false })
    setProspeccoes((data ?? []) as ProspeccaoComPrincipal[])
    setLoading(false)
  }

  const filtered = prospeccoes.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.endereco ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesFase = faseFilter === 'todas' || p.fase === faseFilter
    return matchesSearch && matchesFase
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative max-w-sm w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Buscar por nome ou endereço..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFaseFilter('todas')}
              className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-colors"
              style={faseFilter === 'todas'
                ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }
                : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            >
              Todas
            </button>
            {FASES_ORDEM.map(f => (
              <button
                key={f}
                onClick={() => setFaseFilter(f)}
                className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-colors"
                style={faseFilter === f
                  ? { background: FASE_META[f].color, color: 'white', borderColor: FASE_META[f].color }
                  : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                {FASE_META[f].label}
              </button>
            ))}
          </div>
        </div>
        {!isCliente && (
          <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />} className="flex-shrink-0">
            Nova prospecção
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma prospecção encontrada"
          description={search || faseFilter !== 'todas' ? 'Tente outro termo ou filtro.' : 'Cadastre a primeira oportunidade de leilão para começar.'}
          action={!isCliente && !search && faseFilter === 'todas'
            ? <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>Nova prospecção</Button>
            : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p, i) => <ProspeccaoCard key={p.id} prospeccao={p} index={i} />)}
        </div>
      )}

      <NovaProspeccaoModal open={showModal} onClose={() => setShowModal(false)} onCreated={load} />
    </div>
  )
}

function ProspeccaoCard({ prospeccao: p, index }: { prospeccao: ProspeccaoComPrincipal; index: number }) {
  const meta = FASE_META[p.fase]
  const principal = p.prospeccao_cenarios?.find(c => c.principal)
  const temResultado = principal && (principal.lucro != null || principal.rentabilidade != null)

  return (
    <Link
      href={`/investidor/${p.id}`}
      className="group block overflow-hidden rounded-2xl transition-transform hover:scale-[1.015] animate-enter"
      style={{
        animationDelay: `${index * 60}ms`,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}
    >
      <div className="relative h-44 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {p.foto_url ? (
          <img src={p.foto_url} alt={p.nome} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Landmark size={40} style={{ color: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem foto</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute top-3 right-3">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55`, backdropFilter: 'blur(8px)' }}
          >
            {meta.label}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-semibold text-base leading-tight truncate text-white">{p.nome}</h3>
          {p.endereco && (
            <p className="text-xs truncate mt-1 text-white/70 flex items-center gap-1">
              <MapPin size={11} /> {p.endereco}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Calendar size={11} />
            {p.data_leilao ? new Date(p.data_leilao + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data de leilão'}
          </span>
          {principal?.valor_arrematacao != null && (
            <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(principal.valor_arrematacao)}
            </span>
          )}
        </div>

        {temResultado && (
          <div className="flex items-center justify-between text-xs pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            {principal!.lucro != null && (
              <span style={{ color: principal!.lucro >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                Lucro: {formatCurrency(principal!.lucro)}
              </span>
            )}
            {principal!.rentabilidade != null && (
              <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                {principal!.rentabilidade.toFixed(1)}%
              </span>
            )}
          </div>
        )}

        {p.proxima_acao && (
          <p className="text-xs truncate pt-1" style={{ color: 'var(--text-secondary)', borderTop: temResultado ? 'none' : '1px solid var(--border)' }}>
            Próxima ação: {p.proxima_acao}
          </p>
        )}
      </div>
    </Link>
  )
}

function AtivosTab() {
  const [ativos, setAtivos] = useState<AtivoProjeto[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('projetos')
      .select('id, nome, endereco, foto_url, fase_ciclo, created_at')
      .eq('contexto', 'investimento')
      .order('created_at', { ascending: false })
    setAtivos((data ?? []) as AtivoProjeto[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (ativos.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Nenhum ativo ainda"
        description="Quando uma Prospecção for adquirida e convertida, ela aparece aqui — reaproveitando Estrutura, Orçamento, Cronograma, Board e Arquivos do Projeto."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {ativos.map((a, i) => <AtivoCard key={a.id} ativo={a} index={i} />)}
    </div>
  )
}

function AtivoCard({ ativo: a, index }: { ativo: AtivoProjeto; index: number }) {
  const meta = FASE_ATIVO_LABEL[a.fase_ciclo]
  return (
    <Link
      href={`/projetos/${a.id}`}
      className="group block overflow-hidden rounded-2xl transition-transform hover:scale-[1.015] animate-enter"
      style={{
        animationDelay: `${index * 60}ms`,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}
    >
      <div className="relative h-44 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {a.foto_url ? (
          <img src={a.foto_url} alt={a.nome} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Landmark size={40} style={{ color: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem foto</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute top-3 right-3">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55`, backdropFilter: 'blur(8px)' }}
          >
            {meta.label}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-semibold text-base leading-tight truncate text-white">{a.nome}</h3>
          {a.endereco && (
            <p className="text-xs truncate mt-1 text-white/70 flex items-center gap-1">
              <MapPin size={11} /> {a.endereco}
            </p>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Abrir Projeto do Ativo →</p>
      </div>
    </Link>
  )
}

function NovaProspeccaoModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function fecharEResetar() {
    setForm(EMPTY_FORM)
    setFotoFile(null)
    setFotoPreview(null)
    onClose()
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    const supabase = createClient()

    let foto_url: string | null = null
    if (fotoFile) {
      try {
        const ext = fotoFile.name.split('.').pop() || 'jpg'
        const path = `prospeccoes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage.from('project-files').upload(path, fotoFile)
        foto_url = upErr ? null : supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
      } catch {
        foto_url = null
      }
    }

    const { error } = await supabase.from('prospeccoes').insert({
      nome: form.nome.trim(),
      endereco: form.endereco.trim() || null,
      link_leilao: form.link_leilao.trim() || null,
      data_leilao: form.data_leilao || null,
      foto_url,
    })
    setSaving(false)
    if (!error) {
      onCreated()
      fecharEResetar()
    } else {
      alert(`Não foi possível criar a prospecção: ${error.message}`)
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && fecharEResetar()} title="Nova prospecção" size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {fotoPreview ? (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border" style={{ borderColor: 'var(--border)' }}>
              <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover" />
              <button
                onClick={() => { setFotoFile(null); setFotoPreview(null) }}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white"
                style={{ background: 'rgba(0,0,0,0.6)' }}
              >✕</button>
            </div>
          ) : (
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <ImagePlus size={16} />
              <span className="text-sm">Foto (opcional)</span>
              <input
                type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) { setFotoFile(file); setFotoPreview(URL.createObjectURL(file)) }
                }}
              />
            </label>
          )}
        </div>

        <Input
          label="Nome / apelido *"
          placeholder="Ex: Apto Vila Nova - lote 12"
          value={form.nome}
          onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
          autoFocus
        />
        <Input
          label="Endereço"
          placeholder="Rua, bairro, cidade..."
          value={form.endereco}
          onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
        />
        <Input
          label="Link do leilão/anúncio"
          type="url"
          placeholder="https://..."
          value={form.link_leilao}
          onChange={e => setForm(f => ({ ...f, link_leilao: e.target.value }))}
        />
        <Input
          label="Data do leilão"
          type="date"
          value={form.data_leilao}
          onChange={e => setForm(f => ({ ...f, data_leilao: e.target.value }))}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={fecharEResetar} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.nome.trim()}>
            Criar prospecção
          </Button>
        </div>
      </div>
    </Modal>
  )
}
