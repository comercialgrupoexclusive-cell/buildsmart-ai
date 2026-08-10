'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

type Eixo = 'mao_obra' | 'gerenciamento'
type Fonte = { id: string; tabela: 'orcamento_itens' | 'orcamento_item_insumos'; quantidade: number; valor: number; manual?: boolean }
type Grupo = { chave: string; etapa: string; subetapa: string; valorOriginal: number; percentual: number; fontes: Fonte[] }
type Item = {
  id: string; etapa_id: string | null; subetapa: string | null; tipo_linha: string; descricao_snapshot: string | null
  quantidade: number; preco_unitario_snapshot: number; valor_total_informado_snapshot: number | null; valor_total_manual_ativo: boolean
  classificacao_snapshot: string | null; subetapa_valor_manual: number | null; subetapa_valor_manual_ativo: boolean
  orcamento_item_insumos: { id: string; descricao_snapshot: string | null; quantidade_adotada: number | null; quantidade_calculada: number | null; preco_unitario_snapshot: number | null; classificacao_snapshot: string | null }[]
}

const normalizar = (valor: string | null) => (valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '_')
const maoObra = (classe: string | null, descricao: string | null) => normalizar(classe) === 'MAO_DE_OBRA' || /MAO_DE_OBRA/.test(normalizar(descricao))
const chave = (etapaId: string, subetapa: string) => `${etapaId}::${subetapa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')}`
const arredondar = (valor: number) => Math.round(valor * 10000) / 10000

