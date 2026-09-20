'use client'

import { useState } from 'react'
import { Camada } from './Camada'
import { ProspeccaoMercado } from '@/components/investidor/ProspeccaoMercado'
import { createClient } from '@/lib/supabase/client'
import { criarEntradaTexto } from '@/lib/processo/caixa-entrada'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import type { ProspeccaoComparavel } from '@/lib/types'

type Props = {
  processoId: string
  prospeccaoId: string
  onFechar: () => void
}

// Plano de Trabalho: mesmo mecanismo de vidro que Camada já faz para os
// módulos atuais (3D recua, painel 2D quase full-screen), só que emoldurado
// como regime de trabalho, não como "abrir um módulo". Dentro, reaproveita
// ProspeccaoMercado inteiro sem reescrever nada. A decisão no rodapé grava
// como entrada na Caixa de Entrada — decisão volta pro Processo, sem
// inventar objeto novo.
export function PlanoDeTrabalho({ processoId, prospeccaoId, onFechar }: Props) {
  const [selecionados, setSelecionados] = useState<ProspeccaoComparavel[]>([])
  const [registrando, setRegistrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function registrarDecisao() {
    setErro(null)
    setRegistrando(true)
    try {
      const precos = selecionados.filter(c => c.preco != null).map(c => c.preco as number)
      const faixa = precos.length ? ` Faixa de ${formatCurrency(Math.min(...precos))} a ${formatCurrency(Math.max(...precos))}.` : ''
      const resumo = `Pesquisa de mercado revisada: ${selecionados.length} ${selecionados.length === 1 ? 'comparável selecionado' : 'comparáveis selecionados'}.${faixa}`
      await criarEntradaTexto(createClient(), processoId, resumo)
      onFechar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui registrar a decisão no Processo agora.')
    } finally {
      setRegistrando(false)
    }
  }

  return (
    <Camada titulo="Plano de Trabalho" contexto="Prospecção Gravataí" largo onFechar={onFechar}>
      <ProspeccaoMercado prospeccaoId={prospeccaoId} onSelecaoChange={setSelecionados} />

      {erro && <p className="mt-3 text-xs text-red-300">{erro}</p>}

      {selecionados.length > 0 && (
        <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 flex justify-end border-t border-white/10 bg-[rgba(10,16,34,0.85)] px-5 py-3 backdrop-blur-xl">
          <Button onClick={registrarDecisao} loading={registrando}>
            Registrar decisão no Processo ({selecionados.length})
          </Button>
        </div>
      )}
    </Camada>
  )
}
