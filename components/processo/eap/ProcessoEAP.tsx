'use client'

// EAP de Processos — estrutura operacional navegável (referência aprovada).
// Desktop: árvore hierárquica (N níveis) à esquerda + painel de detalhes à
// direita. Mobile: linhas expansíveis (essencial + progresso), edição ao abrir.
// Numeração 1 / 1.1 / 1.1.1 é automática e recalcula ao reordenar. Alça ⠿
// (DnD do motor de orçamento) reordena dentro do mesmo nível.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Loader2, MoreVertical, Plus, Save, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  atualizarEtapa, criarEtapa, excluirEtapa, listarEtapas, reordenarEtapas,
  STATUS_EAP, type EtapaStatus, type ProcessoEtapa,
} from '@/lib/eap'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { HierarchyTree } from '@/components/ui/HierarchyTree'
import { useGuardaAlteracoes } from '@/lib/use-guarda-alteracoes'

// Campos editáveis da etapa que passam por rascunho (salvar explícito).
type Rascunho = Pick<ProcessoEtapa, 'nome' | 'descricao' | 'status' | 'progresso' | 'data_inicio' | 'data_fim'>
function rascunhoDe(e: ProcessoEtapa): Rascunho {
  return { nome: e.nome, descricao: e.descricao, status: e.status, progresso: e.progresso, data_inicio: e.data_inicio, data_fim: e.data_fim }
}

type Visao = 'arvore' | 'cascata' | 'kanban'
type Filtro = 'tudo' | EtapaStatus
type AbaDetalhe = 'subetapas' | 'tarefas' | 'documentos'

function norm(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() }
function corDe(status: EtapaStatus) { return STATUS_EAP.find(s => s.id === status)?.cor ?? 'var(--accent)' }
function datasDe(e: ProcessoEtapa) {
  if (!e.data_inicio && !e.data_fim) return '—'
  const f = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
  return `${f(e.data_inicio)} → ${f(e.data_fim)}`
}

