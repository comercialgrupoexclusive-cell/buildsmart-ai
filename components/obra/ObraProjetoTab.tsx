'use client'

import { useState } from 'react'
import { LayoutDashboard, FileText, MessageSquareText, Info } from 'lucide-react'
import { Obra } from '@/lib/types'
import { ObraVisaoGeral } from '@/components/obra/ObraVisaoGeral'
import { ObraArquivos } from '@/components/obra/ObraArquivos'
import { ObraBoard } from '@/components/obra/ObraBoard'
import { ObraPortalBoard } from '@/components/obra/ObraPortalBoard'

type SubTab = 'dados' | 'documentos' | 'board' | 'portal'

const TABS: { id: SubTab; label: string; icon: typeof Info }[] = [
  { id: 'dados', label: 'Dados gerais', icon: Info },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'board', label: 'Board', icon: LayoutDashboard },
  { id: 'portal', label: 'Portal do Cliente', icon: MessageSquareText },
]

export function ObraProjetoTab({ obraId, obra, onEdit }: { obraId: string; obra: Obra; onEdit: () => void }) {
  const [subTab, setSubTab] = useState<SubTab>('dados')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 p-1 rounded-lg w-fit overflow-x-auto max-w-full" style={{ background: 'var(--bg-secondary)' }}>
        {TABS.map(t => {
          const Ic = t.icon
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
              style={subTab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              <Ic size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'dados' && <ObraVisaoGeral obra={obra} onEdit={onEdit} />}
      {subTab === 'documentos' && <ObraArquivos obraId={obraId} />}
      {subTab === 'board' && <ObraBoard obraId={obraId} />}
      {subTab === 'portal' && <ObraPortalBoard obraId={obraId} />}
    </div>
  )
}
