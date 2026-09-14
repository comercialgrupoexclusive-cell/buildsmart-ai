'use client'

import { useEffect, useRef } from 'react'
import type { Mensagem } from './conversa'

export function Conversa({ mensagens }: { mensagens: Mensagem[] }) {
  const listaRef = useRef<HTMLDivElement>(null)
  const ultima = mensagens[mensagens.length - 1]

  useEffect(() => {
    const el = listaRef.current
    if (el) el.scrollTop = el.scrollHeight
    // O texto cresce palavra a palavra, então a rolagem precisa acompanhar o
    // conteúdo da última mensagem, não só a chegada de mensagens novas.
  }, [mensagens.length, ultima?.texto])

  if (mensagens.length === 0) return null

  return (
    <div className="mb-3">
      {/* Fora da área rolável: dentro dela o selo ficava por cima da primeira
          mensagem sempre que a conversa estava no topo. */}
      <div className="mb-1.5 flex justify-end pr-2">
        <span className="rounded-full border border-cyan-200/15 bg-black/45 px-2 py-0.5 text-[10.5px] uppercase tracking-[0.14em] text-cyan-100/55 backdrop-blur-md">
          Demonstração
        </span>
      </div>
      <div
        ref={listaRef}
        className="max-h-[34vh] overflow-y-auto overscroll-contain rounded-[22px] border border-white/8 bg-black/22 px-4 py-3.5 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,transparent,black_14px)] sm:max-h-[38vh]"
      >
        <div className="flex flex-col gap-2.5">
          {mensagens.map(m => (
            <div key={m.id} className={m.autor === 'voce' ? 'flex justify-end' : 'flex justify-start'}>
              <p
                className={
                  m.autor === 'voce'
                    ? 'max-w-[85%] rounded-2xl rounded-br-md border border-cyan-200/15 bg-cyan-300/10 px-3.5 py-2 text-[14px] leading-relaxed text-white/88'
                    : 'max-w-[90%] rounded-2xl rounded-bl-md border border-white/8 bg-white/[0.045] px-3.5 py-2 text-[14px] leading-relaxed text-cyan-50/92'
                }
              >
                {m.texto}
                {m.autor === 'orbe' && m.texto === '' && (
                  <span className="inline-block h-[1em] w-px align-middle" />
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
