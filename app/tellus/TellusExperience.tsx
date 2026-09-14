'use client'

import dynamic from 'next/dynamic'
import { TellusPanels } from './TellusPanels'

// Canvas/WebGL só existe no navegador — carregado sem SSR pra não quebrar
// o build/prerender do Next (e pra não pagar o custo do three.js no HTML
// inicial, que ninguém lê antes do JS rodar de qualquer forma).
const TellusGlobe = dynamic(() => import('./TellusGlobe').then((m) => m.TellusGlobe), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-0 bg-[#050812]" />,
})

export function TellusExperience() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#050812] font-sans text-white">
      <TellusGlobe />
      <TellusPanels />
    </div>
  )
}
