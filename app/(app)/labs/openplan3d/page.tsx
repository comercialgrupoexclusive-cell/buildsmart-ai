'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// PoC isolada — OpenPlan3D (editor paramétrico 2D/3D vendorizado em
// vendor/openplan3d/, commit pinado — ver vendor/openplan3d/VENDOR.md e
// NOTA_POC_OPENPLAN3D.md na raiz do repo). Rota deliberadamente desconectada
// do módulo Planta Baixa (Axonometra) e de qualquer dado do Processo: só
// prova se o motor consegue entregar parede+porta+janela+ambiente com
// sincronização 2D/3D real, inclusive em celular. Sem postMessage — o app
// vendorizado é 100% autocontido (salva/carrega no localStorage/IndexedDB do
// próprio navegador via seu mecanismo nativo).
export default function OpenPlan3DLabPage() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <Link
          href="/dashboard"
          className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            PoC — OpenPlan3D (laboratório)
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Isolado do Processo/Planta Baixa — não salva no Supabase.
          </p>
        </div>
      </div>
      <div className="flex-1 relative">
        <iframe
          src="/labs/openplan3d/index.html"
          className="w-full h-full border-0"
          title="PoC OpenPlan3D"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
        />
      </div>
    </div>
  )
}
