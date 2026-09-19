'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getProcessoModuleDefinition,
  listarModulosDoProcesso,
  type Processo,
} from '@/lib/processo'
import { ProcessProvider } from '@/lib/processo/context'
import { Dock } from './Dock'
import { Camada } from './Camada'
import { TelaPlaceholder, TelaTempo } from './telas'
import { TelaProcessos } from './modulos/TelaProcessos'
import { TelaConfigGlobal } from './modulos/TelaConfigGlobal'
import { TelaVisaoGeral } from './modulos/TelaVisaoGeral'
import { TelaCaixaEntrada } from './modulos/TelaCaixaEntrada'
import { TelaPesquisa } from './modulos/TelaPesquisa'
import { TelaBoard } from './modulos/TelaBoard'
import { TelaFinanceiro } from './modulos/TelaFinanceiro'
import { TelaConfig } from './modulos/TelaConfig'
import { DOCK_GLOBAL, DOCK_PROCESSO, type ItemDock } from './dock-model'

// Navegação da nova experiência: Dock + camada glass SOBRE o ambiente (o Levi
// e o panorama seguem ativos atrás). Dentro de um Processo, as abas montam os
// módulos reais do BuildSmart — Pesquisa é o funil do Investidor, Board é o
// mesmo Excalidraw com a Planta 2D/3D dentro do contexto do imóvel, e
// Financeiro é o padrão Compras/Despesas já vinculado por `processo_id`.
// Tempo continua sendo placeholder de propósito: Tarefas já existe e a
// convergência das duas é decisão de produto, não desta etapa.
export function Sistema({ falando = false }: { falando?: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [contexto, setContexto] = useState<'global' | 'processo'>('global')
  const [aba, setAba] = useState<string | null>(null) // null = home (Levi à mostra)
  const [processo, setProcesso] = useState<Processo | null>(null)
  const [modulos, setModulos] = useState<string[]>([])

  const itens: ItemDock[] = contexto === 'global' ? DOCK_GLOBAL : DOCK_PROCESSO
  const rotulo = (id: string | null) => itens.find(i => i.id === id)?.rotulo ?? ''

  const carregarModulos = useCallback(async (processoId: string) => {
    try {
      const vinculos = await listarModulosDoProcesso(supabase, processoId)
      setModulos(
        vinculos
          .filter(v => v.enabled)
          .map(v => getProcessoModuleDefinition(v.module_key)?.label ?? v.module_key),
      )
    } catch {
      setModulos([])
    }
  }, [supabase])

  const processoId = processo?.id
  useEffect(() => {
    if (!processoId) return
    const t = window.setTimeout(() => { void carregarModulos(processoId) }, 0)
    return () => window.clearTimeout(t)
  }, [processoId, carregarModulos])

  const selecionar = (id: string) => {
    // "Visão geral" no global é o home: fecha a camada e mostra o Levi.
    if (id === 'visao-geral' && contexto === 'global') {
      setAba(null)
      return
    }
    setAba(id)
  }

  const abrirProcesso = (p: Processo) => {
    setProcesso(p)
    setContexto('processo')
    setAba('visao-geral')
  }

  const sairProcesso = () => {
    setContexto('global')
    setProcesso(null)
    setModulos([])
    setAba(null)
  }

  const fechar = () => setAba(null)

  const renderCamada = () => {
    if (aba === null) return null

    const contextoRotulo = contexto === 'processo' ? (processo?.nome ?? 'Processo') : 'Menu global'
    const envolver = (conteudo: React.ReactNode, extra?: { largo?: boolean; preencher?: boolean }) => (
      <Camada titulo={rotulo(aba)} contexto={contextoRotulo} onFechar={fechar} {...extra}>
        {conteudo}
      </Camada>
    )

    if (contexto === 'global') {
      if (aba === 'processos') return envolver(<TelaProcessos onAbrir={abrirProcesso} />)
      if (aba === 'tempo') return envolver(<TelaTempo />)
      if (aba === 'config') return envolver(<TelaConfigGlobal />)
      return envolver(<TelaPlaceholder nome={rotulo(aba)} />)
    }

    if (!processo) return null

    // Todo módulo do Processo roda dentro do ProcessProvider, como em
    // /processos/[id] — quem chamar useProcessContext() encontra o mesmo
    // contrato.
    const dentro = (conteudo: React.ReactNode, extra?: { largo?: boolean; preencher?: boolean }) =>
      envolver(<ProcessProvider processoId={processo.id}>{conteudo}</ProcessProvider>, extra)

    switch (aba) {
      case 'visao-geral':
        return dentro(<TelaVisaoGeral processo={processo} modulos={modulos} onAtualizado={setProcesso} />)
      case 'caixa-entrada':
        return dentro(<TelaCaixaEntrada processoId={processo.id} />)
      case 'pesquisa':
        return dentro(<TelaPesquisa />, { largo: true })
      case 'board':
        return dentro(<TelaBoard processoId={processo.id} />, { largo: true, preencher: true })
      case 'financeiro':
        return dentro(<TelaFinanceiro processoId={processo.id} />, { largo: true })
      case 'config':
        return dentro(<TelaConfig processoId={processo.id} onMudou={() => carregarModulos(processo.id)} />)
      case 'tempo':
        return dentro(<TelaTempo />)
      default:
        return dentro(<TelaPlaceholder nome={rotulo(aba)} />)
    }
  }

  return (
    <>
      {renderCamada()}
      <Dock
        itens={itens}
        ativo={aba ?? (contexto === 'global' ? 'visao-geral' : null)}
        contexto={contexto}
        nomeProcesso={processo?.nome}
        falando={falando}
        onSelecionar={selecionar}
        onSairProcesso={sairProcesso}
      />
    </>
  )
}
