import type { Metadata } from 'next'
import { Panorama360 } from './Panorama360'
import { CaixaConversa } from './CaixaConversa'

export const metadata: Metadata = {
  title: 'Experimento 360',
}

export default function Experimento360Page() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-black [overscroll-behavior:none]">
      <Panorama360 />
      {/* O centro fica deliberadamente livre: é onde o orbe de partículas
          entra na próxima etapa, entre o fundo e a caixa de conversa. */}
      <CaixaConversa />
    </main>
  )
}
