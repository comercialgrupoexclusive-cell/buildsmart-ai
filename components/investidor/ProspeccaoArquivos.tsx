'use client'

// Aba "Arquivos" da Prospecção (Laboratório Investidor, Rodada 2) — adaptado
// de components/obra/ObraArquivos.tsx, reaproveitando o mesmo padrão de
// lista/upload/remoção. Não reaproveita a tabela `obra_files` porque
// `obra_files.obra_id` é NOT NULL e a tabela carrega colunas específicas de
// obra/portal (publicado_cliente, source_type/source_id de IA) que não se
// aplicam a uma Prospecção — ver RELATORIO_INVESTIDOR_RODADA_02.md. Usa a
// tabela nova e pequena `prospeccao_arquivos` e o mesmo bucket de storage
// público já usado por Projetos (`project-files`), só com prefixo próprio.
// Sem anotação de PDF (PdfAnnotator está fechado em contextType
// 'obra'|'projeto' — fora de escopo ampliar isso nesta rodada só por isto).
import { useEffect, useRef, useState } from 'react'
import { FileText, ImageIcon, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ProspeccaoArquivo } from '@/lib/types'

function categoriaPorArquivo(file: File): string {
  const nome = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return 'imagem'
  if (nome.includes('edital')) return 'edital'
  if (nome.includes('matricula') || nome.includes('matrícula')) return 'matricula'
  return 'outro'
}

const CATEGORIA_LABEL: Record<string, string> = {
  imagem: 'Imagem',
  edital: 'Edital',
  matricula: 'Matrícula',
  outro: 'Outro',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ProspeccaoArquivos({ prospeccaoId }: { prospeccaoId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arquivos, setArquivos] = useState<ProspeccaoArquivo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('prospeccao_arquivos')
      .select('*')
      .eq('prospeccao_id', prospeccaoId)
      .order('criado_em', { ascending: false })
    setArquivos((data ?? []) as ProspeccaoArquivo[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [prospeccaoId])

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    const supabase = createClient()
    const novos = []
    for (const file of Array.from(files)) {
      let url: string | null = null
      try {
        const ext = file.name.split('.').pop() || 'bin'
        const path = `prospeccoes/${prospeccaoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage.from('project-files').upload(path, file)
        if (!upErr) {
          url = supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
        }
      } catch {
        url = null
      }
      novos.push({
        prospeccao_id: prospeccaoId,
        nome: file.name,
        tipo: file.type || 'arquivo',
        tamanho: file.size,
        categoria: categoriaPorArquivo(file),
        url,
      })
    }
    const { data } = await supabase.from('prospeccao_arquivos').insert(novos).select('*')
    if (data?.length) setArquivos(prev => [...(data as ProspeccaoArquivo[]), ...prev])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function remover(id: string) {
    setArquivos(prev => prev.filter(a => a.id !== id))
    const supabase = createClient()
    await supabase.from('prospeccao_arquivos').delete().eq('id', id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Arquivos da prospecção</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Edital, matrícula, fotos e outros documentos da oportunidade.
            </p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 flex-shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <Upload size={15} /> {uploading ? 'Enviando...' : 'Anexar arquivo'}
          </button>
        </div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => void handleFiles(e.target.files)} />
      </div>

      {arquivos.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText size={32} className="mx-auto mb-3" style={{ color: 'var(--text-secondary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum arquivo anexado</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Comece anexando o edital ou fotos do imóvel.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {arquivos.map(arquivo => (
            <div key={arquivo.id} className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                {arquivo.categoria === 'imagem'
                  ? <ImageIcon size={18} style={{ color: 'var(--accent)' }} />
                  : <FileText size={18} style={{ color: 'var(--accent)' }} />}
              </div>
              <div className="min-w-0 flex-1">
                {arquivo.url ? (
                  <a href={arquivo.url} target="_blank" rel="noreferrer" className="text-sm font-semibold truncate block hover:underline" style={{ color: 'var(--text-primary)' }}>
                    {arquivo.nome}
                  </a>
                ) : (
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{arquivo.nome}</p>
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {CATEGORIA_LABEL[arquivo.categoria] || arquivo.categoria} · {formatSize(arquivo.tamanho)} · {new Date(arquivo.criado_em).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button onClick={() => remover(arquivo.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors flex-shrink-0" title="Remover">
                <X size={14} style={{ color: 'var(--danger)' }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
