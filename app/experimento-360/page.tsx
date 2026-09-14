import type { Metadata } from 'next'
import { Panorama360 } from './Panorama360'
import { Experiencia } from './Experiencia'

export const metadata: Metadata = {
  title: 'Experimento 360',
}

export default function Experimento360Page() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-black [overscroll-behavior:none]">
      <Panorama360 />
      <Experiencia />
    </main>
  )
}
