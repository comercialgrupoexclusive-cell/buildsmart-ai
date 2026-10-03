'use client'

// Barra fixa "Salvar / Descartar" para celular e tablet. Nessas telas o cartão de
// detalhes aparece embaixo da linha e o botão Salvar do topo sai da tela assim que
// o usuário rola para editar os campos de baixo — então, com edição pendente, a
// barra fica sempre à vista, acima da barra do chat. Interface pura: só recebe o
// estado e avisa as ações. No desktop (lg) o painel lateral já mostra o Salvar.

import { Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type Props = {
  salvando: boolean
  onSalvar: () => void
  onDescartar: () => void
}

export function BarraSalvar({ salvando, onSalvar, onDescartar }: Props) {
  return (
    <div
      role="region"
      aria-label="Alterações não salvas"
      className={
        'fixed inset-x-3 bottom-24 z-30 flex items-center gap-2 ' +
        'rounded-xl p-2 shadow-lg lg:hidden'
      }
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <span className="flex-1 pl-2 text-xs font-medium" style={{ color: 'var(--warning)' }}>
        Alterações não salvas
      </span>
      <Button size="sm" variant="ghost" onClick={onDescartar} disabled={salvando}>
        Descartar
      </Button>
      <Button size="sm" icon={<Save size={14} />} onClick={onSalvar} loading={salvando}>
        Salvar
      </Button>
    </div>
  )
}
