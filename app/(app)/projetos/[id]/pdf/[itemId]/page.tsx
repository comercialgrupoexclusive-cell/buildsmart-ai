'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PdfAnnotator } from '@/components/pdf/PdfAnnotator'

export default function PdfAnnotationPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id: projectId, itemId } = use(params)
  const router = useRouter()
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('board_items')
        .select('content')
        .eq('id', itemId)
        .single()

      if (error || !data?.content?.url) {
        setError(true)
        return
      }
      setPdf({ url: data.content.url, name: data.content.name ?? 'documento.pdf' })
    }
    load()
  }, [itemId])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p style={{ color: 'var(--text-secondary)' }}>PDF não encontrado.</p>
        <button
          onClick={() => router.push(`/projetos/${projectId}?tab=board`)}
          style={{ color: 'var(--accent)', fontSize: 14 }}
        >
          ← Voltar ao board
        </button>
      </div>
    )
  }

  if (!pdf) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <PdfAnnotator
      fileUrl={pdf.url}
      fileName={pdf.name}
      contextType="projeto"
      contextId={projectId}
      itemId={itemId}
      onClose={() => router.push(`/projetos/${projectId}?tab=board`)}
    />
  )
}
