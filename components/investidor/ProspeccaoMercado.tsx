'use client'

// Skill 1 — Pesquisa e Análise de Mercado Imobiliário (Laboratório
// Investidor). Fluxo desta tela: PESQUISA DE COMPARÁVEIS → RESULTADOS
// BRUTOS → SELEÇÃO/FAVORITOS → ANÁLISE IA → ENCERRAR.
//
// Orçamento/reforma NÃO pertence a esta skill — não implementado aqui.
// "Favorito" é só um sinal do usuário ("considero interessante"); a
// qualidade técnica do comparável continua sendo responsabilidade da
// análise. faixa_conservadora/base/otimista são ESTIMATIVAS da IA, nunca
// fatos observados — exibidas com esse aviso.
import { useEffect, useState } from 'react'
import { Search, ExternalLink, Bookmark, Star, TrendingUp, AlertTriangle, FlagOff } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import type { ProspeccaoComparavel, ProspeccaoFicha, ProspeccaoAnaliseMercado } from '@/lib/types'

const SIMILARIDADE_LABEL: Record<string, string> = {
  mesmo_predio: 'Mesmo prédio',
  mesma_rua: 'Mesma rua',
  entorno: 'Entorno',
  bairro: 'Bairro',
}

type AnaliseAtual = {
  resumo: string
  faixa_conservadora?: number | null
  faixa_base?: number | null
  faixa_otimista?: number | null
  pendencias?: string | null
}

function fmt(v: number | null | undefined) {
  return v == null ? '—' : formatCurrency(v)
}