export function ObraAjusteDistribuicao({ orcamentoId, eixo }: { obraId: string; orcamentoId: string; eixo: Eixo }) {
  const supabase = useMemo(() => createClient(), [])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [totalFixo, setTotalFixo] = useState(0)
  const [percentualGerenciamento, setPercentualGerenciamento] = useState(0)
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: orcamento }, { data: itensData }] = await Promise.all([
      supabase.from('orcamentos').select('gerenciamento_percentual,gerenciamento_distribuicao').eq('id', orcamentoId).single(),
      supabase.from('orcamento_itens').select('id,etapa_id,subetapa,tipo_linha,descricao_snapshot,quantidade,preco_unitario_snapshot,valor_total_informado_snapshot,valor_total_manual_ativo,classificacao_snapshot,subetapa_valor_manual,subetapa_valor_manual_ativo,orcamento_item_insumos(id,descricao_snapshot,quantidade_adotada,quantidade_calculada,preco_unitario_snapshot,classificacao_snapshot)').eq('orcamento_id', orcamentoId),
    ])
    const itens = (itensData || []) as Item[]
    const etapaIds = [...new Set(itens.map(item => item.etapa_id).filter((id): id is string => Boolean(id)))]
    const { data: etapasData } = etapaIds.length ? await supabase.from('etapas').select('id,nome,ordem').in('id', etapaIds) : { data: [] }
    const etapas = new Map(((etapasData || []) as { id: string; nome: string; ordem: number }[]).map(item => [item.id, item]))
    const mapa = new Map<string, Grupo>()
    const obter = (item: Item) => {
      const etapaId = item.etapa_id || 'sem-etapa'
      const sub = item.subetapa?.trim() || 'Sem subetapa'
      const id = chave(etapaId, sub)
      let grupo = mapa.get(id)
      if (!grupo) { grupo = { chave: id, etapa: etapas.get(etapaId)?.nome || 'Sem etapa', subetapa: sub, valorOriginal: 0, percentual: 0, fontes: [] }; mapa.set(id, grupo) }
      return grupo
    }

    if (eixo === 'mao_obra') {
      for (const item of itens) {
        if (item.tipo_linha === 'subetapa') continue
        const grupo = obter(item)
        if (maoObra(item.classificacao_snapshot, item.descricao_snapshot)) {
          const quantidade = Number(item.quantidade || 0)
          const valor = item.valor_total_manual_ativo ? Number(item.valor_total_informado_snapshot || 0) : quantidade * Number(item.preco_unitario_snapshot || 0)
          if (valor > 0) grupo.fontes.push({ id: item.id, tabela: 'orcamento_itens', quantidade, valor, manual: item.valor_total_manual_ativo })
        }
        for (const insumo of item.orcamento_item_insumos || []) if (maoObra(insumo.classificacao_snapshot, insumo.descricao_snapshot)) {
          const quantidade = Number(insumo.quantidade_adotada ?? insumo.quantidade_calculada ?? 0)
          const valor = quantidade * Number(insumo.preco_unitario_snapshot || 0)
          if (valor > 0) grupo.fontes.push({ id: insumo.id, tabela: 'orcamento_item_insumos', quantidade, valor })
        }
      }
      for (const grupo of mapa.values()) grupo.valorOriginal = grupo.fontes.reduce((soma, fonte) => soma + fonte.valor, 0)
    } else {
      const manuais = new Map<string, number>()
      for (const item of itens) {
        const grupo = obter(item)
        if (item.tipo_linha === 'subetapa') { if (item.subetapa_valor_manual_ativo) manuais.set(grupo.chave, Number(item.subetapa_valor_manual || 0)); continue }
        grupo.valorOriginal += item.valor_total_manual_ativo ? Number(item.valor_total_informado_snapshot || 0) : Number(item.quantidade || 0) * Number(item.preco_unitario_snapshot || 0)
      }
      for (const grupo of mapa.values()) if (manuais.has(grupo.chave)) grupo.valorOriginal = manuais.get(grupo.chave) || 0
    }

    const validos = [...mapa.values()].filter(grupo => grupo.valorOriginal > 0 && (eixo === 'gerenciamento' || grupo.fontes.length > 0))
    const base = validos.reduce((soma, grupo) => soma + grupo.valorOriginal, 0)
    const pctGer = Number(orcamento?.gerenciamento_percentual || 0)
    const total = eixo === 'gerenciamento' ? base * pctGer / 100 : base
    const distribuicao = (orcamento?.gerenciamento_distribuicao || {}) as Record<string, number>
    for (const grupo of validos) grupo.percentual = eixo === 'gerenciamento' && Number.isFinite(Number(distribuicao[grupo.chave]))
      ? Number(distribuicao[grupo.chave])
      : base > 0 ? grupo.valorOriginal / base * 100 : 0
    setGrupos(validos.sort((a, b) => a.etapa.localeCompare(b.etapa, 'pt-BR') || a.subetapa.localeCompare(b.subetapa, 'pt-BR')))
    setTotalFixo(total); setPercentualGerenciamento(pctGer); setLoading(false)
  }, [supabase, orcamentoId, eixo])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const distribuido = grupos.reduce((soma, grupo) => soma + totalFixo * grupo.percentual / 100, 0)
  const diferenca = totalFixo - distribuido
  const somaPct = grupos.reduce((soma, grupo) => soma + grupo.percentual, 0)
  const valido = grupos.length > 0 && Math.abs(somaPct - 100) <= 0.01
  const etapas = [...new Set(grupos.map(grupo => grupo.etapa))]

  function alterarGrupo(chaveGrupo: string, percentual: number) {
    setGrupos(atual => atual.map(grupo => grupo.chave === chaveGrupo ? { ...grupo, percentual: arredondar(Math.max(0, percentual)) } : grupo))
  }
  function alterarEtapa(etapa: string, percentualAlvo: number) {
    setGrupos(atual => {
      const filhos = atual.filter(grupo => grupo.etapa === etapa)
      const atualPct = filhos.reduce((soma, grupo) => soma + grupo.percentual, 0)
      return atual.map(grupo => grupo.etapa !== etapa ? grupo : { ...grupo, percentual: arredondar(atualPct > 0 ? grupo.percentual * percentualAlvo / atualPct : percentualAlvo / filhos.length) })
    })
  }

  async function salvar() {
    if (!valido) return
    setSaving(true)
    try {
      if (eixo === 'gerenciamento') {
        await supabase.from('orcamentos').update({ gerenciamento_distribuicao: Object.fromEntries(grupos.map(grupo => [grupo.chave, grupo.percentual])) }).eq('id', orcamentoId)
      } else {
        const operacoes = grupos.flatMap(grupo => {
          const alvo = totalFixo * grupo.percentual / 100
          const fator = grupo.valorOriginal > 0 ? alvo / grupo.valorOriginal : 0
          return grupo.fontes.map(fonte => {
            const novoValor = fonte.valor * fator
            const preco = fonte.quantidade > 0 ? novoValor / fonte.quantidade : 0
            if (fonte.tabela === 'orcamento_itens') return supabase.from(fonte.tabela).update(fonte.manual ? { preco_unitario_snapshot: preco, valor_total_informado_snapshot: novoValor } : { preco_unitario_snapshot: preco }).eq('id', fonte.id)
            return supabase.from(fonte.tabela).update({ preco_unitario_snapshot: preco }).eq('id', fonte.id)
          })
        })
        const resultados = await Promise.all(operacoes)
        const erro = resultados.find(resultado => resultado.error)?.error
        if (erro) throw erro
      }
      window.dispatchEvent(new CustomEvent('buildsmart:obra-data-changed'))
      await carregar()
    } catch (error) { alert(`Não foi possível salvar os ajustes: ${error instanceof Error ? error.message : 'erro inesperado'}`) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
  return <div className="flex flex-col gap-3 pb-16">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Resumo label={eixo === 'gerenciamento' ? `Total de gerenciamento (${percentualGerenciamento.toLocaleString('pt-BR')}%)` : 'Total de mão de obra'} valor={totalFixo} />
      <Resumo label="Distribuído" valor={distribuido} />
      <Resumo label={Math.abs(diferenca) <= 0.01 ? 'Distribuição fechada' : diferenca > 0 ? 'Saldo a distribuir' : 'Excesso'} valor={Math.abs(diferenca) <= 0.01 ? 0 : Math.abs(diferenca)} cor={Math.abs(diferenca) <= 0.01 ? 'var(--success)' : diferenca > 0 ? 'var(--warning)' : 'var(--danger)'} />
    </div>
    <div className="card p-3 text-xs" style={{ color: valido ? 'var(--success)' : 'var(--text-secondary)' }}>
      Distribuição: <strong>{somaPct.toFixed(2)}%</strong>. {valido ? 'Total fechado e pronto para salvar.' : 'Ajuste os valores ou percentuais até completar 100%.'}
    </div>
    {etapas.map(etapa => {
      const filhos = grupos.filter(grupo => grupo.etapa === etapa)
      const pct = filhos.reduce((soma, grupo) => soma + grupo.percentual, 0)
      const aberta = abertas[etapa] !== false
      return <div key={etapa} className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" style={{ background: 'var(--bg-secondary)' }}>
          <button onClick={() => setAbertas(v => ({ ...v, [etapa]: !aberta }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">{aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span className="truncate text-sm font-semibold">{etapa}</span></button>
          <Editor valor={totalFixo * pct / 100} percentual={pct} total={totalFixo} onChange={valor => alterarEtapa(etapa, valor)} />
        </div>
        {aberta && filhos.map(grupo => <div key={grupo.chave} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:pl-8" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="min-w-0 flex-1"><p className="truncate text-sm">{grupo.subetapa}</p><p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Base atual {formatCurrency(grupo.valorOriginal)}</p></div>
          <Editor valor={totalFixo * grupo.percentual / 100} percentual={grupo.percentual} total={totalFixo} onChange={valor => alterarGrupo(grupo.chave, valor)} />
        </div>)}
      </div>
    })}
    <div className="sticky bottom-3 flex justify-end"><button onClick={salvar} disabled={!valido || saving} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"><Save size={15} />{saving ? 'Salvando...' : 'Salvar ajustes'}</button></div>
  </div>
}

function Editor({ valor, percentual, total, onChange }: { valor: number; percentual: number; total: number; onChange: (percentual: number) => void }) {
  return <div className="grid w-full grid-cols-[minmax(0,1fr)_92px_112px] items-center gap-2 sm:w-[390px]">
    <input type="range" min={0} max={100} step={0.1} value={Math.min(100, percentual)} onChange={event => onChange(Number(event.target.value))} className="min-w-0 accent-[var(--accent)]" aria-label="Distribuição percentual" />
    <label className="relative"><input type="number" min={0} step={0.1} value={Number(percentual.toFixed(2))} onChange={event => onChange(Number(event.target.value))} className="input-base w-full py-1.5 pr-6 text-right text-xs font-semibold" /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-secondary)' }}>%</span></label>
    <label className="relative"><span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>R$</span><input type="number" min={0} step={0.01} value={Number(valor.toFixed(2))} onChange={event => onChange(total > 0 ? Number(event.target.value) / total * 100 : 0)} className="input-base w-full py-1.5 pl-7 text-right text-xs font-semibold" /></label>
  </div>
}

function Resumo({ label, valor, cor = 'var(--text-primary)' }: { label: string; valor: number; cor?: string }) {
  return <div className="card p-3"><p className="text-[11px] uppercase" style={{ color: 'var(--text-secondary)' }}>{label}</p><p className="mt-1 text-lg font-bold tabular-nums" style={{ color: cor }}>{formatCurrency(valor)}</p></div>
}
