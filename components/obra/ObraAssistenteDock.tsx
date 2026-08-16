'use client'

import { useState } from 'react'
import { ObraAssistenteIA } from './ObraAssistenteIA'

// Painel da Luiza fixo na parte inferior da tela — não usa backdrop nem trava
// a rolagem da página. Pode ser recolhido para uma barra fina (mantendo a
// conversa viva) para o usuário conferir as edições feitas por prompt sem
// perder o assistente de vista, ou fechado por completo.
export function ObraAssistenteDock({
  open, onClose, obraId, obraNome, obraUf, cronogramaId,
}: {
  open: boolean
  onClose: () => void
  obraId: string
  obraNome: string
  obraUf: string
  cronogramaId?: string
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (!open) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[140] flex justify-center px-3 pb-3 sm:px-4 sm:pb-4 pointer-events-none">
      <div
        className="w-full max-w-xl pointer-events-auto rounded-2xl shadow-2xl overflow-hidden animate-enter"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div style={collapsed ? undefined : { height: '58vh', maxHeight: 540, display: 'flex', flexDirection: 'column' }}>
          <ObraAssistenteIA
            obraId={obraId}
            obraNome={obraNome}
            obraUf={obraUf}
            cronogramaId={cronogramaId}
            heightClass="h-full"
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(c => !c)}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  )
}
