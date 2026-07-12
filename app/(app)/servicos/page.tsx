'use client'

import { useEffect, useState, Fragment } from 'react'
import {
  Plus, Search, Pencil, Trash2, X, Check, FileSpreadsheet,
  ChevronRight, ChevronDown, Layers, Package, Hash, Sparkles, AlertTriangle, Loader2, Database,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ComposicaoPropria, ComposicaoItem, InsumoProprio, SINAPI_UFS } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { ImportExportModal } from '@/components/ui/ImportExportModal'
import { ImportarBaseAntigaModal } from '@/components/servicos/ImportarBaseAntigaModal'
import {
  ConfigImportacao, normalizarTexto, normalizarOpcao, normalizarNumero, normalizarBooleano,
} from '@/lib/import-export-templates'
import { formatCurrency, fixMojibake } from '@/lib/utils'

const GRUPOS = [
  'GERAL', 'FUNDACAO', 'ESTRUTURA', 'ALVENARIA', 'COBERTURA',
  'REVESTIMENTO', 'PISO', 'INSTALACOES', 'ACABAMENTO', 'SERVICOS_GERAIS',
]

const CATEGORIAS_INSUMO = ['MATERIAL', 'MAO_DE_OBRA', 'EQUIPAMENTO', 'SERVICO'] as const

// ─── Configurações de importação/exportação em massa via Excel ───────────────
const CONFIG_IMPORT_COMPOSICOES: ConfigImportacao = {
  chave: 'composicoes',
  titulo: 'Composições próprias',
  nomeAba: 'Composições',
  descricaoModelo: 'Planilha com Código, Descrição, Unidade e Grupo — uma linha por composição. Os insumos de cada composição são adicionados depois, pelo botão "Itens".',
  descricaoImportacao: 'Composições com código já existente são atualizadas; as demais são criadas. A planilha deve seguir os mesmos cabeçalhos do modelo.',
  observacoes: [
    `Grupo deve ser um de: ${GRUPOS.join(', ')} (se vazio, usa GERAL).`,
    'Unidade aceita qualquer texto curto: M2, M3, UN, KG, H...',
  ],
  colunas: [
    { chave: 'codigo', rotulo: 'Código', obrigatoria: true, largura: 14, exemplo: 'COMP-001', normalizar: normalizarTexto(true, true) },
    { chave: 'descricao', rotulo: 'Descrição', obrigatoria: true, largura: 48, exemplo: 'Alvenaria de vedação em blocos cerâmicos 9x19x29', normalizar: normalizarTexto(true) },
    { chave: 'unidade', rotulo: 'Unidade', obrigatoria: true, largura: 10, exemplo: 'M2', normalizar: normalizarTexto(true, true) },
    { chave: 'grupo', rotulo: 'Grupo', obrigatoria: false, largura: 16, exemplo: 'ALVENARIA', normalizar: normalizarOpcao(GRUPOS, 'GERAL') },
  ],
  tabela: 'composicoes_proprias',
  chaveUnica: 'codigo',
}

const CONFIG_IMPORT_INSUMOS: ConfigImportacao = {
  chave: 'insumos',
  titulo: 'Insumos próprios',
  nomeAba: 'Insumos',
  descricaoModelo: 'Planilha com Código, Descrição, Unidade, Categoria, Preço unitário e Ativo — uma linha por insumo próprio (fora da base SINAPI).',
  descricaoImportacao: 'Insumos com código já existente são atualizados (inclusive o preço); os demais são criados. A planilha deve seguir os mesmos cabeçalhos do modelo.',
  observacoes: [
    `Categoria deve ser uma de: ${CATEGORIAS_INSUMO.join(', ')} (se vazia, usa MATERIAL).`,
    'Preço unitário aceita vírgula ou ponto decimal (ex.: 12,50 ou 12.50).',
    'Ativo aceita Sim/Não (se vazio, considera Sim).',
  ],
  colunas: [
    { chave: 'codigo', rotulo: 'Código', obrigatoria: true, largura: 14, exemplo: 'IP-001', normalizar: normalizarTexto(true, true) },
    { chave: 'descricao', rotulo: 'Descrição', obrigatoria: true, largura: 48, exemplo: 'Cimento CP II 50kg', normalizar: normalizarTexto(true) },
    { chave: 'unidade', rotulo: 'Unidade', obrigatoria: true, largura: 10, exemplo: 'UN', normalizar: normalizarTexto(true, true) },
    { chave: 'categoria', rotulo: 'Categoria', obrigatoria: false, largura: 16, exemplo: 'MATERIAL', normalizar: normalizarOpcao(CATEGORIAS_INSUMO, 'MATERIAL') },
    { chave: 'preco_unitario', rotulo: 'Preço unitário', obrigatoria: true, largura: 16, exemplo: 32.9, normalizar: normalizarNumero(true) },
    { chave: 'ativo', rotulo: 'Ativo', obrigatoria: false, largura: 10, exemplo: 'Sim', normalizar: normalizarBooleano(true) },
  ],
  tabela: 'insumos_proprios',
  chaveUnica: 'codigo',
}

// O schema real (`composicao_insumos`) só representa 2 origens de insumo:
// um insumo da base SINAPI (FK insumo_id) ou um insumo próprio da empresa
// (FK insumo_proprio_id). Não existem os tipos "Comp. SINAPI" / "Manual".
const TIPO_LABEL: Record<string, string> = {
  SINAPI_INSUMO: 'Insumo SINAPI',
  INSUMO_PROPRIO: 'Insumo Próprio',
}
const TIPO_COLOR: Record<string, string> = {
  SINAPI_INSUMO: 'rgba(59,123,248,0.15)',
  INSUMO_PROPRIO: 'rgba(16,185,129,0.15)',
}
const TIPO_TEXT: Record<string, string> = {
  SINAPI_INSUMO: '#3B7BF8',
  INSUMO_PROPRIO: '#10B981',
}

