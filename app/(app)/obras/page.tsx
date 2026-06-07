'use client'

import { useEffect, useState } from 'react'
import { Plus, HardHat, MapPin, Calendar, Search, AlertTriangle, User, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra, SINAPI_UFS } from '@/lib/types'
import { formatDate, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const STATUS_FILTROS = ['todas', 'ativa', 'orcamento', 'concluida', 'paralisada']

type ObraComAvanco = Obra & { avanco: number }

// ─── Obra de exemplo (seed para o usuário explorar o sistema) ───────────────
type ItemExemplo = { descricao: string; unidade: string; quantidade: number; preco: number }
type EtapaExemplo = { nome: string; itens: ItemExemplo[] }

const OBRA_EXEMPLO_NOME = 'Casa Geminada 42m² (Exemplo)'

const OBRA_EXEMPLO: EtapaExemplo[] = [
  {
    nome: 'Serviços Preliminares',
    itens: [
      { descricao: 'Locação da obra (gabarito)', unidade: 'un', quantidade: 1, preco: 850 },
      { descricao: 'Tapumes e proteções de obra', unidade: 'm', quantidade: 40, preco: 35 },
      { descricao: 'Ligações provisórias de água e energia', unidade: 'vb', quantidade: 1, preco: 600 },
    ],
  },
  {
    nome: 'Fundações',
    itens: [
      { descricao: 'Escavação mecanizada de valas', unidade: 'm³', quantidade: 22, preco: 58 },
      { descricao: 'Lastro de brita apiloada', unidade: 'm³', quantidade: 5, preco: 175 },
      { descricao: 'Concreto magro de regularização', unidade: 'm³', quantidade: 3.5, preco: 470 },
      { descricao: 'Forma de madeira para fundação', unidade: 'm²', quantidade: 65, preco: 72 },
      { descricao: 'Armação em aço CA-50', unidade: 'kg', quantidade: 920, preco: 9.6 },
      { descricao: 'Concreto usinado fck=25MPa para baldrames', unidade: 'm³', quantidade: 14, preco: 540 },
    ],
  },
  {
    nome: 'Estrutura',
    itens: [
      { descricao: 'Pilares em concreto armado', unidade: 'm³', quantidade: 9, preco: 1450 },
      { descricao: 'Vigas em concreto armado', unidade: 'm³', quantidade: 11, preco: 1380 },
      { descricao: 'Lajes maciças de concreto armado', unidade: 'm²', quantidade: 84, preco: 195 },
      { descricao: 'Forma de madeira para estrutura', unidade: 'm²', quantidade: 240, preco: 68 },
      { descricao: 'Armação em aço CA-50 para estrutura', unidade: 'kg', quantidade: 2100, preco: 9.8 },
    ],
  },
  {
    nome: 'Alvenaria',
    itens: [
      { descricao: 'Alvenaria de vedação em bloco cerâmico 9 furos', unidade: 'm²', quantidade: 210, preco: 78 },
      { descricao: 'Vergas e contravergas pré-moldadas', unidade: 'm', quantidade: 48, preco: 32 },
      { descricao: 'Vergalhão de amarração e cintamento', unidade: 'kg', quantidade: 90, preco: 9.5 },
    ],
  },
  {
    nome: 'Cobertura',
    itens: [
      { descricao: 'Estrutura de madeira para telhado', unidade: 'm²', quantidade: 50, preco: 110 },
      { descricao: 'Telhamento em telha cerâmica', unidade: 'm²', quantidade: 50, preco: 65 },
      { descricao: 'Calhas e rufos em chapa galvanizada', unidade: 'm', quantidade: 22, preco: 48 },
    ],
  },
  {
    nome: 'Instalações Hidrossanitárias',
    itens: [
      { descricao: 'Tubulação de água fria em PVC soldável', unidade: 'm', quantidade: 80, preco: 22 },
      { descricao: 'Tubulação de esgoto em PVC série normal', unidade: 'm', quantidade: 60, preco: 28 },
      { descricao: 'Caixa d\'água em polietileno 1000L', unidade: 'un', quantidade: 1, preco: 750 },
      { descricao: 'Conjunto de louças e metais sanitários', unidade: 'cj', quantidade: 2, preco: 1450 },
    ],
  },
  {
    nome: 'Instalações Elétricas',
    itens: [
      { descricao: 'Eletrodutos, fiação e cabeamento', unidade: 'm', quantidade: 220, preco: 14 },
      { descricao: 'Quadro de distribuição de circuitos', unidade: 'un', quantidade: 1, preco: 480 },
      { descricao: 'Pontos de luz e tomadas instalados', unidade: 'pt', quantidade: 38, preco: 95 },
    ],
  },
  {
    nome: 'Esquadrias',
    itens: [
      { descricao: 'Janelas em alumínio com vidro', unidade: 'm²', quantidade: 16, preco: 480 },
      { descricao: 'Portas internas em madeira', unidade: 'un', quantidade: 8, preco: 320 },
      { descricao: 'Porta de entrada principal', unidade: 'un', quantidade: 1, preco: 850 },
    ],
  },
  {
    nome: 'Revestimentos',
    itens: [
      { descricao: 'Reboco em argamassa interno e externo', unidade: 'm²', quantidade: 380, preco: 32 },
      { descricao: 'Revestimento cerâmico de paredes (áreas molhadas)', unidade: 'm²', quantidade: 70, preco: 58 },
      { descricao: 'Piso cerâmico', unidade: 'm²', quantidade: 42, preco: 65 },
    ],
  },
  {
    nome: 'Pintura',
    itens: [
      { descricao: 'Pintura látex acrílica interna', unidade: 'm²', quantidade: 270, preco: 18 },
      { descricao: 'Pintura acrílica para fachada externa', unidade: 'm²', quantidade: 140, preco: 22 },
    ],
  },
  {
    nome: 'Serviços Complementares',
    itens: [
      { descricao: 'Limpeza final da obra', unidade: 'vb', quantidade: 1, preco: 1200 },
      { descricao: 'Calçada externa em concreto', unidade: 'm²', quantidade: 30, preco: 95 },
    ],
  },
]

export default function ObrasPage() {
  const router = useRouter()
  const supabase = createClient()
  const [obras, setObras] = useState<ObraComAvanco[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('ativa')
  const [busca, setBusca] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [gerandoExemplo, setGerandoExemplo] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    endereco: '',
    responsavel: '',
    data_inicio: '',
    data_previsao: '',
    foto_url: '',
    area_m2: '',
    uf: 'SP',
  })

  useEffect(() => { loadObras() }, [])

  async function loadObras() {
    setLoading(true)
    const { data } = await supabase.from('obras').select('*').order('created_at', { ascending: false })
    const lista = data || []

    // Avanço físico: última medição registrada de cada obra
    const comAvanco = await Promise.all(lista.map(async (obra): Promise<ObraComAvanco> => {
      const { data: meds } = await supabase
        .from('medicoes')
        .select('percentual_executado')
        .eq('obra_id', obra.id)
        .order('data_medicao', { ascending: false })
        .limit(1)
      return { ...obra, avanco: meds && meds.length > 0 ? (meds[0].percentual_executado ?? 0) : 0 }
    }))

    setObras(comAvanco)
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.nome.trim()) return
    setSaving(true)

    const { data: obra } = await supabase
      .from('obras')
      .insert({
        nome: form.nome,
        endereco: form.endereco,
        responsavel: form.responsavel || null,
        data_inicio: form.data_inicio || null,
        data_previsao: form.data_previsao || null,
        foto_url: form.foto_url || null,
        area_m2: form.area_m2 ? parseFloat(form.area_m2) : null,
        uf: form.uf,
        status: 'orcamento',
      })
      .select()
      .single()

    if (obra) {
      await supabase.from('orcamentos').insert({
        obra_id: obra.id,
        tipo: 'executivo',
        bdi_percentual: 25,
        status: 'rascunho',
        versao: 1,
      })
    }

    setSaving(false)
    setShowModal(false)
    resetForm()
    loadObras()
    if (obra) router.push(`/obras/${obra.id}`)
  }

  // ─── Gera uma obra de exemplo já populada (etapas + composições) ──────────
  // Útil para o usuário explorar o sistema sem precisar montar um orçamento do zero.
  async function handleGerarExemplo() {
    if (gerandoExemplo) return
    setGerandoExemplo(true)
    try {
      const { data: obra } = await supabase
        .from('obras')
        .insert({
          nome: OBRA_EXEMPLO_NOME,
          endereco: 'Rua das Acácias, 120, Jardim das Flores, Caxias do Sul',
          responsavel: 'Eng. Ana Beatriz Souza',
          area_m2: 42,
          uf: 'SP',
          status: 'orcamento',
        })
        .select()
        .single()
      if (!obra) return

      const { data: orc } = await supabase
        .from('orcamentos')
        .insert({ obra_id: obra.id, tipo: 'executivo', bdi_percentual: 20, status: 'rascunho', versao: 1 })
        .select()
        .single()
      if (!orc) return

      for (let gi = 0; gi < OBRA_EXEMPLO.length; gi++) {
        const grupo = OBRA_EXEMPLO[gi]
        const { data: etapa } = await supabase
          .from('etapas')
          .insert({ obra_id: obra.id, nome: grupo.nome, status: 'planejada', ordem: gi })
          .select()
          .single()
        if (!etapa) continue

        const itensInsert = grupo.itens.map((it, ii) => ({
          orcamento_id: orc.id,
          etapa_id: etapa.id,
          quantidade: it.quantidade,
          preco_unitario_snapshot: it.preco,
          descricao_snapshot: it.descricao,
          codigo_snapshot: `${String(gi + 1).padStart(2, '0')}.${String(ii + 1).padStart(3, '0')}`,
          unidade_snapshot: it.unidade,
        }))
        await supabase.from('orcamento_itens').insert(itensInsert)
      }

      await loadObras()
      router.push(`/obras/${obra.id}`)
    } finally {
      setGerandoExemplo(false)
    }
  }

  function resetForm() {
    setForm({ nome: '', endereco: '', responsavel: '', data_inicio: '', data_previsao: '', foto_url: '', area_m2: '', uf: 'SP' })
  }

  const obrasFiltradas = obras.filter(o => {
    const matchStatus = filtro === 'todas' || o.status === filtro
    const matchBusca = !busca || o.nome.toLowerCase().includes(busca.toLowerCase()) || o.endereco.toLowerCase().includes(busca.toLowerCase())
    return matchStatus && matchBusca
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTROS.map(s => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filtro === s
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
              }
            >
              {s === 'todas' ? 'Todas' : STATUS_OBRA_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar obra..."
              className="input-base input-search"
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleGerarExemplo}
            loading={gerandoExemplo}
            icon={<Sparkles size={16} />}
            title="Cria uma obra de exemplo já populada com etapas e composições para você explorar o sistema"
          >
            Gerar obra de exemplo
          </Button>
          <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>
            Nova Obra
          </Button>
        </div>
      </div>

      {/* Grid galeria */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : obrasFiltradas.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="Nenhuma obra encontrada"
          description={obras.length === 0 ? 'Comece criando sua primeira obra.' : 'Tente ajustar os filtros.'}
          action={obras.length === 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>
                Nova Obra
              </Button>
              <Button variant="secondary" onClick={handleGerarExemplo} loading={gerandoExemplo} icon={<Sparkles size={16} />}>
                Gerar obra de exemplo
              </Button>
            </div>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {obrasFiltradas.map((obra, i) => (
            <ObraCard key={obra.id} obra={obra} index={i} />
          ))}
        </div>
      )}

      {/* Modal nova obra */}
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm() }} title="Nova Obra" size="md">
        <div className="flex flex-col gap-4">
          <Input
            label="Nome da obra *"
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Residência Silva - Caxias do Sul"
          />
          <Input
            label="Endereço"
            value={form.endereco}
            onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
            placeholder="Rua, número, bairro, cidade"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Responsável técnico"
              value={form.responsavel}
              onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
              placeholder="Engenheiro responsável"
            />
            <Input
              label="Área construída (m²)"
              type="number"
              value={form.area_m2}
              onChange={e => setForm(f => ({ ...f, area_m2: e.target.value }))}
              placeholder="Ex: 120"
            />
          </div>

          {/* UF para preços SINAPI */}
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              UF da obra <span className="font-normal opacity-70">(preços SINAPI)</span>
            </label>
            <select
              value={form.uf}
              onChange={e => setForm(f => ({ ...f, uf: e.target.value }))}
              className="input-base"
            >
              {SINAPI_UFS.map(uf => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data de início"
              type="date"
              value={form.data_inicio}
              onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
            />
            <Input
              label="Previsão de conclusão"
              type="date"
              value={form.data_previsao}
              onChange={e => setForm(f => ({ ...f, data_previsao: e.target.value }))}
            />
          </div>
          <Input
            label="URL da foto (opcional)"
            value={form.foto_url}
            onChange={e => setForm(f => ({ ...f, foto_url: e.target.value }))}
            placeholder="https://..."
            hint="Link direto para imagem da obra"
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); resetForm() }}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              disabled={!form.nome.trim()}
              onClick={handleCreate}
            >
              Criar Obra
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Card galeria ────────────────────────────────────────────────────────────
function ObraCard({ obra, index }: { obra: ObraComAvanco; index: number }) {
  const statusColor: Record<string, string> = {
    ativa: '#10B981',
    orcamento: '#F59E0B',
    concluida: '#3B7BF8',
    paralisada: '#EF4444',
  }

  // Heurística: extrai "bairro" e "cidade" do final do endereço livre (ex: "Rua X, 123, Bairro Y, Cidade Z")
  const partes = (obra.endereco || '').split(',').map(p => p.trim()).filter(Boolean)
  const cidade = partes.length >= 1 ? partes[partes.length - 1] : ''
  const bairro = partes.length >= 2 ? partes[partes.length - 2] : ''
  const localidade = [cidade, obra.uf, bairro].filter(Boolean).join(' – ')

  const avancoCor = obra.avanco >= 100 ? 'var(--success)' : obra.avanco >= 50 ? 'var(--accent)' : 'var(--warning)'

  return (
    <Link
      href={`/obras/${obra.id}`}
      className="group block overflow-hidden rounded-2xl transition-transform hover:scale-[1.015] animate-enter"
      style={{
        animationDelay: `${index * 60}ms`,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}
    >
      {/* ── Foto dominante ── */}
      <div className="relative h-52 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {obra.foto_url ? (
          <img
            src={obra.foto_url}
            alt={obra.nome}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <HardHat size={48} style={{ color: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem foto</span>
          </div>
        )}

        {/* Gradiente overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

        {/* Badge status — topo direito */}
        <div className="absolute top-3 right-3">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{
              background: `${statusColor[obra.status]}22`,
              color: statusColor[obra.status],
              border: `1px solid ${statusColor[obra.status]}55`,
              backdropFilter: 'blur(8px)',
            }}
          >
            {STATUS_OBRA_LABEL[obra.status]}
          </span>
        </div>

        {/* Nome e localidade — sobre o gradiente, embaixo */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-semibold text-base leading-tight truncate text-white">
            {obra.nome}
          </h3>
          {localidade && (
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin size={11} className="flex-shrink-0 text-white/60" />
              <p className="text-xs truncate text-white/70">{localidade}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Execução: percentual + barra ── */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span style={{ color: 'var(--text-secondary)' }}>Execução</span>
          <span className="font-semibold tabular-nums" style={{ color: avancoCor }}>{obra.avanco.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, obra.avanco)}%`, background: avancoCor }}
          />
        </div>
      </div>

      {/* ── Rodapé compacto ── */}
      <div
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {obra.responsavel && (
            <div className="flex items-center gap-1.5 min-w-0">
              <User size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {obra.responsavel}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {obra.area_m2 && (
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {obra.area_m2} m²
            </span>
          )}
          {obra.data_previsao && (
            <div className="flex items-center gap-1">
              <Calendar size={11} style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {formatDate(obra.data_previsao)}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
