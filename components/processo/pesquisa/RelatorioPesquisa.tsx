'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { Prospeccao } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { FileText } from 'lucide-react'

// Relatório de pesquisa preliminar. A estrutura segue os relatórios que já
// eram entregues à mão: ficha do imóvel, comparáveis com preço e R$/m²,
// gráficos, fontes clicáveis e as ressalvas.
//
// A regra editorial que o formato carrega e o código respeita: o que NÃO foi
// informado aparece dito, não escondido. Um comparável com anúncio fora do ar
// ou endereço não confirmado é mostrado com a ressalva, nunca como dado
// limpo — é o que separa pesquisa de chute.

type Comparavel = {
  id: string
  titulo: string | null
  preco: number | null
  area: number | null
  preco_m2: number | null
  fonte: string | null
  url: string | null
  url_confirmada: boolean
  identificador_anuncio: string | null
  similaridade: 'mesmo_predio' | 'mesma_rua' | 'entorno' | 'bairro' | null
  disponibilidade: string | null
  possivel_duplicado: boolean
  favorito: boolean
  salvo: boolean
}

type Analise = {
  analise_texto: string
  faixa_conservadora: number | null
  faixa_base: number | null
  faixa_otimista: number | null
  pendencias: string | null
  created_at: string
}

type Ficha = {
  dados_extraidos: Record<string, unknown> | null
  dados_confirmados: Record<string, unknown> | null
  status: string
  fonte_url: string | null
}

const SIMILARIDADE_LABEL: Record<string, string> = {
  mesmo_predio: 'Mesmo prédio',
  mesma_rua: 'Mesma rua',
  entorno: 'Entorno',
  bairro: 'Mesmo bairro',
}

// Rótulos legíveis para as chaves que a extração costuma devolver. Chave
// desconhecida cai no fallback e aparece mesmo assim — esconder um dado que
// a fonte trouxe seria pior que exibir um rótulo feio.
const ROTULOS: Record<string, string> = {
  tipologia: 'Tipologia',
  area_construida: 'Área construída',
  area_privativa: 'Área privativa',
  area_total: 'Área total',
  area_terreno: 'Área do terreno',
  patio_privativo: 'Pátio privativo',
  matricula: 'Matrícula',
  data_leilao: 'Data do leilão',
  valor_inicial: 'Valor inicial',
  valor_avaliacao: 'Valor de avaliação',
  situacao: 'Situação',
  ocupacao: 'Ocupação',
  dormitorios: 'Dormitórios',
  banheiros: 'Banheiros',
  vagas: 'Vagas',
  andar: 'Andar',
  cep: 'CEP',
  bairro: 'Bairro',
  cidade: 'Cidade',
}

function rotular(chave: string) {
  return ROTULOS[chave] ?? chave.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

function valorLegivel(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  return null
}

function Barra({ label, valor, maximo, formato }: {
  label: string
  valor: number
  maximo: number
  formato: (n: number) => string
}) {
  const pct = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-40 flex-shrink-0 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded" style={{ background: 'var(--bg-secondary)' }}>
        <div className="h-full rounded" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
      <span className="w-24 flex-shrink-0 text-right text-xs tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {formato(valor)}
      </span>
    </div>
  )
}

