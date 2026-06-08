'use client'

import { useEffect, useState } from 'react'
import { FileText, Plus, HardHat } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ServicosPage from '@/app/(app)/servicos/page'
import SinapiPage from '@/app/(app)/sinapi/page'

type OrcamentoComObra = {
  id: string
  obra_id: string
  tipo: string
  bdi_percentual: number
  status: string
  versao: number
  created_at: string
  obra: { id: string; nome: string; endereco: string; status: string; foto_url: string | null }
  total_itens: number
  valor_total: number
}

export default function OrcamentosPage() {
  const router = useRouter()
  const supabase = createClient()
  const [orcamentos, setOrcamentos] = useState<OrcamentoComObra[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('todos')
  const [aba, setAba] = useState<'orcamentos' | 'composicoes' | 'insumos' | 'base'>('orcamentos')

  useEffect(() => {
    loadOrcamentos()
  }, [])

  async function loadOrcamentos() {
    setLoading(true)
    const { data } = await supabase
      .from('orcamentos')
      .select(`
        *,
        obra:obras(id, nome, endereco, status, foto_url),
        orcamento_itens(quantidade, preco_unitario_snapshot)
      `)
      .order('created_at', { ascending: false })

    const enriched = (data || []).map((o: any) => {
      const itens = o.orcamento_itens || []
      const subtotal = itens.reduce((acc: number, i: any) => acc + (i.quantidade * i.preco_unitario_snapshot), 0)
      const valor_total = subtotal * (1 + o.bdi_percentual / 100)
      return {
        ...o,
        obra: o.obra,
        total_itens: itens.length,
        valor_total,
      }
    })
    setOrcamentos(enriched)
    setLoading(false)
  }

  const STATUS_ORC_COLOR: Record<string, string> = {
    rascunho: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    ativo:    'bg-green-500/20 text-green-400 border-green-500/30',
    finalizado: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }
  const STATUS_ORC_LABEL: Record<string, string> = {
    rascunho: 'Rascunho', ativo: 'Ativo', finalizado: 'Finalizado',
  }

  const filtrados = filtro === 'todos'
    ? orcamentos
    : orcamentos.filter(o => o.status === filtro)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex gap-1 p-1 rounded-xl w-fit flex-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {[
            { id: 'orcamentos', label: 'Orçamentos' },
            { id: 'composicoes', label: 'Composições' },
            { id: 'insumos', label: 'Insumos' },
            { id: 'base', label: 'Base de referência' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setAba(item.id as typeof aba)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={aba === item.id
                ? { background: 'var(--accent)', color: 'white' }
                : { color: 'var(--text-secondary)' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'composicoes' && <ServicosPage initialTab="composicoes" embedded />}
      {aba === 'insumos' && <ServicosPage initialTab="insumos" embedded />}
      {aba === 'base' && <SinapiPage />}

      {aba === 'orcamentos' && (
      <>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <select value={filtro} onChange={e => setFiltro(e.target.value)} className="input-base w-full sm:w-52">
          {['todos', 'rascunho', 'ativo', 'finalizado'].map(s => (
            <option key={s} value={s}>{s === 'todos' ? 'Todos os status' : STATUS_ORC_LABEL[s]}</option>
          ))}
        </select>
        <Button onClick={() => router.push('/obras')} icon={<Plus size={16} />}>
          Nova Obra / Orçamento
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento encontrado"
          description="Crie uma nova obra para iniciar o orçamento."
          action={
            <Button onClick={() => router.push('/obras')} icon={<Plus size={16} />}>
              Nova Obra
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtrados.map((orc, i) => (
            <Link
              key={orc.id}
              href={`/obras/${orc.obra_id}?tab=orcamento`}
              className="card p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:scale-[1.005] transition-transform animate-enter block"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Thumb obra */}
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--bg-secondary)' }}
              >
                {orc.obra?.foto_url ? (
                  <img src={orc.obra.foto_url} alt={orc.obra.nome} className="w-full h-full rounded-xl object-cover" />
                ) : (
                  <HardHat size={24} style={{ color: 'var(--text-secondary)' }} />
                )}
              </div>

              {/* Dados */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {orc.obra?.nome || '—'}
                  </span>
                  {orc.obra?.status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_OBRA_COLOR[orc.obra.status]}`}>
                      {STATUS_OBRA_LABEL[orc.obra.status]}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_ORC_COLOR[orc.status]}`}>
                    Orç. v{orc.versao} — {STATUS_ORC_LABEL[orc.status]}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {orc.total_itens} {orc.total_itens === 1 ? 'item' : 'itens'} · BDI {orc.bdi_percentual}% · Criado em {formatDate(orc.created_at)}
                </p>
              </div>

              {/* Valor */}
              <div className="text-right flex-shrink-0">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Total c/ BDI</p>
                <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                  {formatCurrency(orc.valor_total)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
