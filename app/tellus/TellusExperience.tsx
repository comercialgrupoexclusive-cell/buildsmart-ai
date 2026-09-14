'use client'

import dynamic from 'next/dynamic'
import { TellusPanels } from './TellusPanels'

// three-globe toca `window` já no import do módulo, então a cena inteira
// precisa ficar fora do SSR/prerender — não basta adiar a renderização.
const TellusGlobe = dynamic(() => import('./TellusGlobe').then((m) => m.TellusGlobe), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-0 bg-[#030610]" />,
})

export function TellusExperience() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#030610] font-sans text-white">
      <TellusGlobe />
      <TellusPanels />
    </div>
  )
}