export function ProspeccaoMercado({ prospeccaoId }: { prospeccaoId: string }) {
  const { currentProfile } = useProfile()
  const [ficha, setFicha] = useState<ProspeccaoFicha | null>(null)
  const [comparaveis, setComparaveis] = useState<ProspeccaoComparavel[]>([])
  const [analisesAnteriores, setAnalisesAnteriores] = useState<ProspeccaoAnaliseMercado[]>([])
  const [loading, setLoading] = useState(true)
  const [pesquisando, setPesquisando] = useState(false)
  const [analisando, setAnalisando] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [analiseAtual, setAnaliseAtual] = useState<AnaliseAtual | null>(null)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: fichaData }, { data: compData }, { data: analisesData }] = await Promise.all([
      supabase.from('prospeccao_ficha').select('*').eq('prospeccao_id', prospeccaoId).maybeSingle(),
      supabase.from('prospeccao_comparaveis').select('*').eq('prospeccao_id', prospeccaoId).order('created_at', { ascending: false }),
      supabase.from('prospeccao_analises_mercado').select('*').eq('prospeccao_id', prospeccaoId).order('created_at', { ascending: false }),
    ])
    setFicha((fichaData as ProspeccaoFicha | null) || null)
    setComparaveis((compData ?? []) as ProspeccaoComparavel[])
    setAnalisesAnteriores((analisesData ?? []) as ProspeccaoAnaliseMercado[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [prospeccaoId])

  useEffect(() => {
    function onChanged() { void carregar() }
    window.addEventListener('buildsmart:investidor-changed', onChanged)
    return () => window.removeEventListener('buildsmart:investidor-changed', onChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospeccaoId])

  async function pesquisarComparaveis() {
    setErro(null)
    setPesquisando(true)
    try {
      const res = await fetch('/api/investidor/mercado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pesquisar_comparaveis', prospeccaoId, profileId: currentProfile?.id, actor: currentProfile?.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha na pesquisa.')
      if (data.blocked) throw new Error(data.message)
      void carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui pesquisar comparáveis agora.')
    } finally {
      setPesquisando(false)
    }
  }

  async function alternarCampo(id: string, campo: 'salvo' | 'favorito', valorAtual: boolean) {
    const supabase = createClient()
    await supabase.from('prospeccao_comparaveis').update({ [campo]: !valorAtual }).eq('id', id)
    setComparaveis(prev => prev.map(c => c.id === id ? { ...c, [campo]: !valorAtual } : c))
  }

  const selecionados = comparaveis.filter(c => c.salvo || c.favorito)

  async function analisarMercado() {
    setErro(null)
    setAnalisando(true)
    try {
      const res = await fetch('/api/investidor/mercado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analisar_mercado', prospeccaoId, profileId: currentProfile?.id, actor: currentProfile?.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha na análise.')
      if (data.blocked) throw new Error(data.message)
      if (!data.analiseMercado) throw new Error('A Luiza não retornou uma análise estruturada. Tente novamente.')
      setAnaliseAtual(data.analiseMercado as AnaliseAtual)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui analisar o mercado agora.')
    } finally {
      setAnalisando(false)
    }
  }

  async function encerrarAnalise() {
    if (!analiseAtual) return
    setEncerrando(true)
    const supabase = createClient()
    const { data: evidencias } = await supabase.from('prospeccao_evidencias').select('*').eq('prospeccao_id', prospeccaoId)
    const { error } = await supabase.from('prospeccao_analises_mercado').insert({
      prospeccao_id: prospeccaoId,
      ficha_snapshot: ficha?.dados_confirmados || {},
      evidencias_snapshot: evidencias || [],
      comparaveis_snapshot: selecionados,
      favoritos_snapshot: selecionados.filter(c => c.favorito),
      analise_texto: analiseAtual.resumo,
      faixa_conservadora: analiseAtual.faixa_conservadora ?? null,
      faixa_base: analiseAtual.faixa_base ?? null,
      faixa_otimista: analiseAtual.faixa_otimista ?? null,
      pendencias: analiseAtual.pendencias || null,
      fontes: selecionados.map(c => ({ titulo: c.titulo, url: c.url, url_confirmada: c.url_confirmada, fonte: c.fonte })),
      criado_por: currentProfile?.name || null,
    })
    setEncerrando(false)
    if (error) { setErro(`Não consegui encerrar a análise: ${error.message}`); return }
    setAnaliseAtual(null)
    void carregar()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  const precoAlvo = ficha?.dados_confirmados?.preco_anunciado != null ? Number(ficha.dados_confirmados.preco_anunciado) : null
  const areaAlvo = ficha?.dados_confirmados?.area != null ? Number(ficha.dados_confirmados.area) : null
  const precoM2Alvo = precoAlvo && areaAlvo ? precoAlvo / areaAlvo : null

  const dadosGraficoPreco = [
    ...(precoAlvo != null ? [{ nome: 'Imóvel-alvo', valor: precoAlvo, alvo: true }] : []),
    ...selecionados.filter(c => c.preco != null).map(c => ({ nome: c.titulo || c.fonte || 'Comparável', valor: c.preco as number, alvo: false })),
  ]
  const dadosGraficoM2 = [
    ...(precoM2Alvo != null ? [{ nome: 'Imóvel-alvo', valor: precoM2Alvo, alvo: true }] : []),
    ...selecionados.filter(c => c.preco_m2 != null).map(c => ({ nome: c.titulo || c.fonte || 'Comparável', valor: c.preco_m2 as number, alvo: false })),
  ]

  return (
    <div className="flex flex-col gap-4">
      {(!ficha || ficha.status === 'pendente') && (
        <div className="card p-4 flex items-center gap-2" style={{ borderLeft: '3px solid #f59e0b' }}>
          <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>A Ficha da Prospecção ainda não foi validada. Recomendado validar antes de pesquisar/analisar mercado.</p>
        </div>
      )}

      {erro && (
        <div className="card p-4 flex items-center gap-2" style={{ borderLeft: '3px solid var(--danger)' }}>
          <AlertTriangle size={15} style={{ color: 'var(--danger)' }} />
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{erro}</p>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Comparáveis</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Resultados brutos, antes de qualquer interpretação. Do mais semelhante (mesmo prédio) ao menos semelhante (bairro).</p>
          </div>
          <Button onClick={pesquisarComparaveis} loading={pesquisando} icon={<Search size={14} />} className="flex-shrink-0">Pesquisar comparáveis</Button>
        </div>
      </div>

      {comparaveis.length === 0 ? (
        <EmptyState icon={Search} title="Nenhum comparável ainda" description="Clique em 'Pesquisar comparáveis' para a Luiza buscar via web_search." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {comparaveis.map(c => (
            <div key={c.id} className="card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.titulo || c.fonte || 'Comparável'}</p>
                  {c.similaridade && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{SIMILARIDADE_LABEL[c.similaridade] || c.similaridade}</span>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => alternarCampo(c.id, 'salvo', c.salvo)} title={c.salvo ? 'Remover dos salvos' : 'Salvar'} className="p-1.5 rounded hover:bg-[var(--bg-secondary)]">
                    <Bookmark size={14} fill={c.salvo ? 'var(--accent)' : 'none'} style={{ color: c.salvo ? 'var(--accent)' : 'var(--text-secondary)' }} />
                  </button>
                  <button onClick={() => alternarCampo(c.id, 'favorito', c.favorito)} title={c.favorito ? 'Remover favorito' : 'Favoritar'} className="p-1.5 rounded hover:bg-[var(--bg-secondary)]">
                    <Star size={14} fill={c.favorito ? '#f59e0b' : 'none'} style={{ color: c.favorito ? '#f59e0b' : 'var(--text-secondary)' }} />
                  </button>
                </div>
              </div>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(c.preco)}</p>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {c.area != null ? `${c.area} m²` : '—'}{c.preco_m2 != null ? ` · ${formatCurrency(c.preco_m2)}/m²` : ''}
                {c.dormitorios != null ? ` · ${c.dormitorios} dorm.` : ''}{c.banheiros != null ? ` · ${c.banheiros} banh.` : ''}{c.vagas != null ? ` · ${c.vagas} vaga(s)` : ''}
              </p>
              {c.estado_conservacao && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.estado_conservacao}</p>}
              {c.diferencas && <p className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>{c.diferencas}</p>}
              <div className="flex items-center justify-between gap-2 mt-1">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--accent)' }}>
                    Abrir anúncio <ExternalLink size={11} />
                  </a>
                ) : <span />}
                {!c.url_confirmada && c.url && (
                  <span className="text-[10px] flex items-center gap-1" style={{ color: '#f59e0b' }}><FlagOff size={10} /> link não confirmado</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Análise de Mercado</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Usa a ficha validada, evidências e os comparáveis salvos/favoritados ({selecionados.length} selecionado{selecionados.length === 1 ? '' : 's'}).</p>
          </div>
          <Button onClick={analisarMercado} loading={analisando} disabled={selecionados.length === 0} icon={<TrendingUp size={14} />} className="flex-shrink-0">Analisar mercado</Button>
        </div>

        {analiseAtual && (
          <div className="flex flex-col gap-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Preços</p>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={dadosGraficoPreco} margin={{ top: 5, right: 10, bottom: 40, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="nome" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} angle={-30} textAnchor="end" height={60} interval={0} tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 12) + '…' : v} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="valor" radius={[3, 3, 0, 0]} maxBarSize={36}>
                        {dadosGraficoPreco.map((d, i) => <Cell key={i} fill={d.alvo ? 'var(--accent)' : '#94a3b8'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>R$/m²</p>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={dadosGraficoM2} margin={{ top: 5, right: 10, bottom: 40, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="nome" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} angle={-30} textAnchor="end" height={60} interval={0} tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 12) + '…' : v} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="valor" radius={[3, 3, 0, 0]} maxBarSize={36}>
                        {dadosGraficoM2.map((d, i) => <Cell key={i} fill={d.alvo ? 'var(--accent)' : '#94a3b8'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Faixa de mercado — ESTIMATIVA DA IA, não um fato observado</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-3 text-center" style={{ borderTop: '3px solid #94a3b8' }}>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Conservadora</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(analiseAtual.faixa_conservadora)}</p>
                </div>
                <div className="card p-3 text-center" style={{ borderTop: '3px solid var(--accent)' }}>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Base</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(analiseAtual.faixa_base)}</p>
                </div>
                <div className="card p-3 text-center" style={{ borderTop: '3px solid #10b981' }}>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Otimista</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(analiseAtual.faixa_otimista)}</p>
                </div>
              </div>
            </div>

            <div className="card p-4" style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Análise da Luiza</p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{analiseAtual.resumo}</p>
              {analiseAtual.pendencias && (
                <p className="text-xs mt-2 flex items-start gap-1.5" style={{ color: '#f59e0b' }}><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {analiseAtual.pendencias}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={encerrarAnalise} loading={encerrando}>Encerrar Análise de Mercado</Button>
            </div>
          </div>
        )}
      </div>

      {analisesAnteriores.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Análises encerradas</h3>
          <div className="flex flex-col gap-3">
            {analisesAnteriores.map(a => (
              <div key={a.id} className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{new Date(a.created_at).toLocaleString('pt-BR')}{a.criado_por ? ` · ${a.criado_por}` : ''}</p>
                  <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {fmt(a.faixa_conservadora)} — {fmt(a.faixa_base)} — {fmt(a.faixa_otimista)}
                  </p>
                </div>
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{a.analise_texto}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
