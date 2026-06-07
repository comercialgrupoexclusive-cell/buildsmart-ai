'use client'

import { useEffect, useRef, useState } from 'react'
import { BotMessageSquare, FileText, ImageIcon, Upload, X } from 'lucide-react'
import Link from 'next/link'

type ArquivoObra = {
  id: string
  nome: string
  tipo: string
  tamanho: number
  categoria: 'projeto' | 'planta' | 'memorial' | 'imagem' | 'outro'
  criado_em: string
}

const CATEGORIA_LABEL: Record<ArquivoObra['categoria'], string> = {
  projeto: 'Projeto',
  planta: 'Planta',
  memorial: 'Memorial',
  imagem: 'Imagem',
  outro: 'Outro',
}

function storageKey(obraId: string) {
  return `buildsmart_obra_arquivos_${obraId}`
}

function categoriaPorArquivo(file: File): ArquivoObra['categoria'] {
  const nome = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return 'imagem'
  if (nome.includes('planta')) return 'planta'
  if (nome.includes('memorial')) return 'memorial'
  if (nome.includes('projeto')) return 'projeto'
  return 'outro'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ObraArquivos({ obraId }: { obraId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arquivos, setArquivos] = useState<ArquivoObra[]>([])

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(obraId))
    setArquivos(raw ? JSON.parse(raw) : [])
  }, [obraId])

  function salvar(next: ArquivoObra[]) {
    setArquivos(next)
    localStorage.setItem(storageKey(obraId), JSON.stringify(next))
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const novos = Array.from(files).map(file => ({
      id: `arquivo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nome: file.name,
      tipo: file.type || 'arquivo',
      tamanho: file.size,
      categoria: categoriaPorArquivo(file),
      criado_em: new Date().toISOString(),
    }))
    salvar([...novos, ...arquivos])
    if (inputRef.current) inputRef.current.value = ''
  }

  function remover(id: string) {
    salvar(arquivos.filter(a => a.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Arquivos da obra</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Anexe projetos, plantas, memoriais, imagens e documentos técnicos para consulta e futura leitura pela IA.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Upload size={15} /> Anexar arquivo
            </button>
            <Link
              href={`/buildassist?obra=${obraId}`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--bg-secondary)', color: 'var(--accent)', border: '1px solid var(--border)' }}
            >
              <BotMessageSquare size={15} /> Abrir IA
            </Link>
          </div>
        </div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
      </div>

      {arquivos.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText size={32} className="mx-auto mb-3" style={{ color: 'var(--text-secondary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum arquivo anexado</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Comece anexando projeto arquitetônico, planta baixa ou memorial descritivo.
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
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{arquivo.nome}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {CATEGORIA_LABEL[arquivo.categoria]} · {formatSize(arquivo.tamanho)} · {new Date(arquivo.criado_em).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button onClick={() => remover(arquivo.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors" title="Remover">
                <X size={14} style={{ color: 'var(--danger)' }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
