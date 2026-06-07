'use client'

import { useState, useCallback, useEffect, Fragment } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, Database, FileSpreadsheet, CheckCircle2,
  AlertTriangle, Loader2, BarChart3, Hash, Layers, Search, X,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SINAPI_UFS, getPrecoInsumo, SinapiComposicaoItem, SinapiInsumo } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

// ─── Tipos internos de parse ──────────────────────────────────────────────────
type InsumoRaw = {
  codigo: string
  classificacao: string
  descricao: string
  unidade: string
  origem_preco: string
  precos: Record<string, number>
}

type ComposicaoItemRaw = {
  tipo: 'INSUMO' | 'COMPOSICAO'
  item_codigo: string
  item_descricao: string
  item_unidade: string
  coeficiente: number
  situacao: string
}

type ComposicaoRaw = {
  codigo: string
  grupo: string
  descricao: string
  unidade: string
  situacao: string
  itens: ComposicaoItemRaw[]
}

type ImportResult = {
  total: number
  imported: number
  errors: string[]
}

// ─── Parser ISE ───────────────────────────────────────────────────────────────
function parseISE(wb: XLSX.WorkBook): { insumos: InsumoRaw[]; mesReferencia: string } {
  const ws = wb.Sheets['ISE']
  if (!ws) throw new Error('Aba "ISE" não encontrada. Verifique se é um arquivo SINAPI válido.')

  const data = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1, raw: false, defval: '',
  }) as string[][]

  // Detectar linha do cabeçalho (contém "Código do")
  const headerRowIdx = data.findIndex(row =>
    row.some(cell => typeof cell === 'string' && cell.includes('digo do'))
  )
  if (headerRowIdx === -1) throw new Error('Cabeçalho da aba ISE não encontrado.')

  const headerRow = data[headerRowIdx]

  // Mapear UF → índice de coluna
  const ufColMap: Record<string, number> = {}
  ;(SINAPI_UFS as readonly string[]).forEach(uf => {
    const idx = headerRow.findIndex(h => h?.trim() === uf)
    if (idx !== -1) ufColMap[uf] = idx
  })

  if (Object.keys(ufColMap).length === 0) {
    throw new Error('Nenhuma coluna de UF encontrada na aba ISE.')
  }

  // Detectar mês de referência
  let mesReferencia = ''
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i]
    const idx = row.findIndex(c => typeof c === 'string' && c.includes('s de Refer'))
    if (idx !== -1) {
      mesReferencia = (row[idx + 1] || '').trim()
      break
    }
  }

  const insumos: InsumoRaw[] = []

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i]
    const codigo = (row[1] || '').trim()
    if (!codigo) continue

    const precos: Record<string, number> = {}
    Object.entries(ufColMap).forEach(([uf, colIdx]) => {
      const raw = (row[colIdx] || '').toString().replace(',', '.').trim()
      const v = parseFloat(raw)
      if (!isNaN(v) && v > 0) precos[uf] = v
    })

    insumos.push({
      codigo,
      classificacao: (row[0] || '').trim() || 'MATERIAL',
      descricao: (row[2] || '').trim(),
      unidade: (row[3] || '').trim(),
      origem_preco: (row[4] || '').trim(),
      precos,
    })
  }

  return { insumos, mesReferencia }
}

