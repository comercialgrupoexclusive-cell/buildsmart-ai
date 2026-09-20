'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ProcessoPlantaBaixa } from '@/components/processo/planta-baixa/ProcessoPlantaBaixa'
import { Carregando, PrecisaSessao, SubAbas } from './comuns'

// Board do Processo — o MESMO ExcalidrawBoard que Obra, Projeto, Prospecção,
// Portal e components/processo/board/ProcessoBoard.tsx já usam, com a mesma
// persistência por `processo_id`. Aqui ele é montado direto (em vez de via
// ProcessoBoard) só porque a camada glass já desenha o título e a moldura que
// aquele wrapper acrescentaria: é o mesmo quadro, o mesmo dado, sem um
// segundo Board.
const ExcalidrawBoard = dynamic(
  () => import('@/components/board/ExcalidrawBoard').then(m => m.ExcalidrawBoard),
  {
    ssr: false,
    loading: () => <Carregando texto="Carregando board…" />,
  },
)

type AbaBoard = 'board' | 'planta'

export function TelaBoard({ processoId }: { processoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [aba, setAba] = useState<AbaBoard>('board')
  const [temSessao, setTemSessao] = useState<boolean | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (vivo) setTemSessao(!!data.user)
    })()
    return () => { vivo = false }
  }, [supabase])

  if (temSessao === null) return <Carregando />
  if (!temSessao) return <PrecisaSessao modulo="O Board do Processo" />

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      {/* Planta Baixa mora dentro do contexto do Board/imóvel, não como um
          módulo solto no Dock — é o desenho do mesmo imóvel, em outra
          ferramenta. */}
      <SubAbas
        valor={aba}
        onMudar={setAba}
        abas={[
          { id: 'board', rotulo: 'Board' },
          { id: 'planta', rotulo: 'Planta 2D/3D' },
        ]}
      />

      {aba === 'board' ? (
        /* Wrapper com position:relative + dimensões definidas.
           O ExcalidrawBoard usa height:100% internamente, que só resolve
           quando o pai tem tamanho em px — absolute inset-0 garante isso
           independente da cadeia flex acima. */
        <div className="min-h-0 flex-1 relative rounded-2xl border border-white/10 bg-black/25" style={{ minHeight: '40svh' }}>
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <ExcalidrawBoard processoId={processoId} />
          </div>
        </div>
      ) : (
        <ProcessoPlantaBaixa processoId={processoId} />
      )}
    </div>
  )
}