type SinapiInsumoLite = {
  id: string
  codigo: string
  classificacao: string
  descricao: string
  unidade: string
  precos: Record<string, number>
}

// Embed PostgREST padrão para ler itens de `composicao_insumos` — schema
// normalizado por FK (insumo_id → sinapi_insumos / insumo_proprio_id →
// insumos_proprios); descrição/unidade/preço vêm sempre do embed.
const COMPOSICAO_INSUMOS_SELECT = `
  id, composicao_id, insumo_id, insumo_proprio_id, coeficiente,
  insumo:sinapi_insumos(id,codigo,classificacao,descricao,unidade,precos),
  insumo_proprio:insumos_proprios(id,codigo,descricao,unidade,categoria,preco_unitario)
`

// Deriva a "origem" do item — única classificação possível no schema real
function tipoDoItem(it: ComposicaoItem): 'SINAPI_INSUMO' | 'INSUMO_PROPRIO' {
  return it.insumo_proprio_id ? 'INSUMO_PROPRIO' : 'SINAPI_INSUMO'
}

// Deriva os dados de exibição/custo de um item, qualquer que seja sua origem
function infoDoItem(it: ComposicaoItem, uf: string): { codigo: string; descricao: string; unidade: string; preco: number } {
  if (it.insumo_proprio) {
    return {
      codigo: it.insumo_proprio.codigo,
      descricao: it.insumo_proprio.descricao,
      unidade: it.insumo_proprio.unidade,
      preco: it.insumo_proprio.preco_unitario ?? 0,
    }
  }
  if (it.insumo) {
    return {
      codigo: it.insumo.codigo,
      descricao: it.insumo.descricao,
      unidade: it.insumo.unidade,
      preco: (it.insumo as unknown as SinapiInsumoLite).precos?.[uf] ?? 0,
    }
  }
  return { codigo: '—', descricao: '(insumo removido)', unidade: '—', preco: 0 }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ServicosPage({
  initialTab = 'composicoes',
  embedded = false,
}: {
  initialTab?: 'composicoes' | 'insumos'
  embedded?: boolean
}) {
  const supabase = createClient()
  const [aba, setAba] = useState<'composicoes' | 'insumos'>(initialTab)

  const [composicoes, setComposicoes] = useState<ComposicaoPropria[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('TODOS')

  // Importar/exportar composições em massa via planilha Excel
  const [showImportExport, setShowImportExport] = useState(false)
  const [showImportarBaseAntiga, setShowImportarBaseAntiga] = useState(false)

  // Cascata — composição expandida (revela insumos)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modal de cabeçalho (criar/editar composição)
  const [showModalHeader, setShowModalHeader] = useState(false)
  const [editando, setEditando] = useState<ComposicaoPropria | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: 'M2', grupo: 'GERAL' })

  // Modal de itens (gestão completa — buscar/adicionar/remover insumos)
  const [composicaoItens, setComposicaoItens] = useState<ComposicaoPropria | null>(null)
  const [showModalItens, setShowModalItens] = useState(false)

  useEffect(() => { loadComposicoes() }, [])

  async function loadComposicoes() {
    setLoading(true)
    const { data } = await supabase
      .from('composicoes_proprias')
      .select('*')
      .order('grupo').order('codigo')
    setComposicoes((data || []).map((c: any) => ({ ...c, descricao: fixMojibake(c.descricao) })))
    setLoading(false)
  }

  async function handleSaveHeader() {
    if (!form.codigo.trim() || !form.descricao.trim()) return
    setSaving(true)
    if (editando) {
      await supabase.from('composicoes_proprias').update({
        codigo: form.codigo, descricao: form.descricao, unidade: form.unidade, grupo: form.grupo,
      }).eq('id', editando.id)
    } else {
      await supabase.from('composicoes_proprias').insert({
        codigo: form.codigo, descricao: form.descricao, unidade: form.unidade, grupo: form.grupo, ativo: true,
      })
    }
    setSaving(false)
    setShowModalHeader(false)
    resetForm()
    loadComposicoes()
  }

  async function handleToggleAtivo(comp: ComposicaoPropria) {
    await supabase.from('composicoes_proprias').update({ ativo: !comp.ativo }).eq('id', comp.id)
    setComposicoes(prev => prev.map(c => c.id === comp.id ? { ...c, ativo: !c.ativo } : c))
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover composição? Itens de orçamento vinculados serão desvinculados.')) return
    await supabase.from('composicoes_proprias').delete().eq('id', id)
    setComposicoes(prev => prev.filter(c => c.id !== id))
  }

  function openEdit(comp: ComposicaoPropria) {
    setEditando(comp)
    setForm({ codigo: comp.codigo, descricao: comp.descricao, unidade: comp.unidade, grupo: comp.grupo })
    setShowModalHeader(true)
  }

  function openItens(comp: ComposicaoPropria, tipoInicial?: 'SINAPI_INSUMO' | 'INSUMO_PROPRIO') {
    setComposicaoItens(comp)
    setShowModalItens(true)
    setTipoInicialItens(tipoInicial || 'SINAPI_INSUMO')
  }

  function resetForm() {
    setForm({ codigo: '', descricao: '', unidade: 'M2', grupo: 'GERAL' })
    setEditando(null)
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  // Tipo de item com que o ModalItens deve abrir (permite o atalho
  // "+ Insumo próprio" pré-selecionar a aba/tipo certo no formulário)
  const [tipoInicialItens, setTipoInicialItens] = useState<'SINAPI_INSUMO' | 'INSUMO_PROPRIO'>('SINAPI_INSUMO')

  const grupos = ['TODOS', ...Array.from(new Set(composicoes.map(c => c.grupo)))]

  const filtradas = composicoes.filter(c => {
    const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const matchBusca = !busca || norm(c.descricao).includes(norm(busca)) || norm(c.codigo).includes(norm(busca))
    const matchGrupo = filtroGrupo === 'TODOS' || c.grupo === filtroGrupo
    return matchBusca && matchGrupo
  })

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <button
          onClick={() => setAba('composicoes')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={aba === 'composicoes'
            ? { background: 'var(--accent)', color: 'white' }
            : { color: 'var(--text-secondary)' }}
        >
          <Layers size={15} /> Composições
        </button>
        <button
          onClick={() => setAba('insumos')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={aba === 'insumos'
            ? { background: 'var(--accent)', color: 'white' }
            : { color: 'var(--text-secondary)' }}
        >
          <Package size={15} /> Insumos
        </button>
      </div>
      )}

      {aba === 'insumos' ? (
        <InsumosTab />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)} className="input-base w-full sm:w-56">
              {grupos.map(g => (
                <option key={g} value={g}>{g === 'TODOS' ? 'Todos os grupos' : g.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <div className="flex gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar composição..." className="input-base input-search" />
              </div>
              <Button variant="secondary" onClick={() => setShowImportExport(true)} icon={<FileSpreadsheet size={16} />}>
                Importar/Exportar
              </Button>
              <Button variant="secondary" onClick={() => setShowImportarBaseAntiga(true)} icon={<Database size={16} />}>
                Importar base antiga
              </Button>
              <Button onClick={() => { resetForm(); setShowModalHeader(true) }} icon={<Plus size={16} />}>
                Nova Composição
              </Button>
            </div>
          </div>

          {/* Tabela em cascata */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            </div>
          ) : filtradas.length === 0 ? (
            <EmptyState icon={Layers} title="Nenhuma composição cadastrada"
              description="Crie composições próprias para usar nos seus orçamentos."
              action={<Button onClick={() => { resetForm(); setShowModalHeader(true) }} icon={<Plus size={16} />}>Nova Composição</Button>}
            />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full table-zebra">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['', 'Código', 'Descrição', 'Unid.', 'Grupo', 'Itens', 'Ativo', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(comp => {
                    const expanded = expandedId === comp.id
                    return (
                      <Fragment key={comp.id}>
                        <tr
                          style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)', opacity: comp.ativo ? 1 : 0.5, cursor: 'pointer' }}
                          onClick={() => toggleExpand(comp.id)}
                        >
                          <td className="px-2 py-3 w-8">
                            <span className="flex items-center justify-center transition-transform" style={{ color: 'var(--text-secondary)' }}>
                              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {comp.codigo}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)', maxWidth: 320 }}>
                            <span className="truncate block">{comp.descricao}</span>
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{comp.unidade}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                              {comp.grupo.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={e => { e.stopPropagation(); openItens(comp) }}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
                              style={{ color: 'var(--accent)', border: '1px solid var(--accent)', opacity: 0.8 }}
                            >
                              <Layers size={11} /> Editar itens
                            </button>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleToggleAtivo(comp)} className="p-1 rounded transition-colors hover:bg-[var(--bg-secondary)]">
                              {comp.ativo
                                ? <Check size={14} style={{ color: 'var(--success)' }} />
                                : <X size={14} style={{ color: 'var(--danger)' }} />}
                            </button>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <button onClick={() => openEdit(comp)} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors">
                                <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                              </button>
                              <button onClick={() => handleDelete(comp.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                                <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <td colSpan={8} className="px-0 py-0" style={{ background: 'var(--bg-secondary)' }}>
                              <ItensCascata
                                composicaoId={comp.id}
                                onAddSinapi={() => openItens(comp, 'SINAPI_INSUMO')}
                                onAddProprio={() => openItens(comp, 'INSUMO_PROPRIO')}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal — criar/editar cabeçalho */}
          <Modal open={showModalHeader} onClose={() => { setShowModalHeader(false); resetForm() }}
            title={editando ? 'Editar composição' : 'Nova composição'} size="md">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Código *" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="Ex: CP-009" autoFocus />
                <Input label="Unidade *" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                  placeholder="M2, M3, UN, H..." />
              </div>
              <Input label="Descrição *" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Nome da composição" />
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Grupo</label>
                <select value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))} className="input-base">
                  {GRUPOS.map(g => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}
                </select>
              </div>

              {/* Atalho de insumos — visível ao editar uma composição existente */}
              {editando && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Gerenciar insumos desta composição</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setShowModalHeader(false); openItens(editando, 'SINAPI_INSUMO') }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
                      style={{ color: TIPO_TEXT.SINAPI_INSUMO, border: `1px solid ${TIPO_TEXT.SINAPI_INSUMO}50`, background: TIPO_COLOR.SINAPI_INSUMO }}
                    >
                      <Search size={12} /> Buscar na base SINAPI
                    </button>
                    <button
                      onClick={() => { setShowModalHeader(false); openItens(editando, 'INSUMO_PROPRIO') }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
                      style={{ color: TIPO_TEXT.INSUMO_PROPRIO, border: `1px solid ${TIPO_TEXT.INSUMO_PROPRIO}50`, background: TIPO_COLOR.INSUMO_PROPRIO }}
                    >
                      <Package size={12} /> Adicionar insumo próprio
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => { setShowModalHeader(false); resetForm() }}>Cancelar</Button>
                <Button className="flex-1" loading={saving} disabled={!form.codigo.trim() || !form.descricao.trim()} onClick={handleSaveHeader}>
                  {editando ? 'Salvar alterações' : 'Criar composição'}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal — itens da composição */}
          {composicaoItens && (
            <ModalItens
              composicao={composicaoItens}
              open={showModalItens}
              tipoInicial={tipoInicialItens}
              onClose={() => { setShowModalItens(false); setComposicaoItens(null) }}
              onChange={() => setExpandedId(id => id)} // força re-render da cascata aberta
            />
          )}

          {/* Modal — importar/exportar composições em massa via Excel */}
          <ImportExportModal
            open={showImportExport}
            onClose={() => setShowImportExport(false)}
            config={CONFIG_IMPORT_COMPOSICOES}
            existentes={composicoes as unknown as Record<string, unknown>[]}
            onConcluido={loadComposicoes}
          />
          <ImportarBaseAntigaModal
            open={showImportarBaseAntiga}
            onClose={() => setShowImportarBaseAntiga(false)}
            onConcluido={loadComposicoes}
          />
        </>
      )}

    </div>
  )
}

