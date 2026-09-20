import type { Metadata } from 'next'
import { ExperienciaMundo } from '../ExperienciaMundo'

export const metadata: Metadata = {
  title: 'Mundo — Prospecção Gravataí',
}

export default function ExperimentoMundoPage() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-black [overscroll-behavior:none]">
      <ExperienciaMundo />
    </main>
  )
}
