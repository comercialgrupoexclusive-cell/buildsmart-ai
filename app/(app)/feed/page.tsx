'use client'

// Feed da Organização (seção 12). Mostra as movimentações de todos os processos
// acessíveis à sessão (RLS por organização). Publicação escolhe o processo.
// O feed_items/ObraFeedManager legado (obra) sai daqui — obra é legado.

import { ProcessoFeed } from '@/components/feed/ProcessoFeed'

export default function FeedPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Feed</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          As atualizações de todos os processos da organização.
        </p>
      </div>
      <ProcessoFeed />
    </div>
  )
}
