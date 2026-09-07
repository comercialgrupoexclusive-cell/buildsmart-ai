'use client'

// UI canônica do Orçamento no Processo — Fase B do rebuild "Processo ->
// Orçamento -> Actions/Services/Repositories -> dados do Orçamento".
// Substitui, só na aba Orçamento de /processos/[id], o <ObraOrcamento>
// legado (concebido para Obra, com Luiza/materiais/tabela densa/
// drag-and-drop que não fazem sentido aqui). Não toca em
// components/obra/ObraOrcamento.tsx nem nas rotas /obras e /projetos.
//
// Fonte única de valor: orcamento_arvore_valores() (RPC) — nenhum total é
// recalculado aqui, só agrupado (ver types.ts, calcularTotal/agruparPorEtapa).
// Escrita (adicionar/editar/excluir item) passa sempre por
// lib/orcamento/inserir-item.ts ou update/delete direto em orcamento_itens
// pelas colunas snapshot — nunca uma fórmula paralela de valor.
// Navegação é uma pilha de telas em memória (Resumo → Etapa → Grupo →
// Serviço/Adicionar), sem rotas novas — mobile-first, sem tabela desktop
// comprimida.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LinhaArvore } from './types'
import { OrcamentoResumo } from './OrcamentoResumo'
import { OrcamentoEtapa } from './OrcamentoEtapa'
import { OrcamentoGrupo } from './OrcamentoGrupo'
import { OrcamentoItemDetalhe } from './OrcamentoItemDetalhe'
import { OrcamentoAdicionarItem } from './OrcamentoAdicionarItem'

type Vista =
  | { tipo: 'resumo' }
  | { tipo: 'etapa'; etapaId: string }
  | { tipo: 'grupo'; etapaId: string; grupoId: string }
  | { tipo: 'item'; itemId: string; voltar: Vista }
  | { tipo: 'adicionar'; etapaId: string; grupoId: string | null; voltar: Vista }

type OrcamentoInfo = {
  id: string
  versao: number
  status: string
  bdi_percentual: number
  uf: string
}

export function ProcessoOrcamento({ orcamentoId, processoNome }: { orcamentoId: string; processoNome: string }) {
  const supabase = createClient()
  const [orcamento, setOrcamento] = useState<OrcamentoInfo | null>(null)
  const [linhas, setLinhas] = useState<LinhaArvore[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>({ tipo: 'resumo' })

  const carregar = useCallback(async () => {
    setErro(null)
    const [{ data: orc, error: orcError }, { data: arvore, error: arvoreError }] = await Promise.all([
      supabase.from('orcamentos').select('id, versao, status, bdi_percentual, uf').eq('id', orcamentoId).single(),
      supabase.rpc('orcamento_arvore_valores', { p_orcamento_ids: [orcamentoId] }),
    ])
    if (orcError || arvoreError) {
      setErro(orcError?.message || arvoreError?.message || 'Não foi possível carregar o orçamento.')
      setLoading(false)
      return
    }
    setOrcamento(orc as OrcamentoInfo)
    setLinhas((arvore || []) as LinhaArvore[])
    setLoading(false)
  }, [supabase, orcamentoId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (erro || !orcamento) {
    return (
      <div className="card p-5 text-sm" style={{ color: 'var(--danger)' }}>
        {erro || 'Orçamento não encontrado.'}
      </div>
    )
  }

  if (vista.tipo === 'resumo') {
    return (
      <OrcamentoResumo
        processoNome={processoNome}
        orcamento={orcamento}
        linhas={linhas}
        onAbrirEtapa={etapaId => setVista({ tipo: 'etapa', etapaId })}
      />
    )
  }

  if (vista.tipo === 'etapa') {
    return (
      <OrcamentoEtapa
        etapaId={vista.etapaId}
        linhas={linhas}
        onVoltar={() => setVista({ tipo: 'resumo' })}
        onAbrirGrupo={grupoId => setVista({ tipo: 'grupo', etapaId: vista.etapaId, grupoId })}
        onAbrirItem={itemId => setVista({ tipo: 'item', itemId, voltar: vista })}
        onAdicionarItem={() => setVista({ tipo: 'adicionar', etapaId: vista.etapaId, grupoId: null, voltar: vista })}
      />
    )
  }

  if (vista.tipo === 'grupo') {
    return (
      <OrcamentoGrupo
        etapaId={vista.etapaId}
        grupoId={vista.grupoId}
        linhas={linhas}
        onVoltar={() => setVista({ tipo: 'etapa', etapaId: vista.etapaId })}
        onAbrirItem={itemId => setVista({ tipo: 'item', itemId, voltar: vista })}
        onAdicionarItem={() => setVista({ tipo: 'adicionar', etapaId: vista.etapaId, grupoId: vista.grupoId, voltar: vista })}
      />
    )
  }

  if (vista.tipo === 'adicionar') {
    return (
      <OrcamentoAdicionarItem
        orcamentoId={orcamentoId}
        etapaId={vista.etapaId}
        grupoId={vista.grupoId}
        linhas={linhas}
        uf={orcamento.uf}
        onVoltar={() => setVista(vista.voltar)}
        onInserido={async () => { await carregar(); setVista(vista.voltar) }}
      />
    )
  }

  return (
    <OrcamentoItemDetalhe
      itemId={vista.itemId}
      linhas={linhas}
      onVoltar={() => setVista(vista.voltar)}
      onAtualizado={carregar}
      onExcluido={async () => { await carregar(); setVista(vista.voltar) }}
    />
  )
}
