'use client'

// Custos de aquisição realizados (Núcleo N06.3) — categoria + valor +
// comprovante opcional, vinculado direto ao Ativo. Compara com o "previsto"
// já calculado pelo motor do Marco 3 (cenário principal da Prospecção de
// origem) — não reimplementa nenhuma fórmula, só lê investimento_total.
// Reaproveita o mesmo bucket de storage já usado por ProspeccaoArquivos.tsx.
import { useEffect, useRef, useState } from 'react'
import { Wallet, Upload, Trash2, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils'
import type { ProjetoCustoAquisicao, CategoriaCustoAquisicao } from '@/lib/types'

const CATEGORIA_LABEL: Record<CategoriaCustoAquisicao, string> = {
  comissao_leiloeiro: 'Comissão do Leiloeiro',
  itbi: 'ITBI',
  registro: 'Registro',
  escritura: 'Escritura',
  advogado_desocupacao: 'Advogado de Desocupação',
  certidoes_outros: 'Certidões/Outros',
  iptu_pago: 'IPTU pago',
  condominio_pago: 'Condomínio pago',
}
const CATEGORIAS = Object.keys(CATEGORIA_LABEL) as CategoriaCustoAquisicao[]

export function ProjetoCustosAquisicao({ projetoId }: { projetoId: string }) {
  const { currentProfile } = useProfile()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [custos, setCustos] = useState<ProjetoCustoAquisicao[]>([])
  const [investimentoPrevisto, setInvestimentoPrevisto] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviandoComprovante, setEnviandoComprovante] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [categoria, setCategoria] = useState<CategoriaCustoAquisicao>('comissao_leiloeiro')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [dataPagamento, setDataPagamento] = useState('')
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(null)
  const [comprovanteNome, setComprovanteNome] = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: lista }, { data: prospeccao }] = await Promise.all([
      supabase.from('projeto_custos_aquisicao').select('*').eq('projeto_id', projetoId).order('created_at', { ascending: false }),
      supabase.from('prospeccoes').select('id').eq('project_id', projetoId).eq('is_venda', false).maybeSingle(),
    ])
    setCustos((lista ?? []) as ProjetoCustoAquisicao[])
    if (prospeccao) {
      const { data: cenario } = await supabase.from('prospeccao_cenarios').select('investimento_total').eq('prospeccao_id', prospeccao.id).eq('principal', true).maybeSingle()
      setInvestimentoPrevisto((cenario?.investimento_total as number | null) ?? null)
    } else {
      setInvestimentoPrevisto(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId])

  async function enviarComprovante(file: File) {
    setEnviandoComprovante(true)
    setErro(null)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'bin'
      const path = `projetos/${projetoId}/custos-aquisicao/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('project-files').upload(path, file)
      if (upErr) throw upErr
      const url = supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
      setComprovanteUrl(url)
      setComprovanteNome(file.name)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar o comprovante.')
    } finally {
      setEnviandoComprovante(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function adicionar() {
    const valorNumerico = Number(valor.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(valorNumerico) || valorNumerico < 0) { setErro('Informe um valor válido.'); return }
    setSalvando(true)
    setErro(null)
    const supabase = createClient()
    const { data, error } = await supabase.from('projeto_custos_aquisicao').insert({
      projeto_id: projetoId,
      categoria,
      descricao: descricao.trim() || null,
      valor: valorNumerico,
      data_pagamento: dataPagamento || null,
      comprovante_url: comprovanteUrl,
      comprovante_nome: comprovanteNome,
      created_by: currentProfile?.id ?? null,
    }).select('*').single()
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setCustos(prev => [data as ProjetoCustoAquisicao, ...prev])
    setDescricao(''); setValor(''); setDataPagamento(''); setComprovanteUrl(null); setComprovanteNome(null)
  }

  async function remover(id: string) {
    setCustos(prev => prev.filter(c => c.id !== id))
    const supabase = createClient()
    await supabase.from('projeto_custos_aquisicao').delete().eq('id', id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  const totalRealizado = custos.reduce((acc, c) => acc + c.valor, 0)
  const diferenca = investimentoPrevisto != null ? totalRealizado - investimentoPrevisto : null

  return (
    <div className="card p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Wallet size={16} style={{ color: 'var(--accent)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Custos de aquisição realizados</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Previsto (cenário)</p>
          <p className="font-bold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>
            {investimentoPrevisto != null ? formatCurrency(investimentoPrevisto) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Realizado</p>
          <p className="font-bold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalRealizado)}</p>
        </div>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Diferença</p>
          <p className="font-bold text-sm sm:text-base" style={{ color: diferenca == null ? 'var(--text-primary)' : diferenca > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {diferenca != null ? formatCurrency(diferenca) : '—'}
          </p>
        </div>
      </div>

      {custos.length > 0 && (
        <div className="flex flex-col gap-2">
          {custos.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {CATEGORIA_LABEL[c.categoria]}{c.descricao ? ` — ${c.descricao}` : ''}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {c.data_pagamento ? new Date(c.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem data'}
                  {c.comprovante_url && (
                    <> · <a href={c.comprovante_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--accent)' }}>comprovante <ExternalLink size={10} /></a></>
                  )}
                </p>
              </div>
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.valor)}</span>
              <button onClick={() => remover(c.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors flex-shrink-0" title="Remover">
                <Trash2 size={13} style={{ color: 'var(--danger)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaCustoAquisicao)}>
            {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </Select>
          <Input placeholder="Descrição (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} />
          <Input placeholder="Valor (ex.: 5000,00)" value={valor} onChange={e => setValor(e.target.value)} />
          <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={enviandoComprovante}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            <Upload size={12} /> {enviandoComprovante ? 'Enviando...' : comprovanteNome || 'Anexar comprovante'}
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void enviarComprovante(f) }} />
          <Button size="sm" onClick={adicionar} loading={salvando} disabled={!valor.trim()} className="ml-auto">
            Adicionar
          </Button>
        </div>
        {erro && <p className="text-xs" style={{ color: 'var(--danger)' }}>{erro}</p>}
      </div>
    </div>
  )
}
