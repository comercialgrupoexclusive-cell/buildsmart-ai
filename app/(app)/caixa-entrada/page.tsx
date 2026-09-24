'use client'

import { CaixaEntrada } from '@/components/caixa-entrada/CaixaEntrada'
import { PageHeader } from '@/components/ui/PageHeader'

// Caixa global: tudo que foi jogado na caixa, inclusive o que nasceu dentro
// de um Processo. Sem processoId, o que você escrever aqui não pertence a
// nenhum Processo — é justamente o caso de "ainda não sei o que isso é".

export default function CaixaEntradaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Caixa de Entrada"
        subtitle="Joga tudo aqui. A IA lê e vira tarefa quando faz sentido."
      />
      <CaixaEntrada />
    </div>
  )
}