// ─── Parser Analítico ─────────────────────────────────────────────────────────
function parseAnalitico(wb: XLSX.WorkBook): { composicoes: ComposicaoRaw[]; mesReferencia: string } {
  const ws = wb.Sheets['Analítico']
  if (!ws) throw new Error('Aba "Analítico" não encontrada. Verifique se é um arquivo SINAPI válido.')

  const data = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1, raw: false, defval: '',
  }) as string[][]

  // Detectar linha do cabeçalho
  const headerRowIdx = data.findIndex(row =>
    row.some(cell => typeof cell === 'string' && (cell.includes('Grupo') || cell.includes('digo da')))
  )
  if (headerRowIdx === -1) throw new Error('Cabeçalho da aba Analítico não encontrado.')

  let mesReferencia = ''
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i]
    const idx = row.findIndex(c => typeof c === 'string' && c.includes('s de Refer'))
    if (idx !== -1) {
      mesReferencia = (row[idx + 1] || '').trim()
      break
    }
  }

  const composicoes: ComposicaoRaw[] = []
  let current: ComposicaoRaw | null = null

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row[0] && !row[1]) continue

    const tipoItem = (row[2] || '').trim()

    if (!tipoItem) {
      // Linha cabeçalho de composição (col 2 vazia = sem "Tipo Item")
      const codigo = (row[1] || '').trim()
      if (!codigo) continue

      current = {
        codigo,
        grupo: (row[0] || '').trim(),
        descricao: (row[4] || '').trim(),
        unidade: (row[5] || '').trim(),
        situacao: (row[7] || 'COM CUSTO').trim(),
        itens: [],
      }
      composicoes.push(current)
    } else if (current && (tipoItem === 'INSUMO' || tipoItem === 'COMPOSICAO')) {
      const coefStr = (row[6] || '0').toString().replace(',', '.')
      current.itens.push({
        tipo: tipoItem as 'INSUMO' | 'COMPOSICAO',
        item_codigo: (row[3] || '').trim(),
        item_descricao: (row[4] || '').trim(),
        item_unidade: (row[5] || '').trim(),
        coeficiente: parseFloat(coefStr) || 0,
        situacao: (row[7] || '').trim(),
      })
    }
  }

  return { composicoes, mesReferencia }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SinapiPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'ise' | 'analitico' | 'buscar'>('ise')

  // ISE state
  const [iseFile, setIseFile] = useState<File | null>(null)
  const [isePreview, setIsePreview] = useState<InsumoRaw[]>([])
  const [iseMes, setIseMes] = useState('')
  const [iseParsing, setIseParsing] = useState(false)
  const [iseParseError, setIseParseError] = useState('')
  const [iseImporting, setIseImporting] = useState(false)
  const [iseResult, setIseResult] = useState<ImportResult | null>(null)

  // Analítico state
  const [anFile, setAnFile] = useState<File | null>(null)
  const [anPreview, setAnPreview] = useState<ComposicaoRaw[]>([])
  const [anMes, setAnMes] = useState('')
  const [anParsing, setAnParsing] = useState(false)
  const [anParseError, setAnParseError] = useState('')
  const [anImporting, setAnImporting] = useState(false)
  const [anResult, setAnResult] = useState<ImportResult | null>(null)

  // ─── ISE handlers ───────────────────────────────────────────────────────────
  const handleIseFile = useCallback(async (file: File) => {
    setIseFile(file)
    setIsePreview([])
    setIseResult(null)
    setIseParseError('')
    setIseParsing(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const { insumos, mesReferencia } = parseISE(wb)
      setIsePreview(insumos)
      setIseMes(mesReferencia)
    } catch (err: any) {
      setIseParseError(err.message || 'Erro ao processar arquivo.')
    } finally {
      setIseParsing(false)
    }
  }, [])

  async function handleIseImport() {
    if (!isePreview.length || !iseMes) return
    setIseImporting(true)
    setIseResult(null)

    let imported = 0
    const errors: string[] = []
    const BATCH = 200

    for (let i = 0; i < isePreview.length; i += BATCH) {
      const batch = isePreview.slice(i, i + BATCH).map(ins => ({
        codigo: ins.codigo,
        classificacao: ins.classificacao,
        descricao: ins.descricao,
        unidade: ins.unidade,
        origem_preco: ins.origem_preco || null,
        precos: ins.precos,
        mes_referencia: iseMes,
      }))

      const { error, data } = await supabase
        .from('sinapi_insumos')
        .upsert(batch, { onConflict: 'codigo,mes_referencia', ignoreDuplicates: false })
        .select('id')

      if (error) {
        errors.push(`Lote ${Math.floor(i / BATCH) + 1}: ${error.message}`)
      } else {
        imported += data?.length ?? batch.length
      }
    }

    setIseResult({ total: isePreview.length, imported, errors })
    setIseImporting(false)
  }

  // ─── Analítico handlers ─────────────────────────────────────────────────────
  const handleAnFile = useCallback(async (file: File) => {
    setAnFile(file)
    setAnPreview([])
    setAnResult(null)
    setAnParseError('')
    setAnParsing(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const { composicoes, mesReferencia } = parseAnalitico(wb)
      setAnPreview(composicoes)
      setAnMes(mesReferencia)
    } catch (err: any) {
      setAnParseError(err.message || 'Erro ao processar arquivo.')
    } finally {
      setAnParsing(false)
    }
  }, [])

  async function handleAnImport() {
    if (!anPreview.length || !anMes) return
    setAnImporting(true)
    setAnResult(null)

    let imported = 0
    const errors: string[] = []

    for (const comp of anPreview) {
      const { error: compErr } = await supabase
        .from('sinapi_composicoes')
        .upsert({
          codigo: comp.codigo,
          grupo: comp.grupo,
          descricao: comp.descricao,
          unidade: comp.unidade,
          situacao: comp.situacao,
          custos: {},
          mes_referencia: anMes,
        }, { onConflict: 'codigo,mes_referencia' })

      if (compErr) {
        errors.push(`Composição ${comp.codigo}: ${compErr.message}`)
        continue
      }

      if (comp.itens.length > 0) {
        const itens = comp.itens.map(it => ({
          composicao_codigo: comp.codigo,
          mes_referencia: anMes,
          tipo: it.tipo,
          item_codigo: it.item_codigo,
          item_descricao: it.item_descricao,
          item_unidade: it.item_unidade,
          coeficiente: it.coeficiente,
          situacao: it.situacao,
        }))

        const { error: itErr } = await supabase
          .from('sinapi_composicao_itens')
          .upsert(itens, { onConflict: 'composicao_codigo,mes_referencia,tipo,item_codigo' })

        if (itErr) {
          errors.push(`Itens de ${comp.codigo}: ${itErr.message}`)
        }
      }

      imported++
    }

    setAnResult({ total: anPreview.length, imported, errors })
    setAnImporting(false)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text-primary)' }}>
          Base SINAPI
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Importe insumos (ISE) e composições analíticas da Caixa Econômica Federal.
          Mês de referência e UFs detectados automaticamente da planilha.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {([
          { id: 'ise' as const, label: 'Insumos (ISE)', icon: Hash },
          { id: 'analitico' as const, label: 'Composições (Analítico)', icon: Layers },
          { id: 'buscar' as const, label: 'Buscar SINAPI', icon: Search },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === id
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }
            }
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Aba ISE ── */}
      {tab === 'ise' && (
        <div className="flex flex-col gap-5">
          <ImportPanel
            title="Relatório de Insumos — SINAPI ISE"
            description="Planilha Excel da Caixa: SINAPI_Preco_Insumos_*.xlsx — aba ISE. Importa preços de todos os 27 estados em uma única operação."
            onFile={handleIseFile}
            parsing={iseParsing}
            parseError={iseParseError}
            file={iseFile}
          />

          {isePreview.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Prévia — {isePreview.length.toLocaleString('pt-BR')} insumos detectados
                  </h3>
                  {iseMes && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Mês de referência: <strong>{iseMes}</strong>
                    </p>
                  )}
                </div>

                {iseResult ? (
                  <ImportResultBadge result={iseResult} />
                ) : (
                  <button
                    onClick={handleIseImport}
                    disabled={iseImporting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-60"
                    style={{ background: 'var(--accent)' }}
                  >
                    {iseImporting
                      ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                      : <><Database size={14} /> Importar {isePreview.length.toLocaleString('pt-BR')} insumos</>
                    }
                  </button>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {['Classificação','Código','Descrição','Unid.','UFs c/ preço','SP (amostra)'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isePreview.slice(0, 10).map((ins, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{ins.classificacao}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--accent)' }}>{ins.codigo}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate" style={{ color: 'var(--text-primary)' }}>{ins.descricao}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{ins.unidade}</td>
                        <td className="px-3 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>{Object.keys(ins.precos).length}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                          {ins.precos['SP'] != null ? `R$ ${ins.precos['SP'].toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                    {isePreview.length > 10 && (
                      <tr style={{ borderTop: '1px solid var(--border)' }}>
                        <td colSpan={6} className="px-3 py-2 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                          + {(isePreview.length - 10).toLocaleString('pt-BR')} insumos adicionais
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {iseResult && iseResult.errors.length > 0 && (
                <ErrorList errors={iseResult.errors} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Aba Analítico ── */}
      {tab === 'analitico' && (
        <div className="flex flex-col gap-5">
          <ImportPanel
            title="Relatório Analítico — SINAPI Composições"
            description="Planilha Excel da Caixa: SINAPI_Composicoes_*.xlsx — aba Analítico. Importa composições com seus insumos/sub-composições e coeficientes."
            onFile={handleAnFile}
            parsing={anParsing}
            parseError={anParseError}
            file={anFile}
          />

          {anPreview.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Prévia — {anPreview.length.toLocaleString('pt-BR')} composições detectadas
                  </h3>
                  {anMes && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Mês de referência: <strong>{anMes}</strong> ·{' '}
                      Total de itens: {anPreview.reduce((a, c) => a + c.itens.length, 0).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>

                {anResult ? (
                  <ImportResultBadge result={anResult} />
                ) : (
                  <button
                    onClick={handleAnImport}
                    disabled={anImporting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-60"
                    style={{ background: 'var(--accent)' }}
                  >
                    {anImporting
                      ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                      : <><Database size={14} /> Importar {anPreview.length.toLocaleString('pt-BR')} composições</>
                    }
                  </button>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {['Grupo','Código','Descrição','Unid.','Itens','Situação'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {anPreview.slice(0, 10).map((comp, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-3 py-2 max-w-[120px] truncate" style={{ color: 'var(--text-secondary)' }}>{comp.grupo}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--accent)' }}>{comp.codigo}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: 'var(--text-primary)' }}>{comp.descricao}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{comp.unidade}</td>
                        <td className="px-3 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>{comp.itens.length}</td>
                        <td className="px-3 py-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{
                              background: comp.situacao === 'COM CUSTO' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                              color: comp.situacao === 'COM CUSTO' ? '#10b981' : '#ef4444',
                            }}
                          >
                            {comp.situacao}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {anPreview.length > 10 && (
                      <tr style={{ borderTop: '1px solid var(--border)' }}>
                        <td colSpan={6} className="px-3 py-2 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                          + {(anPreview.length - 10).toLocaleString('pt-BR')} composições adicionais
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {anResult && anResult.errors.length > 0 && (
                <ErrorList errors={anResult.errors} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Aba Buscar ── */}
      {tab === 'buscar' && <BuscarSinapi supabase={supabase} />}

      {/* Card informativo — composições próprias */}
      <div className="card p-5" style={{ borderLeft: '3px solid var(--accent)' }}>
        <div className="flex gap-3">
          <BarChart3 size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <div>
            <p className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
              Composições Próprias — Próxima Etapa
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              As composições próprias seguirão o mesmo formato SINAPI (Analítico): composição + coeficientes
              de insumos. O preço de cada insumo é buscado automaticamente do banco SINAPI pela <strong>UF da obra</strong>,
              garantindo que o orçamento sempre use o preço regional correto.
              Composições próprias serão vinculadas ao SINAPI para referência de preços (implementação futura).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Aba Buscar SINAPI ────────────────────────────────────────────────────────
function BuscarSinapi({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [tipo, setTipo] = useState<'insumos' | 'composicoes'>('insumos')
  const [expandida, setExpandida] = useState<string | null>(null) // id da composição expandida (revela itens)
  const [uf, setUf] = useState('SP')
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [totalDB, setTotalDB] = useState<{ insumos: number; composicoes: number } | null>(null)

  // Conta total na DB ao montar
  useEffect(() => {
    Promise.all([
      supabase.from('sinapi_insumos').select('id', { count: 'exact', head: true }),
      supabase.from('sinapi_composicoes').select('id', { count: 'exact', head: true }),
    ]).then(([ins, comp]) => {
      setTotalDB({ insumos: ins.count ?? 0, composicoes: comp.count ?? 0 })
    })
  }, [])

  // Busca debounced
  useEffect(() => {
    if (busca.length < 2) { setResultados([]); return }
    const t = setTimeout(() => executarBusca(), 300)
    return () => clearTimeout(t)
  }, [busca, tipo, uf])

  async function executarBusca() {
    setLoading(true)
    if (tipo === 'insumos') {
      const { data } = await supabase
        .from('sinapi_insumos')
        .select('id, codigo, classificacao, descricao, unidade, precos, mes_referencia')
        .or(`descricao.ilike.%${busca}%,codigo.ilike.%${busca}%`)
        .order('codigo')
        .limit(30)
      setResultados(data || [])
    } else {
      const { data } = await supabase
        .from('sinapi_composicoes')
        .select('id, codigo, grupo, descricao, unidade, situacao, mes_referencia')
        .or(`descricao.ilike.%${busca}%,codigo.ilike.%${busca}%`)
        .order('codigo')
        .limit(30)
      setResultados(data || [])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Estatísticas DB */}
      {totalDB && (
        <div className="flex gap-4 flex-wrap">
          {[
            { label: 'Insumos importados', val: totalDB.insumos, icon: Hash },
            { label: 'Composições importadas', val: totalDB.composicoes, icon: Layers },
          ].map(({ label, val, icon: Icon }) => (
            <div key={label} className="card p-4 flex items-center gap-3 flex-1 min-w-[160px]">
              <Icon size={18} style={{ color: 'var(--accent)' }} />
              <div>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {val.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        {/* Tipo */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          {[
            { id: 'insumos', label: 'Insumos' },
            { id: 'composicoes', label: 'Composições' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setTipo(id as any); setResultados([]) }}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={tipo === id
                ? { background: 'var(--accent)', color: 'white' }
                : { color: 'var(--text-secondary)' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* UF */}
        <select
          value={uf}
          onChange={e => setUf(e.target.value)}
          className="input-base py-1.5 text-xs"
          style={{ width: 'auto' }}
        >
          {SINAPI_UFS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>

        {/* Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por código ou descrição..."
            className="input-base input-search text-xs"
          />
          {busca && (
            <button onClick={() => { setBusca(''); setResultados([]) }} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--text-secondary)' }} />
            </button>
          )}
        </div>

        {loading && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />}
      </div>

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="card overflow-hidden">
          {tipo === 'insumos' ? (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  {['Código','Classificação','Descrição','Unid.',`Preço ${uf}`, 'Ref.'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultados.map((ins, i) => {
                  const preco = ins.precos?.[uf] ?? 0
                  return (
                    <tr key={ins.id} style={{ borderBottom: i < resultados.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--accent)' }}>{ins.codigo}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{ins.classificacao}</td>
                      <td className="px-3 py-2.5 max-w-[240px]" style={{ color: 'var(--text-primary)' }}>
                        <span className="block truncate">{ins.descricao}</span>
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{ins.unidade}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums" style={{ color: preco > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {preco > 0 ? formatCurrency(preco) : '—'}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{ins.mes_referencia}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  {['', 'Código','Grupo','Descrição','Unid.','Situação','Ref.'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultados.map((comp, i) => {
                  const aberta = expandida === comp.id
                  return (
                    <Fragment key={comp.id}>
                      <tr
                        onClick={() => setExpandida(prev => prev === comp.id ? null : comp.id)}
                        style={{ borderBottom: aberta ? 'none' : (i < resultados.length - 1 ? '1px solid var(--border)' : 'none'), cursor: 'pointer' }}
                      >
                        <td className="px-2 py-2.5 w-7">
                          <span className="flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                            {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--accent)' }}>{comp.codigo}</td>
                        <td className="px-3 py-2.5 max-w-[120px] truncate" style={{ color: 'var(--text-secondary)' }}>{comp.grupo}</td>
                        <td className="px-3 py-2.5 max-w-[240px]" style={{ color: 'var(--text-primary)' }}>
                          <span className="block truncate">{comp.descricao}</span>
                        </td>
                        <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{comp.unidade}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded-full"
                            style={{
                              background: comp.situacao === 'COM CUSTO' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                              color: comp.situacao === 'COM CUSTO' ? '#10b981' : '#ef4444',
                            }}>
                            {comp.situacao}
                          </span>
                        </td>
                        <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{comp.mes_referencia}</td>
                      </tr>
                      {aberta && (
                        <tr style={{ borderBottom: i < resultados.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td colSpan={7} className="px-0 py-0" style={{ background: 'var(--bg-secondary)' }}>
                            <ItensComposicaoSinapi
                              supabase={supabase}
                              composicaoCodigo={comp.codigo}
                              mesReferencia={comp.mes_referencia}
                              uf={uf}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {busca.length >= 2 && resultados.length === 0 && !loading && (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          <AlertTriangle size={24} className="mx-auto mb-2 opacity-50" />
          <p>Nenhum resultado para <strong>"{busca}"</strong>.</p>
          {totalDB?.insumos === 0 && (
            <p className="mt-1 text-xs">Importe o arquivo SINAPI na aba Insumos (ISE) ou Composições (Analítico).</p>
          )}
        </div>
      )}

      {busca.length < 2 && !loading && (
        <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Search size={24} className="mx-auto mb-2 opacity-30" />
          <p>Digite ao menos 2 caracteres para buscar no banco SINAPI.</p>
        </div>
      )}
    </div>
  )
}

// ─── Itens analíticos de uma composição SINAPI (revela ao clicar/expandir) ────
function ItensComposicaoSinapi({
  supabase, composicaoCodigo, mesReferencia, uf,
}: {
  supabase: ReturnType<typeof createClient>
  composicaoCodigo: string
  mesReferencia: string
  uf: string
}) {
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [precosInsumo, setPrecosInsumo] = useState<Record<string, Record<string, number>>>({})

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('sinapi_composicao_itens')
        .select('*')
        .eq('composicao_codigo', composicaoCodigo)
        .eq('mes_referencia', mesReferencia)
        .order('tipo').order('item_codigo')
      const lista = (data || []) as SinapiComposicaoItem[]
      if (!active) return
      setItens(lista)

      // Busca os preços por UF dos insumos referenciados (para exibir o valor de referência)
      const codigosInsumo = lista.filter(i => i.tipo === 'INSUMO').map(i => i.item_codigo)
      if (codigosInsumo.length > 0) {
        const { data: precosData } = await supabase
          .from('sinapi_insumos')
          .select('codigo, precos')
          .in('codigo', codigosInsumo)
        if (active && precosData) {
          const map: Record<string, Record<string, number>> = {}
          for (const p of precosData) map[p.codigo] = p.precos || {}
          setPrecosInsumo(map)
        }
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [composicaoCodigo, mesReferencia])

  if (loading) {
    return (
      <div className="px-6 py-4 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <Loader2 size={14} className="animate-spin" /> Carregando insumos da composição {composicaoCodigo}...
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <div className="px-6 py-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
        Nenhum item analítico encontrado para a composição {composicaoCodigo} (referência {mesReferencia}).
        Importe a planilha Analítico em "Composições (Analítico)" para detalhar os insumos.
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
        Insumos / sub-composições de <span style={{ color: 'var(--accent)' }}>{composicaoCodigo}</span> — referência {mesReferencia}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr>
            {['Tipo', 'Código', 'Descrição', 'Unid.', 'Coeficiente', `Preço ${uf}`].map(h => (
              <th key={h} className="text-left px-3 py-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map(it => {
            const preco = it.tipo === 'INSUMO' ? (precosInsumo[it.item_codigo]?.[uf] ?? 0) : 0
            return (
              <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: it.tipo === 'INSUMO' ? 'rgba(59,123,248,0.15)' : 'rgba(139,92,246,0.15)',
                      color: it.tipo === 'INSUMO' ? '#3B7BF8' : '#8B5CF6',
                    }}>
                    {it.tipo === 'INSUMO' ? 'Insumo' : 'Composição'}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{it.item_codigo}</td>
                <td className="px-3 py-2 max-w-[320px]" style={{ color: 'var(--text-primary)' }}>
                  <span className="truncate block">{it.item_descricao}</span>
                </td>
                <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{it.item_unidade}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {Number(it.coeficiente).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: preco > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {preco > 0 ? formatCurrency(preco) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function ImportPanel({
  title, description, onFile, parsing, parseError, file,
}: {
  title: string
  description: string
  onFile: (f: File) => void
  parsing: boolean
  parseError: string
  file: File | null
}) {
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onFile(f)
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3 mb-4">
        <FileSpreadsheet size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <div>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{description}</p>
        </div>
      </div>

      <label
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all hover:opacity-80"
        style={{ borderColor: 'var(--border)' }}
      >
        {parsing ? (
          <>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Lendo arquivo...</p>
          </>
        ) : file ? (
          <>
            <CheckCircle2 size={28} style={{ color: '#10b981' }} />
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {(file.size / 1024 / 1024).toFixed(1)} MB · Clique para substituir
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload size={28} style={{ color: 'var(--text-secondary)' }} />
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Arraste o arquivo XLSX ou clique para selecionar
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Somente arquivos .xlsx da Caixa Econômica Federal
              </p>
            </div>
          </>
        )}
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />
      </label>

      {parseError && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          {parseError}
        </div>
      )}
    </div>
  )
}

function ImportResultBadge({ result }: { result: ImportResult }) {
  const ok = result.errors.length === 0
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{
        background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
        color: ok ? '#10b981' : '#f59e0b',
      }}
    >
      {ok
        ? <><CheckCircle2 size={14} /> {result.imported.toLocaleString('pt-BR')} importados</>
        : <><AlertTriangle size={14} /> {result.imported} ok · {result.errors.length} erros</>
      }
    </div>
  )
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
      <p className="font-medium mb-1">Erros ({errors.length}):</p>
      {errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
      {errors.length > 5 && <p>+ {errors.length - 5} erros adicionais...</p>}
    </div>
  )
}
