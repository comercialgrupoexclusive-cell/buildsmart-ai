'use client'

import type { Atividade } from './conversa'

export type FaseAtividade = 'oculto' | 'trabalhando' | 'concluido'

type Props = {
  atividade: Atividade | null
  fase: FaseAtividade
}

// Cápsula discreta no canto superior direito: mostra qual agente e qual
// habilidade estão "trabalhando" durante a espera pela resposta. É demonstração
// local — nenhum agente ou ferramenta real roda aqui.
export function AtividadeHabilidade({ atividade, fase }: Props) {
  const visivel = fase !== 'oculto' && atividade !== null
  const trabalhando = fase === 'trabalhando'

  return (
    <div
      className="pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 transition-all duration-500 ease-out"
      style={{
        opacity: visivel ? 1 : 0,
        transform: visivel ? 'translateY(0)' : 'translateY(-8px)',
      }}
      aria-hidden={!visivel}
    >
      <div className="relative w-[236px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl">
        {/* Traço luminoso percorrendo a borda enquanto trabalha. */}
        <div
          className="pointer-events-none absolute -inset-[1.5px] rounded-2xl"
          hidden={!trabalhando}
        >
          <div
            className="absolute -inset-[60%]"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, transparent 285deg, rgba(150,120,255,0.5) 320deg, rgba(120,220,255,0.95) 350deg, transparent 360deg)',
              animation: 'orbe-borda 2.4s linear infinite',
            }}
          />
        </div>

        <div className="relative m-[1.5px] rounded-2xl border border-white/10 bg-[linear-gradient(150deg,rgba(10,16,34,0.72),rgba(14,24,48,0.66))] px-3.5 py-2.5 backdrop-blur-xl">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/40">Atividade</span>
            <span className="text-[9.5px] uppercase tracking-[0.14em] text-white/25">· Demonstração</span>
          </div>

          <Linha
            cor="violeta"
            rotulo="Agente"
            texto={atividade?.agente ?? ''}
            concluido={fase === 'concluido'}
          />
          <Linha
            cor="ciano"
            rotulo="Habilidade"
            texto={atividade?.habilidade ?? ''}
            concluido={fase === 'concluido'}
          />
        </div>
      </div>
    </div>
  )
}

function Linha({
  cor,
  rotulo,
  texto,
  concluido,
}: {
  cor: 'violeta' | 'ciano'
  rotulo: string
  texto: string
  concluido: boolean
}) {
  const ponto = cor === 'violeta' ? 'bg-violet-400' : 'bg-cyan-300'
  const marca = cor === 'violeta' ? 'text-violet-300/90' : 'text-cyan-200/90'
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className={`size-1.5 shrink-0 rounded-full ${ponto} shadow-[0_0_6px_currentColor]`} />
      <span className={`shrink-0 text-[11px] font-medium ${marca}`}>{rotulo}</span>
      <span className="truncate text-[11px] text-white/60">
        {concluido ? 'Concluído' : texto}
      </span>
    </div>
  )
}
