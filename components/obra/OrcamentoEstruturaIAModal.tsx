'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Wand2, Check, X as XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils'
import type { EtapaEstrutura } from '@/lib/orcamento-ai'

type ComposicaoCatalogo = { id: string; codigo: string; descricao: string; unidade: string; custo_calculado?: number }

function normalizarNome(nome: string) {
  return nome.trim().toLocaleLowerCase('pt-BR')
}

export function OrcamentoEstruturaIAModal({
  open, onClose, obraId, obraName, orcamentoId, composicoesProprias, onApplied,
}: {
  open: boolean
  onClose: () => void
  obraId: string
  obraName: string
  orcamentoId: string
  composicoesProprias: ComposicaoCatalogo[]
  onApplied?: () => void
}) {
  const supabase = createClient()
  const [descricaoObra, setDescricaoObra] = useState('')
  const [gerando, setGerando] = useState(false)
  const [estrutura, setEstrutura] = useState<EtapaEstrutura[] | null>(null)
  const [erro, setErro] = useState('')
  const [instrucaoRefinar, setInstrucaoRefinar] = useState('')
  const [refinando, setRefinando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const compByCodigo = new Map(composicoesProprias.map(c => [c.codigo, c]))

  function reset() {
    setDescricaoObra('')
    setEstrutura(null)
    setErro('')
    setInstrucaoRefinar('')
  }

  function fechar() {
    reset()
    onClose()
  }

  async function chamarGeracao(itensAtuais?: EtapaEstrutura[], instrucao?: string) {
    const res = await fetch('/api/orcamento/estrutura-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        obraNome: obraName,
        descricao: descricaoObra.trim() || undefined,
        catalogo: composicoesProprias.map(c => ({ codigo: c.codigo, descricao: c.descricao, unidade: c.unidade })),
        itensAtuais,
        instrucao,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao gerar estrutura')
    return data.etapas as EtapaEstrutura[]
  }

  async function handleGerar() {
    setGerando(true)
    setErro('')
    try {
      setEstrutura(await chamarGeracao())
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar estrutura')
    } finally {
      setGerando(false)
    }
  }

  async function handleRefinar() {
    if (!estrutura || !instrucaoRefinar.trim()) return
    setRefinando(true)
    setErro('')
    try {
      setEstrutura(await chamarGeracao(estrutura, instrucaoRefinar.trim()))
      setInstrucaoRefinar('')
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao refinar estrutura')
    } finally {
      setRefinando(false)
    }
  }

  async function handleAplicar() {
    if (!estrutura) return
    setAplicando(true)
    setErro('')
    try {
      const { data: etapasExistentesRaw } = await supabase.from('etapas').select('id, nome, ordem').eq('obra_id', obraId)
      const etapasExistentes = (etapasExistentesRaw || []) as { id: string; nome: string; ordem: number | null }[]
      const etapaByNome = new Map(etapasExistentes.map(e => [normalizarNome(e.nome), e]))
      let proximaOrdem = etapasExistentes.reduce((max, e) => Math.max(max, e.ordem || 0), 0) + 1

      const paraInserir: Record<string, unknown>[] = []
      for (const etapa of estrutura) {
        const chave = normalizarNome(etapa.nome)
        let etapaRow = etapaByNome.get(chave)
        if (!etapaRow) {
          const { data: nova, error } = await supabase.from('etapas')
            .insert({ obra_id: obraId, nome: etapa.nome, status: 'planejada', ordem: proximaOrdem++ })
            .select('id, nome, ordem').single()
          if (error) throw error
          if (nova) { etapaRow = nova; etapaByNome.set(chave, nova) }
        }
        if (!etapaRow) continue

        for (const sub of etapa.subetapas) {
          for (const item of sub.composicoes) {
            const comp = compByCodigo.get(item.codigo)
            if (!comp) continue
            paraInserir.push({
              orcamento_id: orcamentoId,
              etapa_id: etapaRow.id,
              subetapa: sub.nome,
              composicao_id: comp.id,
              quantidade: item.quantidade,
              preco_unitario_snapshot: comp.custo_calculado || 0,
              descricao_snapshot: comp.descricao,
              codigo_snapshot: comp.codigo,
              unidade_snapshot: comp.unidade,
            })
          }
        }
      }

      if (paraInserir.length > 0) {
        const { error } = await supabase.from('orcamento_itens').insert(paraInserir)
        if (error) throw error
      }

      onApplied?.()
      fechar()
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao aplicar estrutura')
    } finally {
      setAplicando(false)
    }
  }

  const totalComposicoes = estrutura?.reduce((acc, e) => acc + e.subetapas.reduce((a, s) => a + s.composicoes.length, 0), 0) || 0
  const custoTotal = estrutura?.reduce((acc, e) => acc + e.subetapas.reduce((a, s) => a + s.composicoes.reduce((b, c) => {
    const comp = compByCodigo.get(c.codigo)
    return b + (comp?.custo_calculado || 0) * c.quantidade
  }, 0), 0), 0) || 0

  return (
    <Modal open={open} onClose={fechar} title="Gerar estrutura de orçamento com IA" size="lg">
      <div className="flex flex-col gap-4">
        {!estrutura ? (
          <>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              A IA sugere etapas, subetapas e composições (usando apenas o que já está cadastrado em Composições próprias) para "{obraName}".
              Nada é salvo até você revisar e aplicar.
            </p>
            <Input
              label="Contexto da obra (opcional)"
              value={descricaoObra}
              onChange={e => setDescricaoObra(e.target.value)}
              placeholder="Ex: casa térrea 120m², padrão médio, terreno plano..."
            />
            {erro && <p className="text-xs" style={{ color: 'var(--danger)' }}>{erro}</p>}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" className="flex-1" onClick={fechar}>Cancelar</Button>
              <Button className="flex-1" onClick={handleGerar} disabled={gerando} icon={gerando ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}>
                {gerando ? 'Gerando...' : 'Gerar estrutura'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {estrutura.length} etapa(s) · {totalComposicoes} composição(ões) · estimativa {formatCurrency(custoTotal)}
              </p>
            </div>

            <div className="flex flex-col gap-3 max-h-[45vh] overflow-y-auto pr-1">
              {estrutura.map((etapa, ei) => (
                <div key={ei} className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                  {etapa.subetapas.map((sub, si) => (
                    <div key={si} className="mb-2 last:mb-0 pl-3" style={{ borderLeft: '2px solid var(--border)' }}>
                      {sub.nome && <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{sub.nome}</p>}
                      <ul className="flex flex-col gap-0.5">
                        {sub.composicoes.map((item, ci) => {
                          const comp = compByCodigo.get(item.codigo)
                          return (
                            <li key={ci} className="text-xs flex items-center justify-between gap-2" style={{ color: 'var(--text-primary)' }}>
                              <span>{comp?.descricao || item.codigo} <span style={{ color: 'var(--text-secondary)' }}>({item.quantidade} {comp?.unidade || ''})</span></span>
                              {comp?.custo_calculado != null && (
                                <span className="shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(comp.custo_calculado * item.quantidade)}</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={instrucaoRefinar}
                onChange={e => setInstrucaoRefinar(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRefinar()}
                placeholder="Pedir um ajuste antes de aplicar (opcional)"
                className="flex-1"
              />
              <Button variant="secondary" onClick={handleRefinar} disabled={!instrucaoRefinar.trim() || refinando} icon={refinando ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}>
                Refinar
              </Button>
            </div>

            {erro && <p className="text-xs" style={{ color: 'var(--danger)' }}>{erro}</p>}

            <div className="flex gap-3 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => setEstrutura(null)} icon={<XIcon size={14} />} disabled={aplicando}>
                Descartar
              </Button>
              <Button className="flex-1" onClick={handleAplicar} disabled={aplicando} icon={aplicando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}>
                {aplicando ? 'Aplicando...' : 'Aplicar estrutura'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
