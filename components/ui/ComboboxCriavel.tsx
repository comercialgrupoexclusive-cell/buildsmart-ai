'use client'

// Campo de entrada que É o cadastro (seção 4 canônica): ao digitar, pesquisa o
// que já existe na organização, deixa escolher um existente, editar (renomear)
// ou criar um novo ali mesmo. O "banco" cresce pelo uso — não há aba de
// Cadastros. Componente único, reutilizável em cliente, fornecedor, insumo,
// item, etapa etc. A fonte de dados e o que "criar/renomear" fazem é do
// chamador (tabela própria ou sugestões), aqui é só a interação.

import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Plus, X } from 'lucide-react'

export type OpcaoCombobox = { id: string; label: string }

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

type Props = {
  label?: string
  placeholder?: string
  disabled?: boolean
  opcoes: OpcaoCombobox[]
  // Texto atual do valor selecionado (exibido quando o campo não está em foco).
  valorLabel: string
  // Escolheu um item já existente da lista.
  onEscolher: (opcao: OpcaoCombobox) => void
  // Confirmou um valor novo (digitou e mandou criar). O chamador decide se
  // isso vira linha numa tabela ou só texto livre.
  onCriar: (texto: string) => void | Promise<void>
  // Renomear um existente (só quando há tabela por trás). Sem isto, some o lápis.
  onRenomear?: (id: string, novo: string) => void | Promise<void>
  // Limpar a seleção.
  onLimpar?: () => void
  // Quando false, não oferece "Criar …" (ex.: escolher um template existente).
  permitirCriar?: boolean
}

export function ComboboxCriavel({ label, placeholder, disabled, opcoes, valorLabel, onEscolher, onCriar, onRenomear, onLimpar, permitirCriar = true }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const [aberto, setAberto] = useState(false)
  const [query, setQuery] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState('')

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) { setAberto(false); setEditandoId(null) }
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const q = normalizar(query)
  const filtradas = q ? opcoes.filter(o => normalizar(o.label).includes(q)) : opcoes
  const existeExato = opcoes.some(o => normalizar(o.label) === q)
  const podeCriar = permitirCriar && q.length > 0 && !existeExato

  function abrir() {
    if (disabled) return
    setQuery('')
    setAberto(true)
  }

  function escolher(o: OpcaoCombobox) {
    onEscolher(o)
    setAberto(false)
    setQuery('')
  }

  async function criar() {
    const texto = query.trim()
    if (!texto) return
    await onCriar(texto)
    setAberto(false)
    setQuery('')
  }

  async function salvarRename(id: string) {
    const novo = editTexto.trim()
    if (novo && onRenomear) await onRenomear(id, novo)
    setEditandoId(null)
  }

  return (
    <div className="flex flex-col gap-1.5" ref={raiz}>
      {label && <label className="text-sm font-medium text-[var(--text-secondary)]">{label}</label>}

      <div className="relative">
        {aberto ? (
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (filtradas.length === 1) escolher(filtradas[0]); else if (podeCriar) void criar() }
              if (e.key === 'Escape') { setAberto(false); setQuery('') }
            }}
            placeholder={placeholder || 'Digite para buscar ou criar…'}
            className="input-base w-full"
          />
        ) : (
          <button
            type="button"
            onClick={abrir}
            disabled={disabled}
            className="input-base w-full flex items-center justify-between text-left disabled:opacity-50"
          >
            <span className={valorLabel ? '' : 'text-[var(--text-secondary)]'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {valorLabel || placeholder || 'Selecionar…'}
            </span>
            <span className="flex flex-shrink-0 items-center gap-1">
              {valorLabel && onRenomear && (
                <Pencil size={13} style={{ color: 'var(--text-secondary)' }} onClick={e => { e.stopPropagation(); setQuery(valorLabel); setAberto(true) }} />
              )}
              {valorLabel && onLimpar && (
                <X size={14} style={{ color: 'var(--text-secondary)' }} onClick={e => { e.stopPropagation(); onLimpar() }} />
              )}
            </span>
          </button>
        )}

        {aberto && (
          <div
            className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg py-1 shadow-lg max-h-64 overflow-y-auto"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {filtradas.map(o => (
              <div key={o.id} className="flex items-center gap-1 px-1">
                {editandoId === o.id ? (
                  <div className="flex flex-1 items-center gap-1 px-2 py-1">
                    <input
                      autoFocus
                      value={editTexto}
                      onChange={e => setEditTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void salvarRename(o.id) } if (e.key === 'Escape') setEditandoId(null) }}
                      className="input-base flex-1 py-1 text-sm"
                    />
                    <button type="button" onClick={() => void salvarRename(o.id)} className="grid size-7 place-items-center rounded-md" style={{ color: 'var(--accent)' }}><Check size={15} /></button>
                    <button type="button" onClick={() => setEditandoId(null)} className="grid size-7 place-items-center rounded-md" style={{ color: 'var(--text-secondary)' }}><X size={15} /></button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => escolher(o)}
                      className="flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)]"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {o.label}
                    </button>
                    {onRenomear && (
                      <button
                        type="button"
                        onClick={() => { setEditandoId(o.id); setEditTexto(o.label) }}
                        className="grid size-7 flex-shrink-0 place-items-center rounded-md hover:bg-[var(--bg-secondary)]"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}

            {podeCriar && (
              <button
                type="button"
                onClick={() => void criar()}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)]"
                style={{ color: 'var(--accent)' }}
              >
                <Plus size={14} /> Criar “{query.trim()}”
              </button>
            )}

            {filtradas.length === 0 && !podeCriar && (
              <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Nada encontrado.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
