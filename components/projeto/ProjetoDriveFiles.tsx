'use client'

import { useState, useEffect } from 'react'
import { Folder, FileText, File, FileImage, ExternalLink, ChevronRight, FolderOpen, RefreshCw } from 'lucide-react'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  size: string | null
  modifiedTime: string | null
  webViewLink: string | null
}

type FolderEntry = { id: string; name: string }

function fileIcon(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.folder')
    return <Folder size={16} style={{ color: '#3B7BF8' }} />
  if (mimeType === 'application/pdf')
    return <FileText size={16} style={{ color: '#EF4444' }} />
  if (mimeType.startsWith('image/'))
    return <FileImage size={16} style={{ color: '#10B981' }} />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
    return <FileText size={16} style={{ color: '#10B981' }} />
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text'))
    return <FileText size={16} style={{ color: 'var(--text-secondary)' }} />
  return <File size={16} style={{ color: 'var(--text-secondary)' }} />
}

function formatSize(bytes: string | null): string {
  if (!bytes) return ''
  const n = parseInt(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function ProjetoDriveFiles({
  folderId,
  folderUrl,
  projectId,
}: {
  folderId: string | null
  folderUrl: string | null
  projectId: string
}) {
  const [stack, setStack] = useState<FolderEntry[]>(
    () => folderId ? [{ id: folderId, name: 'Pasta do projeto' }] : []
  )
  const [files, setFiles]             = useState<DriveFile[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const currentFolder = stack[stack.length - 1] ?? null

  useEffect(() => {
    if (folderId) {
      setStack([{ id: folderId, name: 'Pasta do projeto' }])
    } else {
      setStack([])
      setFiles([])
    }
  }, [folderId])

  useEffect(() => {
    if (currentFolder) fetchFiles(currentFolder.id, null, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolder?.id])

  async function fetchFiles(folder: string, pageToken: string | null, reset = false) {
    if (reset) { setLoading(true); setFiles([]) }
    else setLoadingMore(true)
    setError(null)

    try {
      const params = new URLSearchParams({ folderId: folder, projectId })
      if (pageToken) params.set('pageToken', pageToken)
      const res  = await fetch(`/api/drive/files?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar arquivos')
      setFiles(prev => reset ? data.files : [...prev, ...data.files])
      setNextPageToken(data.nextPageToken)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  function enterFolder(f: DriveFile) {
    setStack(s => [...s, { id: f.id, name: f.name }])
  }

  function goToIndex(i: number) {
    setStack(s => s.slice(0, i + 1))
  }

  if (!folderId) {
    return (
      <div className="rounded-xl border p-10 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <FolderOpen size={40} className="mx-auto mb-3 opacity-25" style={{ color: 'var(--text-secondary)' }} />
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Pasta do Drive não vinculada</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
          Vá em Dados Gerais e informe a URL da pasta do Google Drive para este projeto.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {/* Header: breadcrumbs + actions */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1 text-sm min-w-0 flex-1 overflow-x-auto">
          {stack.map((entry, i) => (
            <span key={entry.id + i} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && <ChevronRight size={12} style={{ color: 'var(--text-secondary)' }} />}
              {i < stack.length - 1 ? (
                <button
                  onClick={() => goToIndex(i)}
                  className="hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  {entry.name}
                </button>
              ) : (
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{entry.name}</span>
              )}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => currentFolder && fetchFiles(currentFolder.id, null, true)}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
            title="Atualizar"
          >
            <RefreshCw size={14} style={{ color: 'var(--text-secondary)' }} />
          </button>
          {folderUrl && (
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <ExternalLink size={12} /> Abrir no Drive
            </a>
          )}
        </div>
      </div>

      {/* File list */}
      <div className="min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : error ? (
          <div className="py-12 text-center px-6">
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--danger)' }}>{error}</p>
            <button
              onClick={() => currentFolder && fetchFiles(currentFolder.id, null, true)}
              className="text-xs px-3 py-1.5 rounded-lg border"
              style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            >
              Tentar novamente
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="py-12 text-center">
            <Folder size={32} className="mx-auto mb-2 opacity-25" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Pasta vazia</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Nome</th>
                  <th className="px-4 py-2 text-right text-xs font-medium hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Tamanho</th>
                  <th className="px-4 py-2 text-right text-xs font-medium hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Modificado</th>
                </tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr
                    key={f.id}
                    className="border-b last:border-0 hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {fileIcon(f.mimeType)}
                        {f.mimeType === 'application/vnd.google-apps.folder' ? (
                          <button
                            onClick={() => enterFolder(f)}
                            className="text-sm font-medium hover:underline text-left"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {f.name}
                          </button>
                        ) : f.webViewLink ? (
                          <a
                            href={f.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm hover:underline"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {f.name}
                          </a>
                        ) : (
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{f.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs hidden sm:table-cell"
                      style={{ color: 'var(--text-secondary)' }}>
                      {formatSize(f.size)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs hidden sm:table-cell"
                      style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(f.modifiedTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {nextPageToken && (
              <div className="p-4 text-center border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => currentFolder && fetchFiles(currentFolder.id, nextPageToken)}
                  disabled={loadingMore}
                  className="text-xs px-4 py-2 rounded-lg border disabled:opacity-50"
                  style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                >
                  {loadingMore ? 'Carregando...' : 'Carregar mais'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