export function RelatorioPesquisa({ prospeccaoId, prospeccao, recarregar }: {
  prospeccaoId: string
  prospeccao: Prospeccao
  recarregar: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [comparaveis, setComparaveis] = useState<Comparavel[]>([])
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const [f, c, a] = await Promise.all([
      supabase.from('prospeccao_ficha').select('dados_extraidos, dados_confirmados, status, fonte_url').eq('prospeccao_id', prospeccaoId).maybeSingle(),
      supabase.from('prospeccao_comparaveis').select('*').eq('prospeccao_id', prospeccaoId).order('preco_m2', { nullsFirst: false }),
      supabase.from('prospeccao_analises_mercado').select('*').eq('prospeccao_id', prospeccaoId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setFicha((f.data as Ficha | null) ?? null)
    setComparaveis(((c.data ?? []) as Comparavel[]).filter(x => x.salvo || x.favorito))
    setAnalise((a.data as Analise | null) ?? null)
    setCarregando(false)
  }, [supabase, prospeccaoId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar, recarregar])

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  const dados = { ...(ficha?.dados_extraidos ?? {}), ...(ficha?.dados_confirmados ?? {}) }
  const pares = Object.entries(dados)
    .map(([k, v]) => [k, valorLegivel(v)] as const)
    .filter(([, v]) => v !== null)

  if (pares.length === 0 && comparaveis.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhuma pesquisa ainda"
        description="Envie o print da tela do leilão acima. A ficha, os comparáveis e o relatório saem de lá."
      />
    )
  }

  const maxPreco = Math.max(0, ...comparaveis.map(c => c.preco ?? 0))
  const maxM2 = Math.max(0, ...comparaveis.map(c => c.preco_m2 ?? 0))
  const comFonte = comparaveis.filter(c => c.url)

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ficha do imóvel</h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {prospeccao.endereco || 'Endereço não informado'}
        </p>

        {pares.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nada foi extraído ainda do anúncio.
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {pares.map(([chave, valor]) => (
              <div key={chave} className="flex justify-between gap-3 py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                <dt className="text-xs" style={{ color: 'var(--text-secondary)' }}>{rotular(chave)}</dt>
                <dd className="text-xs text-right" style={{ color: 'var(--text-primary)' }}>{valor}</dd>
              </div>
            ))}
          </dl>
        )}

        {ficha?.status && ficha.status !== 'validada' && (
          <p className="mt-3 text-xs" style={{ color: '#f59e0b' }}>
            Ficha {ficha.status}: os dados vieram do anúncio e ainda não foram conferidos por uma pessoa.
          </p>
        )}
      </div>

      {comparaveis.length > 0 && (
        <>
          <div className="card p-5">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Preços e áreas publicados</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-secondary)' }}>
                    <th className="pb-2 text-left font-medium">Imóvel</th>
                    <th className="pb-2 text-right font-medium">Área</th>
                    <th className="pb-2 text-right font-medium">Preço</th>
                    <th className="pb-2 text-right font-medium">R$/m²</th>
                  </tr>
                </thead>
                <tbody>
                  {comparaveis.map(c => (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-primary)' }}>
                        <span className="block">{c.titulo || 'Sem título'}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {c.similaridade && (
                            <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                              {SIMILARIDADE_LABEL[c.similaridade]}
                            </span>
                          )}
                          {!c.url_confirmada && (
                            <span className="text-[10px]" style={{ color: '#f59e0b' }}>anúncio não confirmado</span>
                          )}
                          {c.disponibilidade && c.disponibilidade !== 'disponivel' && (
                            <span className="text-[10px]" style={{ color: '#f59e0b' }}>{c.disponibilidade}</span>
                          )}
                          {c.possivel_duplicado && (
                            <span className="text-[10px]" style={{ color: '#f59e0b' }}>possível duplicado</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {c.area ? `${c.area} m²` : '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        {c.preco ? formatCurrency(c.preco) : '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {c.preco_m2 ? formatCurrency(c.preco_m2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              R$/m² = preço publicado ÷ área informada no anúncio. As áreas não foram verificadas em documento.
            </p>
          </div>

          <div className="card p-5 space-y-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Preço anunciado</h3>
              <div className="space-y-1.5">
                {comparaveis.filter(c => c.preco).map(c => (
                  <Barra key={c.id} label={c.titulo || 'Sem título'} valor={c.preco!} maximo={maxPreco} formato={formatCurrency} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Preço por metro quadrado</h3>
              <div className="space-y-1.5">
                {comparaveis.filter(c => c.preco_m2).map(c => (
                  <Barra key={c.id} label={c.titulo || 'Sem título'} valor={c.preco_m2!} maximo={maxM2} formato={formatCurrency} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {analise && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Leitura de mercado</h3>
          {(analise.faixa_conservadora || analise.faixa_base || analise.faixa_otimista) && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                { rotulo: 'Conservadora', valor: analise.faixa_conservadora },
                { rotulo: 'Base', valor: analise.faixa_base },
                { rotulo: 'Otimista', valor: analise.faixa_otimista },
              ].map(f => (
                <div key={f.rotulo} className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)' }}>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{f.rotulo}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {f.valor ? formatCurrency(f.valor) : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
          {analise.analise_texto && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {analise.analise_texto}
            </p>
          )}
          {analise.pendencias && (
            <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <p className="text-xs font-medium" style={{ color: '#f59e0b' }}>O que ainda falta confirmar</p>
              <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: 'var(--text-primary)' }}>{analise.pendencias}</p>
            </div>
          )}
        </div>
      )}

      {comFonte.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Fontes</h3>
          <ol className="mt-3 space-y-2">
            {comFonte.map((c, i) => (
              <li key={c.id} className="text-xs">
                <a
                  href={c.url!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  [{i + 1}] {c.titulo || c.url}
                  <ExternalLink size={11} />
                </a>
                <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>
                  {[c.fonte, c.identificador_anuncio, c.area ? `${c.area} m²` : null, c.preco ? formatCurrency(c.preco) : null]
                    .filter(Boolean).join(' • ')}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="card p-5">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Observação técnica</h3>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Esta é uma pesquisa preliminar por oferta. Os valores são preços anunciados nas fontes consultadas e não
          representam, por si só, valor definitivo de mercado ou preço efetivo de negociação. Não foram aplicados
          ajustes por estado de conservação, padrão construtivo, idade, ocupação, documentação, necessidade de
          reforma, liquidez ou custos de aquisição.
        </p>
      </div>
    </div>
  )
}