// ─── Cascata — revela os insumos de uma composição ao expandir ────────────────
function ItensCascata({
  composicaoId, onAddSinapi, onAddProprio,
}: {
  composicaoId: string
  onAddSinapi: () => void
  onAddProprio: () => void
}) {
  const supabase = createClient()
  const [itens, setItens] = useState<ComposicaoItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('composicao_insumos')
        .select(COMPOSICAO_INSUMOS_SELECT)
        .eq('composicao_id', composicaoId)
      if (active) {
        setItens((data || []) as unknown as ComposicaoItem[])
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [composicaoId])

  if (loading) {
    return (
      <div className="px-6 py-4 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <Loader2 size={14} className="animate-spin" /> Carregando insumos da composição...
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <div className="px-6 py-5 flex flex-col gap-3">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Esta composição ainda não tem insumos cadastrados.
        </p>
        <div className="flex gap-2">
          <button onClick={onAddSinapi}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: TIPO_TEXT.SINAPI_INSUMO, border: `1px solid ${TIPO_TEXT.SINAPI_INSUMO}50`, background: TIPO_COLOR.SINAPI_INSUMO }}>
            <Search size={12} /> Buscar insumo SINAPI
          </button>
          <button onClick={onAddProprio}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: TIPO_TEXT.INSUMO_PROPRIO, border: `1px solid ${TIPO_TEXT.INSUMO_PROPRIO}50`, background: TIPO_COLOR.INSUMO_PROPRIO }}>
            <Package size={12} /> Adicionar insumo próprio
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {['Tipo', 'Código', 'Insumo', 'Unid.', 'Coeficiente'].map(h => (
              <th key={h} className="text-left px-3 py-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map(it => {
            const tipo = tipoDoItem(it)
            const info = infoDoItem(it, 'SP')
            return (
              <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: TIPO_COLOR[tipo], color: TIPO_TEXT[tipo] }}>
                    {TIPO_LABEL[tipo]}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{info.codigo}</td>
                <td className="px-3 py-2 max-w-[360px]" style={{ color: 'var(--text-primary)' }}>
                  <span className="truncate block">{info.descricao}</span>
                </td>
                <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{info.unidade}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {Number(it.coeficiente).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Modal de edição de itens ─────────────────────────────────────────────────
function ModalItens({
  composicao, open, onClose, tipoInicial, onChange,
}: {
  composicao: ComposicaoPropria
  open: boolean
  onClose: () => void
  tipoInicial?: 'SINAPI_INSUMO' | 'INSUMO_PROPRIO'
  onChange?: () => void
}) {
  const supabase = createClient()

  // Itens existentes
  const [itens, setItens] = useState<ComposicaoItem[]>([])
  const [loadingItens, setLoadingItens] = useState(true)

  // UF para preview de preço
  const [ufPreview, setUfPreview] = useState('SP')

  // Busca de insumo SINAPI
  const [buscaSinapi, setBuscaSinapi] = useState('')
  const [resultsSinapi, setResultsSinapi] = useState<SinapiInsumoLite[]>([])
  const [loadingBusca, setLoadingBusca] = useState(false)
  const [insumoSelecionado, setInsumoSelecionado] = useState<SinapiInsumoLite | null>(null)

  // Busca de insumo próprio
  const [buscaProprio, setBuscaProprio] = useState('')
  const [resultsProprio, setResultsProprio] = useState<InsumoProprio[]>([])
  const [loadingBuscaProprio, setLoadingBuscaProprio] = useState(false)
  const [proprioSelecionado, setProprioSelecionado] = useState<InsumoProprio | null>(null)

  // Form novo item — o schema real só representa 2 origens possíveis
  const [tipoNovo, setTipoNovo] = useState<'SINAPI_INSUMO' | 'INSUMO_PROPRIO'>(tipoInicial || 'SINAPI_INSUMO')
  const [coefNovo, setCoefNovo] = useState('')
  const [savingItem, setSavingItem] = useState(false)

  async function loadItens() {
    setLoadingItens(true)
    const { data } = await supabase
      .from('composicao_insumos')
      .select(COMPOSICAO_INSUMOS_SELECT)
      .eq('composicao_id', composicao.id)
    setItens((data || []) as unknown as ComposicaoItem[])
    setLoadingItens(false)
  }

  async function buscaSinapiInsumos(q: string) {
    setLoadingBusca(true)
    const { data } = await supabase
      .from('sinapi_insumos')
      .select('id, codigo, classificacao, descricao, unidade, precos')
      .or(`descricao.ilike.%${q}%,codigo.ilike.%${q}%`)
      .order('codigo')
      .limit(15)
    setResultsSinapi((data || []) as SinapiInsumoLite[])
    setLoadingBusca(false)
  }

  async function buscarProprios(q: string) {
    setLoadingBuscaProprio(true)
    let query = supabase
      .from('insumos_proprios')
      .select('id, codigo, descricao, unidade, categoria, preco_unitario, ativo')
      .eq('ativo', true)
      .order('codigo')
      .limit(15)
    if (q.trim().length > 0) {
      query = query.or(`descricao.ilike.%${q}%,codigo.ilike.%${q}%`)
    }
    const { data } = await query
    setResultsProprio((data || []) as InsumoProprio[])
    setLoadingBuscaProprio(false)
  }

  useEffect(() => {
    if (!open) return
    // Disparo assíncrono evita setState síncrono no corpo do efeito (cascading renders)
    Promise.resolve().then(() => {
      loadItens()
      if (tipoInicial) {
        setTipoNovo(tipoInicial)
        if (tipoInicial === 'INSUMO_PROPRIO') buscarProprios('')
      }
    })
  }, [open, composicao.id, tipoInicial])

  // Busca debounced no SINAPI
  useEffect(() => {
    if (buscaSinapi.length < 2) {
      // Disparo assíncrono evita setState síncrono no corpo do efeito (cascading renders)
      Promise.resolve().then(() => setResultsSinapi([]))
      return
    }
    const t = setTimeout(() => buscaSinapiInsumos(buscaSinapi), 300)
    return () => clearTimeout(t)
  }, [buscaSinapi])

  function selecionarInsumo(ins: SinapiInsumoLite) {
    setInsumoSelecionado(ins)
    setBuscaSinapi('')
    setResultsSinapi([])
  }

  // Busca debounced de insumos próprios — ao trocar para esse tipo, já
  // carrega os mais recentes (lista "pré-selecionada" para escolha rápida)
  useEffect(() => {
    if (tipoNovo !== 'INSUMO_PROPRIO') return
    const t = setTimeout(() => buscarProprios(buscaProprio), 250)
    return () => clearTimeout(t)
  }, [buscaProprio, tipoNovo])

  function selecionarProprio(ip: InsumoProprio) {
    setProprioSelecionado(ip)
    setBuscaProprio('')
    setResultsProprio([])
  }

  function trocarTipo(t: typeof tipoNovo) {
    setTipoNovo(t)
    setInsumoSelecionado(null)
    setProprioSelecionado(null)
    setBuscaSinapi('')
    setBuscaProprio('')
    if (t === 'INSUMO_PROPRIO') buscarProprios('')
  }

  async function handleAddItem() {
    if (!coefNovo || parseFloat(coefNovo) <= 0) return
    if (tipoNovo === 'SINAPI_INSUMO' && !insumoSelecionado) return
    if (tipoNovo === 'INSUMO_PROPRIO' && !proprioSelecionado) return

    setSavingItem(true)
    // Schema real (`composicao_insumos`): apenas FK normalizada — o item
    // referencia OU um insumo SINAPI (insumo_id) OU um insumo próprio
    // (insumo_proprio_id), nunca os dois.
    const payload: Record<string, unknown> = {
      composicao_id: composicao.id,
      coeficiente: parseFloat(coefNovo),
      insumo_id: tipoNovo === 'SINAPI_INSUMO' ? insumoSelecionado!.id : null,
      insumo_proprio_id: tipoNovo === 'INSUMO_PROPRIO' ? proprioSelecionado!.id : null,
    }

    await supabase.from('composicao_insumos').insert(payload)
    setSavingItem(false)
    setInsumoSelecionado(null)
    setProprioSelecionado(null)
    setCoefNovo('')
    loadItens()
    onChange?.()
  }

  async function handleDeleteItem(id: string) {
    await supabase.from('composicao_insumos').delete().eq('id', id)
    setItens(prev => prev.filter(i => i.id !== id))
    onChange?.()
  }

  // Calcula custo total com base nos itens e UF selecionada
  const custoTotal = itens.reduce((acc, item) => acc + item.coeficiente * infoDoItem(item, ufPreview).preco, 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Itens — ${composicao.codigo}: ${composicao.descricao}`}
      size="xl"
    >
      <div className="flex flex-col gap-5">
        {/* Barra UF + Custo estimado */}
        <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Preview de preço por UF:</label>
            <select
              value={ufPreview}
              onChange={e => setUfPreview(e.target.value)}
              className="input-base py-1 text-xs"
              style={{ width: 'auto', paddingLeft: 8, paddingRight: 8 }}
            >
              {SINAPI_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Custo estimado ({ufPreview})</p>
            <p className="text-base font-bold" style={{ color: 'var(--accent)' }}>
              {formatCurrency(custoTotal)}<span className="text-xs font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>/{composicao.unidade}</span>
            </p>
          </div>
        </div>

        {/* Tabela de itens */}
        {loadingItens ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
            {itens.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Nenhum item. Use o formulário abaixo para adicionar insumos.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    {['Tipo', 'Código', 'Descrição', 'Unid.', 'Coeficiente', `Preço ${ufPreview}`, 'Total', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, i) => {
                    const tipo = tipoDoItem(item)
                    const info = infoDoItem(item, ufPreview)
                    const precoUF = info.preco
                    const totalItem = item.coeficiente * precoUF
                    return (
                      <tr key={item.id} style={{ borderBottom: i < itens.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: TIPO_COLOR[tipo], color: TIPO_TEXT[tipo] }}>
                            {TIPO_LABEL[tipo]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {info.codigo}
                        </td>
                        <td className="px-3 py-2 max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
                          <span className="truncate block text-xs">{info.descricao}</span>
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{info.unidade}</td>
                        <td className="px-3 py-2 text-xs tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {item.coeficiente.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: precoUF > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {precoUF > 0 ? formatCurrency(precoUF) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium" style={{ color: totalItem > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {totalItem > 0 ? formatCurrency(totalItem) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => handleDeleteItem(item.id)}
                            className="p-1 rounded hover:bg-red-500/20 transition-colors">
                            <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Formulário — adicionar item */}
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>+ Adicionar insumo / item</p>

          {/* Tipo — o schema real só representa 2 origens de insumo */}
          <div className="flex gap-2 flex-wrap">
            {(['SINAPI_INSUMO', 'INSUMO_PROPRIO'] as const).map(t => (
              <button
                key={t}
                onClick={() => trocarTipo(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={tipoNovo === t
                  ? { background: TIPO_COLOR[t], color: TIPO_TEXT[t], border: `1px solid ${TIPO_TEXT[t]}50` }
                  : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {TIPO_LABEL[t]}
              </button>
            ))}
          </div>

          {/* Busca SINAPI */}
          {tipoNovo === 'SINAPI_INSUMO' && (
            <div className="relative">
              {insumoSelecionado ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{insumoSelecionado.codigo}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{insumoSelecionado.descricao}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {insumoSelecionado.unidade}
                      {insumoSelecionado.precos[ufPreview] != null &&
                        ` · ${ufPreview}: ${formatCurrency(insumoSelecionado.precos[ufPreview])}`}
                    </p>
                  </div>
                  <button onClick={() => setInsumoSelecionado(null)} className="p-1 rounded" style={{ color: 'var(--text-secondary)' }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
                    <input
                      value={buscaSinapi}
                      onChange={e => setBuscaSinapi(e.target.value)}
                      placeholder="Buscar por código ou descrição SINAPI..."
                      className="input-base input-search text-xs"
                    />
                    {loadingBusca && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--accent)' }} />}
                  </div>
                  {resultsSinapi.length > 0 && (
                    <div className="absolute z-30 w-full mt-1 rounded-xl overflow-hidden shadow-xl"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      {resultsSinapi.map(ins => (
                        <button
                          key={ins.codigo}
                          onClick={() => selecionarInsumo(ins)}
                          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <Hash size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{ins.codigo}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{ins.descricao}</p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {ins.unidade}
                              {ins.precos[ufPreview] != null && ` · ${ufPreview}: ${formatCurrency(ins.precos[ufPreview])}`}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {buscaSinapi.length >= 2 && resultsSinapi.length === 0 && !loadingBusca && (
                    <div className="absolute z-30 w-full mt-1 rounded-xl px-3 py-3 text-xs text-center shadow-xl"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      <AlertTriangle size={12} className="inline mr-1" />
                      Nenhum insumo encontrado — importe o SINAPI em Referência SINAPI.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Busca / seleção de insumo próprio */}
          {tipoNovo === 'INSUMO_PROPRIO' && (
            <div className="relative">
              {proprioSelecionado ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: `1px solid ${TIPO_TEXT.INSUMO_PROPRIO}` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono" style={{ color: TIPO_TEXT.INSUMO_PROPRIO }}>{proprioSelecionado.codigo}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{proprioSelecionado.descricao}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {proprioSelecionado.unidade} · {formatCurrency(proprioSelecionado.preco_unitario)}
                    </p>
                  </div>
                  <button onClick={() => setProprioSelecionado(null)} className="p-1 rounded" style={{ color: 'var(--text-secondary)' }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
                    <input
                      value={buscaProprio}
                      onChange={e => setBuscaProprio(e.target.value)}
                      placeholder="Buscar insumo próprio por código ou descrição..."
                      className="input-base input-search text-xs"
                    />
                    {loadingBuscaProprio && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--accent)' }} />}
                  </div>
                  {resultsProprio.length > 0 && (
                    <div className="relative z-30 w-full mt-1 rounded-xl overflow-hidden shadow-xl max-h-64 overflow-y-auto"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      {resultsProprio.map(ip => (
                        <button
                          key={ip.id}
                          onClick={() => selecionarProprio(ip)}
                          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <Package size={12} className="flex-shrink-0 mt-0.5" style={{ color: TIPO_TEXT.INSUMO_PROPRIO }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono" style={{ color: TIPO_TEXT.INSUMO_PROPRIO }}>{ip.codigo}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{ip.descricao}</p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {ip.unidade} · {formatCurrency(ip.preco_unitario)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {!loadingBuscaProprio && resultsProprio.length === 0 && (
                    <div className="relative z-10 w-full mt-1 rounded-xl px-3 py-3 text-xs text-center"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      <AlertTriangle size={12} className="inline mr-1" />
                      Nenhum insumo próprio cadastrado ainda — crie em Composições → aba Insumos.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Coeficiente + Adicionar */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Coeficiente <span className="opacity-60">(qtd por unidade da composição)</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={coefNovo}
                onChange={e => setCoefNovo(e.target.value)}
                placeholder="Ex: 1.5"
                className="input-base text-xs"
              />
            </div>
            <Button
              onClick={handleAddItem}
              loading={savingItem}
              disabled={
                !coefNovo || parseFloat(coefNovo) <= 0 ||
                (tipoNovo === 'SINAPI_INSUMO' && !insumoSelecionado) ||
                (tipoNovo === 'INSUMO_PROPRIO' && !proprioSelecionado)
              }
              icon={<Plus size={14} />}
            >
              Adicionar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Célula editável (clique para editar diretamente na tabela) ──────────────
function EditableCell({
  value, onSave, type = 'text', placeholder, mono = false,
}: {
  value: string | number
  onSave: (v: string | number) => void
  type?: 'text' | 'number'
  placeholder?: string
  mono?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value ?? ''))

  useEffect(() => {
    if (editing) return
    // Disparo assíncrono evita setState síncrono no corpo do efeito (cascading renders)
    Promise.resolve().then(() => setVal(String(value ?? '')))
  }, [value, editing])

  function commit() {
    setEditing(false)
    const parsed: string | number = type === 'number' ? (parseFloat(val.replace(',', '.')) || 0) : val.trim()
    if (parsed !== value) onSave(parsed)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type === 'number' ? 'number' : 'text'}
        step={type === 'number' ? '0.01' : undefined}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setVal(String(value ?? '')); setEditing(false) }
        }}
        placeholder={placeholder}
        className="input-base text-xs py-1 px-2"
        style={{ minWidth: 80 }}
        onClick={e => e.stopPropagation()}
      />
    )
  }
  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      className="cursor-text inline-block px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
      style={{ color: 'var(--text-primary)', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined, minHeight: 20 }}
      title="Clique para editar"
    >
      {value === '' || value == null ? <span style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{placeholder || '—'}</span> : value}
    </span>
  )
}

// ─── Aba Insumos — cadastro de insumos próprios da empresa ───────────────────
function InsumosTab() {
  const supabase = createClient()
  const [insumos, setInsumos] = useState<InsumoProprio[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNovoInsumo, setShowNovoInsumo] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [showImportarBaseAntiga, setShowImportarBaseAntiga] = useState(false)
  const [novoInsumo, setNovoInsumo] = useState({
    codigo: '',
    descricao: '',
    unidade: 'UN',
    categoria: 'MATERIAL' as InsumoProprio['categoria'],
    preco_unitario: '',
    ativo: true,
  })

  async function loadInsumos() {
    setLoading(true)
    const { data } = await supabase
      .from('insumos_proprios')
      .select('*')
      .order('codigo')
    setInsumos((data || []).map((i: any) => ({ ...i, descricao: fixMojibake(i.descricao) })) as InsumoProprio[])
    setLoading(false)
  }

  useEffect(() => {
    // Disparo assíncrono evita setState síncrono no corpo do efeito (cascading renders)
    Promise.resolve().then(() => loadInsumos())
  }, [])

  // Gera o próximo código sequencial no formato IP-001, IP-002...
  function proximoCodigo(): string {
    let max = 0
    for (const ip of insumos) {
      const m = ip.codigo.match(/(\d+)\s*$/)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `IP-${String(max + 1).padStart(3, '0')}`
  }

  function abrirNovoInsumo() {
    setNovoInsumo({
      codigo: proximoCodigo(),
      descricao: '',
      unidade: 'UN',
      categoria: 'MATERIAL',
      preco_unitario: '',
      ativo: true,
    })
    setShowNovoInsumo(true)
  }

  async function handleNovo() {
    if (!novoInsumo.codigo.trim() || !novoInsumo.descricao.trim() || !novoInsumo.unidade.trim()) return
    setCreating(true)
    const preco = Number(novoInsumo.preco_unitario.replace(',', '.')) || 0
    const { data, error } = await supabase
      .from('insumos_proprios')
      .insert({
        codigo: novoInsumo.codigo.trim().toUpperCase(),
        descricao: novoInsumo.descricao.trim(),
        unidade: novoInsumo.unidade.trim().toUpperCase(),
        categoria: novoInsumo.categoria,
        preco_unitario: preco,
        ativo: novoInsumo.ativo,
      })
      .select()
      .single()
    setCreating(false)
    if (!error && data) {
      setInsumos(prev => [...prev, data as InsumoProprio].sort((a, b) => a.codigo.localeCompare(b.codigo)))
      setShowNovoInsumo(false)
    } else if (error?.code === 'PGRST205') {
      alert('A tabela "insumos_proprios" ainda não existe no banco. Rode a migração supabase/migration_insumos_proprios.sql no SQL Editor do Supabase.')
    } else if (error?.code === '42501') {
      alert('O Supabase bloqueou a inserção por política RLS. Rode o arquivo supabase/fix_2026_06_07_insumos_orcamento.sql no SQL Editor do Supabase.')
    } else if (error) {
      alert(`Não foi possível inserir o insumo: ${error.message}`)
    }
  }

  async function handleUpdate(id: string, field: keyof InsumoProprio, value: string | number | boolean) {
    setInsumos(prev => prev.map(i => i.id === id ? { ...i, [field]: value } as InsumoProprio : i))
    await supabase.from('insumos_proprios').update({ [field]: value }).eq('id', id)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este insumo próprio? Itens de composição vinculados ficarão sem referência de preço.')) return
    await supabase.from('insumos_proprios').delete().eq('id', id)
    setInsumos(prev => prev.filter(i => i.id !== id))
  }

  const filtrados = insumos.filter(i => {
    const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return !busca || norm(i.descricao).includes(norm(busca)) || norm(i.codigo).includes(norm(busca))
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Insumos próprios da empresa</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Materiais, mão de obra, equipamentos ou serviços fora da base SINAPI. Edite direto nas células.
          </p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar insumo..." className="input-base input-search" />
          </div>
          <Button variant="secondary" onClick={() => setShowImportExport(true)} icon={<FileSpreadsheet size={16} />}>
            Importar/Exportar
          </Button>
          <Button variant="secondary" onClick={() => setShowImportarBaseAntiga(true)} icon={<Database size={16} />}>
            Importar base antiga
          </Button>
          <Button onClick={abrirNovoInsumo} icon={<Sparkles size={16} />}>
            Novo insumo
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum insumo próprio cadastrado"
          description='Clique em "Novo insumo" para abrir o formulário de cadastro.'
          action={<Button onClick={abrirNovoInsumo} icon={<Sparkles size={16} />}>Novo insumo</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full table-zebra">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Código', 'Descrição', 'Unid.', 'Categoria', 'Preço unitário', 'Ativo', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(ip => (
                <tr key={ip.id} style={{ borderBottom: '1px solid var(--border)', opacity: ip.ativo ? 1 : 0.5 }}>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--accent)' }}>
                    <span className="font-mono px-1.5 py-0.5 rounded" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      <Hash size={10} className="inline mr-0.5 -mt-0.5" />{ip.codigo}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm" style={{ maxWidth: 360 }}>
                    <EditableCell value={ip.descricao} onSave={v => handleUpdate(ip.id, 'descricao', v)} placeholder="Descrição" />
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <EditableCell value={ip.unidade} onSave={v => handleUpdate(ip.id, 'unidade', String(v).toUpperCase())} placeholder="UN" />
                  </td>
                  <td className="px-4 py-2 text-sm" onClick={e => e.stopPropagation()}>
                    <select
                      value={ip.categoria}
                      onChange={e => handleUpdate(ip.id, 'categoria', e.target.value)}
                      className="text-xs rounded-lg px-2 py-1"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                      {CATEGORIAS_INSUMO.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-1">
                      <span style={{ color: 'var(--text-secondary)' }} className="text-xs">R$</span>
                      <EditableCell
                        value={ip.preco_unitario}
                        type="number"
                        onSave={v => handleUpdate(ip.id, 'preco_unitario', Number(v))}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleUpdate(ip.id, 'ativo', !ip.ativo)} className="p-1 rounded transition-colors hover:bg-[var(--bg-secondary)]">
                      {ip.ativo
                        ? <Check size={14} style={{ color: 'var(--success)' }} />
                        : <X size={14} style={{ color: 'var(--danger)' }} />}
                    </button>
                  </td>
                  <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleDelete(ip.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                      <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showNovoInsumo}
        onClose={() => !creating && setShowNovoInsumo(false)}
        title="Novo insumo"
        size="md"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={e => {
            e.preventDefault()
            handleNovo()
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Código"
              value={novoInsumo.codigo}
              onChange={e => setNovoInsumo(prev => ({ ...prev, codigo: e.target.value }))}
              placeholder="IP-001"
              autoFocus
            />
            <Input
              label="Unidade"
              value={novoInsumo.unidade}
              onChange={e => setNovoInsumo(prev => ({ ...prev, unidade: e.target.value }))}
              placeholder="UN, M2, M3, H..."
            />
          </div>

          <Input
            label="Descrição"
            value={novoInsumo.descricao}
            onChange={e => setNovoInsumo(prev => ({ ...prev, descricao: e.target.value }))}
            placeholder="Ex: Cimento CP II 50 kg"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Categoria</label>
              <select
                value={novoInsumo.categoria}
                onChange={e => setNovoInsumo(prev => ({ ...prev, categoria: e.target.value as InsumoProprio['categoria'] }))}
                className="input-base"
              >
                {CATEGORIAS_INSUMO.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <Input
              label="Preço unitário"
              type="number"
              step="0.01"
              min="0"
              value={novoInsumo.preco_unitario}
              onChange={e => setNovoInsumo(prev => ({ ...prev, preco_unitario: e.target.value }))}
              placeholder="0,00"
            />
          </div>

          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={novoInsumo.ativo}
              onChange={e => setNovoInsumo(prev => ({ ...prev, ativo: e.target.checked }))}
            />
            Insumo ativo
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowNovoInsumo(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={creating}
              disabled={!novoInsumo.codigo.trim() || !novoInsumo.descricao.trim() || !novoInsumo.unidade.trim()}
            >
              Inserir insumo
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal — importar/exportar insumos próprios em massa via Excel */}
      <ImportExportModal
        open={showImportExport}
        onClose={() => setShowImportExport(false)}
        config={CONFIG_IMPORT_INSUMOS}
        existentes={insumos as unknown as Record<string, unknown>[]}
        onConcluido={loadInsumos}
      />
      <ImportarBaseAntigaModal
        open={showImportarBaseAntiga}
        onClose={() => setShowImportarBaseAntiga(false)}
        onConcluido={loadInsumos}
      />
    </div>
  )
}
