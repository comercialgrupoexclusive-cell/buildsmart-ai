'use client'

import { useState } from 'react'
import { Dock } from './Dock'
import { Camada } from './Camada'
import { TelaTempo, TelaProcessos, TelaPlaceholder } from './telas'
import { DOCK_GLOBAL, DOCK_PROCESSO, PROCESSO_TESTE, type ItemDock } from './dock'

// Camada de navegação da nova experiência: Dock + telas glass SOBRE o sistema
// atual (o Levi e o panorama seguem ativos atrás). Só interface e navegação
// nesta etapa — nenhum módulo real é migrado.
export function Sistema() {
  const [contexto, setContexto] = useState<'global' | 'processo'>('global')
  const [aba, setAba] = useState<string | null>(null) // null = home (Levi à mostra)

  const itens: ItemDock[] = contexto === 'global' ? DOCK_GLOBAL : DOCK_PROCESSO

  const rotulo = (id: string | null) =>
    itens.find(i => i.id === id)?.rotulo ?? ''

  const selecionar = (id: string) => {
    // "Visão geral" no global é o home: fecha a camada e mostra o Levi.
    if (id === 'visao-geral' && contexto === 'global') {
      setAba(null)
      return
    }
    setAba(id)
  }

  const abrirProcesso = () => {
    setContexto('processo')
    setAba('visao-geral') // abre a visão geral do Processo
  }

  const sairProcesso = () => {
    setContexto('global')
    setAba(null)
  }

  const fechar = () => setAba(null)

  const renderCamada = () => {
    if (aba === null) return null
    if (aba === 'processos' && contexto === 'global') {
      return (
        <Camada titulo="Processos" contexto="Menu global" onFechar={fechar}>
          <TelaProcessos onAbrir={abrirProcesso} />
        </Camada>
      )
    }
    if (aba === 'tempo') {
      return (
        <Camada
          titulo="Tempo"
          contexto={contexto === 'processo' ? PROCESSO_TESTE.nome : 'Menu global'}
          onFechar={fechar}
        >
          <TelaTempo />
        </Camada>
      )
    }
    return (
      <Camada
        titulo={rotulo(aba)}
        contexto={contexto === 'processo' ? PROCESSO_TESTE.nome : 'Menu global'}
        onFechar={fechar}
      >
        <TelaPlaceholder nome={rotulo(aba)} />
      </Camada>
    )
  }

  return (
    <>
      {renderCamada()}
      <Dock
        itens={itens}
        ativo={aba ?? (contexto === 'global' ? 'visao-geral' : null)}
        contexto={contexto}
        nomeProcesso={PROCESSO_TESTE.nome}
        onSelecionar={selecionar}
        onSairProcesso={sairProcesso}
      />
    </>
  )
}
