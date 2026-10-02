'use client'

// Widgets da Visão Geral do Investidor. Cada um recebe a mesma `VisaoInvestidor`
// já agregada (lib/investidor/carteira.ts) — nenhum faz consulta própria por
// item. Desenho inspirado na referência: cartões de número, operações por etapa,
// alertas, mapa de operações (tilegram), carteira e prospecção pública.

import Link from 'next/link'
import Image from 'next/image'
import {
  AlertTriangle, Building2, ChevronRight, DollarSign, Landmark, MapPin, Wallet,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { BR_ESTADOS_NOME, BR_TILEGRAM, BR_TILEGRAM_COLUNAS, BR_TILEGRAM_LINHAS } from '@/lib/br-estados'
import type { AtivoCarteira, VisaoInvestidor } from '@/lib/investidor/carteira'
import { useState } from 'react'

function compactBRL(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return formatCurrency(v)
}

// ─── KPIs ──────────────────────────────────────────────────────────────────
export function InvestidorKpis({ visao }: { visao: VisaoInvestidor }) {
  const { kpis } = visao
  const cards = [
    { label: 'Imóveis na carteira', valor: String(kpis.nAtivos), sub: `${kpis.nAtivos} ${kpis.nAtivos === 1 ? 'imóvel adquirido' : 'imóveis adquiridos'}`, icon: Building2 },
    { label: 'Total arrematado', valor: compactBRL(kpis.totalArrematado), sub: formatCurrency(kpis.totalArrematado), icon: DollarSign },
    { label: 'Custos pagos conhecidos', valor: compactBRL(kpis.custosPagos), sub: formatCurrency(kpis.custosPagos), icon: Wallet },
    { label: 'Total investido conhecido', valor: compactBRL(kpis.investido), sub: formatCurrency(kpis.investido), icon: Landmark },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{c.label}</p>
            <span className="grid size-9 flex-shrink-0 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
              <c.icon size={16} style={{ color: 'var(--accent)' }} />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{c.valor}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Operações por etapa ─────────────────────────────────────────────────────
export function OperacoesPorEtapa({ visao }: { visao: VisaoInvestidor }) {
  const { porFase, kpis } = visao
  const total = porFase.reduce((s, f) => s + f.count, 0)
  return (
    <div className="card p-5 h-full">
      <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Operações por etapa</h2>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Distribuição atual dos {kpis.nAtivos} imóveis adquiridos</p>

      {total === 0 ? (
        <p className="py-8 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>Nenhum imóvel na carteira ainda.</p>
      ) : (
        <>
          <div className="mt-5 flex items-end gap-3">
            <span className="text-4xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{kpis.nAtivos}</span>
            <div className="pb-1">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>imóveis na carteira</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(kpis.investido)} investido conhecido</p>
            </div>
          </div>

          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-secondary)' }}>
            {porFase.map(f => (
              <div key={f.fase} style={{ width: `${(f.count / total) * 100}%`, background: f.cor }} title={`${f.label}: ${f.count}`} />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            {porFase.map(f => (
              <div key={f.fase}>
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: f.cor }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                </div>
                <p className="mt-0.5 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{f.count}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Alertas e pendências ────────────────────────────────────────────────────
type Alerta = { id: string; titulo: string; sub: string; href: string }

function derivarAlertas(visao: VisaoInvestidor): Alerta[] {
  const out: Alerta[] = []
  for (const a of visao.ativos) {
    const href = `/projetos/${a.id}`
    if (a.fase === 'regularizacao_posse') {
      out.push({ id: `${a.id}-reg`, titulo: 'Registro/escritura pendentes', sub: `${a.nome}${a.cidade ? ` — ${a.cidade}` : ''}`, href })
    } else if (a.fase === 'reforma') {
      out.push({ id: `${a.id}-ref`, titulo: 'Reforma em andamento', sub: `${a.nome}${a.cidade ? ` — ${a.cidade}` : ''}`, href })
    }
    if (a.arremate == null) {
      out.push({ id: `${a.id}-arr`, titulo: 'Arremate não informado', sub: `${a.nome} — complete a ficha do imóvel`, href })
    }
  }
  return out
}

export function AlertasPendencias({ visao }: { visao: VisaoInvestidor }) {
  const alertas = derivarAlertas(visao)
  const [verTodas, setVerTodas] = useState(false)
  const visiveis = verTodas ? alertas : alertas.slice(0, 3)
  return (
    <div className="card p-5 h-full">
      <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Alertas e pendências</h2>
      <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--text-secondary)' }}>Itens reais que precisam de acompanhamento</p>
      {alertas.length === 0 ? (
        <p className="py-6 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>Nenhuma pendência no momento.</p>
      ) : (
        <>
          <div className="flex flex-col">
            {visiveis.map(al => (
              <Link key={al.id} href={al.href} className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                <span className="grid size-9 flex-shrink-0 place-items-center rounded-lg" style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#f59e0b' }}>Atenção</p>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{al.titulo}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{al.sub}</p>
                </div>
                <ChevronRight size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
          {alertas.length > 3 && (
            <button type="button" onClick={() => setVerTodas(v => !v)} className="mt-3 text-sm font-medium" style={{ color: 'var(--accent)' }}>
              {verTodas ? 'Ver menos' : `Ver todas as pendências (${alertas.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── Mapa de operações (tilegram) ────────────────────────────────────────────
export function MapaOperacoes({ visao }: { visao: VisaoInvestidor }) {
  const porEstado = new Map(visao.porEstado.map(e => [e.uf, e]))
  const comAtivos = visao.porEstado.filter(e => e.ativos > 0)
  const [selecionado, setSelecionado] = useState<string | null>(comAtivos[0]?.uf ?? visao.porEstado[0]?.uf ?? null)
  const detalhe = selecionado ? porEstado.get(selecionado) : undefined

  function corEstado(uf: string): { bg: string; fg: string } {
    const e = porEstado.get(uf)
    if (e && e.ativos > 0) return { bg: 'var(--accent)', fg: '#fff' }
    if (e && e.prospeccoes > 0) return { bg: 'rgba(212,165,116,0.55)', fg: '#4a3418' }
    return { bg: 'var(--bg-secondary)', fg: 'var(--text-secondary)' }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Mapa de operações</h2>
      <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--text-secondary)' }}>Carteira real e prospecções identificadas por estado</p>

      <div className="mx-auto grid w-full max-w-[360px] gap-1"
        style={{ gridTemplateColumns: `repeat(${BR_TILEGRAM_COLUNAS}, 1fr)`, gridTemplateRows: `repeat(${BR_TILEGRAM_LINHAS}, 1fr)` }}>
        {Object.entries(BR_TILEGRAM).map(([uf, [linha, coluna]]) => {
          const cor = corEstado(uf)
          const ativo = selecionado === uf
          return (
            <button
              key={uf}
              type="button"
              onClick={() => setSelecionado(uf)}
              className="aspect-square rounded-md text-[10px] font-bold transition-transform"
              style={{
                gridColumn: coluna + 1, gridRow: linha + 1,
                background: cor.bg, color: cor.fg,
                outline: ativo ? '2px solid var(--text-primary)' : 'none', outlineOffset: 1,
              }}
              title={BR_ESTADOS_NOME[uf]}
            >
              {uf}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ background: 'var(--accent)' }} /> Carteira</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ background: 'rgba(212,165,116,0.55)' }} /> Prospecção</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }} /> Sem imóveis</span>
      </div>

      {detalhe && (
        <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
              <MapPin size={16} style={{ color: 'var(--accent)' }} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Estado selecionado</p>
              <p className="text-lg font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{BR_ESTADOS_NOME[detalhe.uf]}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{detalhe.ativos}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>imóveis na carteira</p>
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(detalhe.investido)}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>investido conhecido</p>
            </div>
          </div>
          {detalhe.cidades.length > 0 && (
            <div className="mt-3 flex flex-col">
              {detalhe.cidades.map(c => (
                <div key={c.cidade} className="flex items-center gap-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span className="grid size-8 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                    <MapPin size={13} style={{ color: 'var(--text-secondary)' }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.cidade}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.ativos} {c.ativos === 1 ? 'imóvel na carteira' : 'imóveis na carteira'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {detalhe.prospeccoes > 0 && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {detalhe.prospeccoes} {detalhe.prospeccoes === 1 ? 'prospecção identificada' : 'prospecções identificadas'} neste estado.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Carteira atual ──────────────────────────────────────────────────────────
function CartaoAtivo({ a }: { a: AtivoCarteira }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 flex-shrink-0 place-items-center overflow-hidden rounded-lg" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
          {a.foto_url
            ? <Image src={a.foto_url} alt="" width={40} height={40} unoptimized className="size-full object-cover" />
            : <Building2 size={18} style={{ color: 'var(--accent)' }} />}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/projetos/${a.id}`} className="text-sm font-semibold truncate block hover:underline" style={{ color: 'var(--text-primary)' }}>{a.nome}</Link>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {[a.cidade, a.uf].filter(Boolean).join(', ') || a.endereco || 'Sem localização'}
          </p>
        </div>
        <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {a.faseLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <Valor label="Arremate" valor={a.arremate != null ? formatCurrency(a.arremate) : '—'} />
        <Valor label="Custos pagos" valor={formatCurrency(a.custosPagos)} />
        <Valor label="Investido" valor={a.investido != null ? formatCurrency(a.investido) : '—'} destaque />
      </div>
    </div>
  )
}

function Valor({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-sm font-semibold truncate" style={{ color: destaque ? 'var(--accent)' : 'var(--text-primary)' }}>{valor}</p>
    </div>
  )
}

export function CarteiraAtual({ visao }: { visao: VisaoInvestidor }) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Carteira atual</h2>
      <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--text-secondary)' }}>
        {visao.ativos.length} {visao.ativos.length === 1 ? 'imóvel adquirido' : 'imóveis adquiridos'} com fases e valores conhecidos
      </p>
      {visao.ativos.length === 0 ? (
        <p className="py-8 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>Nenhum imóvel na carteira ainda.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visao.ativos.map(a => <CartaoAtivo key={a.id} a={a} />)}
        </div>
      )}
    </div>
  )
}

// ─── Prospecção pública ──────────────────────────────────────────────────────
export function ProspeccaoPublica({ visao }: { visao: VisaoInvestidor }) {
  const lista = visao.prospeccoes
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Prospecção pública</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Oportunidades fora da carteira e dos totais financeiros</p>
        </div>
        {lista.length > 0 && (
          <span className="flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-center" style={{ background: 'rgba(212,165,116,0.2)', color: '#8a5a1c' }}>
            {lista.length} {lista.length === 1 ? 'oportunidade' : 'oportunidades'}
          </span>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="py-8 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>Nenhuma prospecção aberta.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {lista.map(p => (
            <Link key={p.id} href={`/investidor/${p.id}`} className="rounded-xl p-4" style={{ border: '1px solid rgba(212,165,116,0.4)', background: 'rgba(212,165,116,0.06)' }}>
              <span className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'rgba(212,165,116,0.3)', color: '#8a5a1c' }}>Prospecção</span>
              <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.nome}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{[p.cidade, p.uf].filter(Boolean).join(', ') || p.endereco || '—'}</p>
              {p.arremate != null && <p className="mt-1.5 text-sm font-semibold" style={{ color: 'var(--accent)' }}>{formatCurrency(p.arremate)}</p>}
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {p.tipo_aquisicao === 'leilao' ? 'Leilão' : 'Compra direta'}{p.data_leilao ? ` · ${new Date(p.data_leilao + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