function StatusBadge({ status }: { status: EtapaStatus }) {
  const s = STATUS_EAP.find(x => x.id === status)!
  return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${s.cor} 16%, transparent)`, color: s.cor }}>{s.label}</span>
}

function Progresso({ valor, cor }: { valor: number; cor: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-secondary)' }}>
      <div className="h-full rounded-full" style={{ width: `${valor}%`, background: cor }} />
    </div>
  )
}

export function ProcessoEAP({ processoId, mostrarNumeracao = true }: { processoId: string; mostrarNumeracao?: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [etapas, setEtapas] = useState<ProcessoEtapa[]>([])
  const [loading, setLoading] = useState(true)
  const [visao, setVisao] = useState<Visao>('arvore')
  const [filtro, setFiltro] = useState<Filtro>('tudo')
  const [busca, setBusca] = useState('')
  const [novaSub, setNovaSub] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [exp, setExp] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const lista = await listarEtapas(supabase, processoId)
    setEtapas(lista)
    setExp(new Set(lista.filter(e => !e.parent_id).map(e => e.id)))
    setLoading(false)
  }, [supabase, processoId])

  useEffect(() => { void carregar() }, [carregar])

  const ordenar = (a: ProcessoEtapa, b: ProcessoEtapa) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at)
  const filhosDe = useCallback((pid: string | null) => etapas.filter(e => (e.parent_id ?? null) === pid).sort(ordenar), [etapas])
  const selecionada = etapas.find(e => e.id === sel) || null

  const contagem = {
    tudo: etapas.length,
    em_andamento: etapas.filter(e => e.status === 'em_andamento').length,
    a_fazer: etapas.filter(e => e.status === 'a_fazer').length,
    concluido: etapas.filter(e => e.status === 'concluido').length,
    bloqueado: etapas.filter(e => e.status === 'bloqueado').length,
  }

  const buscaNorm = norm(busca)

  // Rascunho: as edições da etapa ficam locais até o usuário clicar em Salvar
  // (disquete). Nada de autosave — evita gravar mudanças acidentais (ex.: no
  // celular). Ao sair/trocar/fechar com alterações, pergunta salvar ou descartar.
  const sujo = !!(selecionada && rascunho && (
    rascunho.nome !== selecionada.nome ||
    (rascunho.descricao ?? '') !== (selecionada.descricao ?? '') ||
    rascunho.status !== selecionada.status ||
    rascunho.progresso !== selecionada.progresso ||
    (rascunho.data_inicio ?? '') !== (selecionada.data_inicio ?? '') ||
    (rascunho.data_fim ?? '') !== (selecionada.data_fim ?? '')
  ))
  useGuardaAlteracoes(sujo)

  async function salvarRascunho() {
    if (!sel || !rascunho) return
    await patch(sel, rascunho)
  }
  async function resolverPendencia(): Promise<void> {
    if (!sujo) return
    // OK = salvar; Cancelar = descartar.
    if (window.confirm('Você tem alterações não salvas. OK para salvar, Cancelar para descartar.')) await salvarRascunho()
  }

  function toggleExp(id: string) { setExp(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function selecionar(e: ProcessoEtapa) {
    if (sel && sel !== e.id) await resolverPendencia()
    setSel(e.id)
    setRascunho(rascunhoDe(e))
    if (filhosDe(e.id).length > 0) setExp(prev => new Set(prev).add(e.id))
  }
  async function fechar() {
    await resolverPendencia()
    setSel(null)
    setRascunho(null)
  }

  async function adicionar(parentId: string | null, nome: string) {
    const n = nome.trim(); if (!n) return
    const e = await criarEtapa(supabase, { processo_id: processoId, nome: n, parent_id: parentId, ordem: filhosDe(parentId).length })
    if (e) { setEtapas(prev => [...prev, e]); if (parentId) setExp(prev => new Set(prev).add(parentId)) }
  }
  async function patch(id: string, p: Partial<ProcessoEtapa>) {
    setEtapas(prev => prev.map(e => e.id === id ? { ...e, ...p } : e))
    await atualizarEtapa(supabase, id, p)
  }
  async function remover(id: string) {
    if (!window.confirm('Excluir esta etapa (e subetapas)?')) return
    await excluirEtapa(supabase, id)
    setEtapas(prev => prev.filter(e => e.id !== id && e.parent_id !== id))
    if (sel === id) setSel(null)
  }
  async function reordenar(parentId: string | null, novaOrdem: ProcessoEtapa[]) {
    const ids = novaOrdem.map(e => e.id)
    setEtapas(prev => {
      const outros = prev.filter(e => (e.parent_id ?? null) !== parentId)
      return [...outros, ...novaOrdem.map((e, i) => ({ ...e, ordem: i }))]
    })
    await reordenarEtapas(supabase, ids)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: 'var(--text-secondary)' }} /></div>

  const editor = (e: ProcessoEtapa) => (
    <EditorEtapa
      rascunho={rascunho ?? rascunhoDe(e)}
      sujo={sujo}
      onRascunho={p => setRascunho(r => ({ ...(r ?? rascunhoDe(e)), ...p }))}
      onSalvar={() => void salvarRascunho()}
      onDescartar={() => setRascunho(rascunhoDe(e))}
      subs={filhosDe(e.id)} novaSub={novaSub} setNovaSub={setNovaSub}
      onAddSub={() => { void adicionar(e.id, novaSub); setNovaSub('') }}
      onPatchSub={(id, p) => void patch(id, p)}
      onRemover={() => void remover(e.id)} onRemoverSub={id => void remover(id)} onFechar={() => void fechar()}
    />
  )

  // Conteúdo da linha (colunas) — domínio da EAP; a árvore/alça/numeração são do
  // HierarchyTree genérico.
  const conteudoLinha = (e: ProcessoEtapa, meta: { nivel: number }) => {
    const cor = corDe(e.status)
    return (
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--text-primary)', fontWeight: meta.nivel === 0 ? 600 : 400 }}>{e.nome}</span>
        <span className="hidden w-24 flex-shrink-0 sm:block"><Progresso valor={e.progresso} cor={cor} /></span>
        <span className="hidden w-10 flex-shrink-0 text-right text-[11px] tabular-nums sm:block" style={{ color: 'var(--text-secondary)' }}>{e.progresso}%</span>
        <span className="hidden w-28 flex-shrink-0 sm:block"><StatusBadge status={e.status} /></span>
        <span className="flex-shrink-0 sm:hidden"><StatusBadge status={e.status} /></span>
        <span className="hidden w-36 flex-shrink-0 text-[11px] md:block" style={{ color: 'var(--text-secondary)' }}>{datasDe(e)}</span>
      </div>
    )
  }
  const rodapeMobile = (e: ProcessoEtapa) => (
    <div className="flex items-center gap-2 px-2 pb-2">
      <span className="w-9" />
      <div className="flex-1"><Progresso valor={e.progresso} cor={corDe(e.status)} /></div>
      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{e.progresso}%</span>
      {(e.data_inicio || e.data_fim) && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{datasDe(e)}</span>}
    </div>
  )
  const acoesLinha = (e: ProcessoEtapa) => (
    <div className="relative w-7">
      <button type="button" onClick={ev => { ev.stopPropagation(); setMenu(m => m === e.id ? null : e.id) }} className="grid size-7 place-items-center rounded" style={{ color: 'var(--text-secondary)' }}><MoreVertical size={15} /></button>
      {menu === e.id && (
        <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg py-1 shadow-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={ev => ev.stopPropagation()}>
          <button type="button" onClick={() => { setMenu(null); void adicionar(e.id, 'Nova subetapa') }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-primary)' }}><Plus size={14} /> Adicionar subetapa</button>
          <button type="button" onClick={() => { setMenu(null); void remover(e.id) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-secondary)]" style={{ color: '#f87171' }}><Trash2 size={14} /> Excluir</button>
        </div>
      )}
    </div>
  )
  const cabecalhoColunas = (
    <div className="hidden items-center gap-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide sm:flex" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
      <span className="w-5" /><span className="w-5" /><span className="flex-1">Nome</span>
      <span className="w-24">Progresso</span><span className="w-10 text-right">%</span>
      <span className="w-28">Status</span><span className="hidden w-36 md:block">Início → Fim</span><span className="w-7" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>EAP de Processos</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Planeje e acompanhe todas as etapas do processo.</p>
      </div>

      {/* Busca + Nova etapa + visões */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar etapas, subetapas…" containerClassName="min-w-0 flex-1 max-w-none" />
        <div className="hidden items-center gap-1 rounded-lg p-1 sm:flex" style={{ background: 'var(--bg-secondary)' }}>
          {([['arvore', 'Árvore'], ['cascata', 'Cascata'], ['kanban', 'Kanban']] as [Visao, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setVisao(v)} className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={visao === v ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>{l}</button>
          ))}
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => void adicionar(null, 'Nova etapa')}>Etapa</Button>
      </div>

      {/* Pills de filtro com bolinha + contagem */}
      {visao === 'arvore' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {([['tudo', 'Tudo', null], ['em_andamento', 'Em andamento', 'em_andamento'], ['a_fazer', 'A fazer', 'a_fazer'], ['concluido', 'Concluídas', 'concluido']] as [Filtro, string, EtapaStatus | null][]).map(([f, l, dot]) => (
            <button key={f} type="button" onClick={() => setFiltro(f)} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={filtro === f ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {dot && <span className="size-1.5 rounded-full" style={{ background: filtro === f ? 'white' : corDe(dot) }} />}
              {l} <span className="opacity-70">{contagem[f === 'tudo' ? 'tudo' : f]}</span>
            </button>
          ))}
        </div>
      )}

      {filhosDe(null).length === 0 ? (
        <div className="card p-10 text-center" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa ainda. Crie a primeira no botão “Etapa”.</div>
      ) : visao === 'cascata' ? (
        <Cascata etapas={etapas} onAbrir={id => { const et = etapas.find(x => x.id === id); if (et) void selecionar(et) }} />
      ) : visao === 'kanban' ? (
        <Kanban topo={filhosDe(null)} filhosDe={filhosDe} onAbrir={e => void selecionar(e)} />
      ) : (
        <HierarchyTree<ProcessoEtapa>
          itens={etapas}
          idDe={e => e.id}
          parentDe={e => e.parent_id}
          ordemDe={e => e.ordem}
          selecionadoId={sel}
          expandidos={exp}
          onToggle={toggleExp}
          onSelecionar={e => void selecionar(e)}
          onReordenar={(pid, ids) => {
            const byId = new Map(etapas.map(e => [e.id, e]))
            void reordenar(pid, ids.map(id => byId.get(id)).filter((e): e is ProcessoEtapa => !!e))
          }}
          arrastar={filtro === 'tudo' && !buscaNorm}
          numerar={mostrarNumeracao}
          filtroVisivel={e => (!buscaNorm || norm(e.nome).includes(buscaNorm)) && (filtro === 'tudo' || e.status === filtro)}
          cabecalho={cabecalhoColunas}
          renderConteudo={(e, meta) => conteudoLinha(e, meta)}
          renderRodapeMobile={rodapeMobile}
          renderAcoes={acoesLinha}
          renderDetalhe={e => editor(e)}
          placeholderDetalhe="Selecione uma etapa para ver os detalhes."
        />
      )}

      {/* FAB mobile */}
      {visao === 'arvore' && (
        <button type="button" onClick={() => { void adicionar(null, 'Nova etapa') }}
          className="fixed bottom-24 right-5 z-20 grid size-12 place-items-center rounded-full shadow-lg sm:hidden"
          style={{ background: 'var(--accent)', color: 'white' }} aria-label="Nova etapa">
          <Plus size={22} />
        </button>
      )}
    </div>
  )
}

function EditorEtapa({ rascunho, sujo, onRascunho, onSalvar, onDescartar, subs, novaSub, setNovaSub, onAddSub, onPatchSub, onRemover, onRemoverSub, onFechar }: {
  rascunho: Rascunho; sujo: boolean
  onRascunho: (p: Partial<Rascunho>) => void; onSalvar: () => void; onDescartar: () => void
  subs: ProcessoEtapa[]; novaSub: string; setNovaSub: (v: string) => void
  onAddSub: () => void; onPatchSub: (id: string, p: Partial<ProcessoEtapa>) => void
  onRemover: () => void; onRemoverSub: (id: string) => void; onFechar: () => void
}) {
  const [aba, setAba] = useState<AbaDetalhe>('subetapas')
  return (
    <div className="card m-2 space-y-3 p-4 lg:m-0">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Detalhes da etapa</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSalvar} disabled={!sujo}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40"
            style={{ background: sujo ? 'var(--accent)' : 'var(--bg-secondary)', color: sujo ? 'white' : 'var(--text-secondary)' }} title="Salvar alterações">
            <Save size={14} /> Salvar
          </button>
          <button type="button" onClick={onFechar} style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
        </div>
      </div>

      {sujo && (
        <div className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs" style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)', color: 'var(--warning)' }}>
          <span>Alterações não salvas.</span>
          <button type="button" onClick={onDescartar} className="font-medium underline-offset-2 hover:underline">Descartar</button>
        </div>
      )}

      <Input label="Nome" value={rascunho.nome} onChange={e => onRascunho({ nome: e.target.value })} />
      <Textarea label="Descrição" value={rascunho.descricao ?? ''} onChange={e => onRascunho({ descricao: e.target.value })} rows={2} />

      <div className="grid grid-cols-2 gap-3">
        <Select label="Status" value={rascunho.status} onChange={e => onRascunho({ status: e.target.value as EtapaStatus })}>
          {STATUS_EAP.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <div>
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Progresso: {rascunho.progresso}%</label>
          <input type="range" min={0} max={100} value={rascunho.progresso} onChange={e => onRascunho({ progresso: Number(e.target.value) })} className="mt-3 w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Início" type="date" value={rascunho.data_inicio ?? ''} onChange={e => onRascunho({ data_inicio: e.target.value || null })} />
        <Input label="Fim" type="date" value={rascunho.data_fim ?? ''} onChange={e => onRascunho({ data_fim: e.target.value || null })} />
      </div>

      <div className="flex items-center gap-4 pt-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {([['subetapas', `Subetapas (${subs.length})`], ['tarefas', 'Tarefas'], ['documentos', 'Documentos']] as [AbaDetalhe, string][]).map(([a, l]) => (
          <button key={a} type="button" onClick={() => setAba(a)} className="pb-2 text-sm font-medium"
            style={aba === a ? { color: 'var(--accent)', borderBottom: '2px solid var(--accent)' } : { color: 'var(--text-secondary)' }}>{l}</button>
        ))}
      </div>

      {aba === 'subetapas' ? (
        <div className="space-y-2">
          {subs.map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <Input value={s.nome} onChange={e => onPatchSub(s.id, { nome: e.target.value })} className="flex-1" />
              <Select value={s.status} onChange={e => onPatchSub(s.id, { status: e.target.value as EtapaStatus })} className="w-36">
                {STATUS_EAP.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
              </Select>
              <button type="button" onClick={() => onRemoverSub(s.id)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input value={novaSub} onChange={e => setNovaSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAddSub() }} placeholder="Adicionar subetapa…" className="flex-1" />
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={onAddSub}>Add</Button>
          </div>
        </div>
      ) : (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Em breve.</p>
      )}

      <div className="flex justify-end pt-2">
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemover}>Excluir</Button>
      </div>
    </div>
  )
}

function Kanban({ topo, filhosDe, onAbrir }: { topo: ProcessoEtapa[]; filhosDe: (id: string | null) => ProcessoEtapa[]; onAbrir: (e: ProcessoEtapa) => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STATUS_EAP.map(col => {
        const cards = topo.filter(e => e.status === col.id)
        return (
          <div key={col.id} className="w-64 shrink-0 rounded-lg p-2" style={{ background: 'var(--bg-secondary)' }}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold" style={{ color: col.cor }}>{col.label}</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{cards.length}</span>
            </div>
            <div className="space-y-2">
              {cards.map(e => (
                <button key={e.id} type="button" onClick={() => onAbrir(e)} className="card w-full p-3 text-left">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.nome}</p>
                  <div className="mt-2"><Progresso valor={e.progresso} cor={col.cor} /></div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <span>{e.progresso}%</span>
                    {filhosDe(e.id).length > 0 && <span>{filhosDe(e.id).length} subetapa(s)</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Cascata({ etapas, onAbrir }: { etapas: ProcessoEtapa[]; onAbrir: (id: string) => void }) {
  const comData = etapas.filter(e => e.data_inicio && e.data_fim)
  const todas = etapas.slice().sort((a, b) => (a.data_inicio ?? '').localeCompare(b.data_inicio ?? ''))
  const min = comData.reduce<string | null>((m, e) => !m || (e.data_inicio! < m) ? e.data_inicio! : m, null)
  const max = comData.reduce<string | null>((m, e) => !m || (e.data_fim! > m) ? e.data_fim! : m, null)
  const t0 = min ? new Date(min).getTime() : 0
  const t1 = max ? new Date(max).getTime() : 0
  const span = t1 - t0

  function barra(e: ProcessoEtapa) {
    if (!e.data_inicio || !e.data_fim || span <= 0) return null
    const left = ((new Date(e.data_inicio).getTime() - t0) / span) * 100
    const width = Math.max(2, ((new Date(e.data_fim).getTime() - new Date(e.data_inicio).getTime()) / span) * 100)
    return <div className="relative h-5 w-full rounded" style={{ background: 'var(--bg-secondary)' }}>
      <div className="absolute top-0 h-5 rounded" style={{ left: `${left}%`, width: `${width}%`, background: corDe(e.status), opacity: 0.85 }} />
    </div>
  }

  return (
    <div className="card p-4">
      {min && max && (
        <div className="mb-2 flex justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          <span>{new Date(min).toLocaleDateString('pt-BR')}</span><span>{new Date(max).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
      <div className="space-y-2">
        {todas.map(e => (
          <div key={e.id} className={`grid grid-cols-[40%_60%] items-center gap-2 ${e.parent_id ? 'pl-4' : ''}`}>
            <button type="button" onClick={() => onAbrir(e.id)} className="truncate text-left text-sm" style={{ color: 'var(--text-primary)' }}>
              {e.parent_id && <ChevronRight size={12} className="mr-1 inline" style={{ color: 'var(--text-secondary)' }} />}{e.nome}
            </button>
            {barra(e) ?? <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>sem datas</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
