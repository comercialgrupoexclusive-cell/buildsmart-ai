'use client'

// "Compartilhar com o cliente": o cliente é externo (não é membro da
// organização), então acessa por um LINK com token — não por membership. O link
// abre uma página pública (/pc/[token]) com o que estiver marcado como visível
// ao cliente no Feed. Aqui a equipe gera, copia e revoga esse link.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Link2, Loader2, RefreshCw, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

type LinkRow = { id: string; token: string; ativo: boolean }

export function ProcessoPortalCliente({ processoId }: { processoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [link, setLink] = useState<LinkRow | null | undefined>(undefined)
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('processo_portal_link').select('id,token,ativo').eq('processo_id', processoId).maybeSingle()
    setLink((data as LinkRow) ?? null)
  }, [supabase, processoId])

  useEffect(() => { void carregar() }, [carregar])

  const url = link ? `${typeof window !== 'undefined' ? window.location.origin : ''}/pc/${link.token}` : ''

  async function gerar() {
    if (ocupado) return
    setErro(''); setOcupado(true)
    try {
      const { data, error } = await supabase.from('processo_portal_link').insert({ processo_id: processoId }).select('id,token,ativo').single()
      if (error) throw error
      setLink(data as LinkRow)
    } catch {
      setErro('Não foi possível gerar o link.')
    } finally {
      setOcupado(false)
    }
  }

  async function alternarAtivo() {
    if (!link || ocupado) return
    setOcupado(true)
    try {
      const { data } = await supabase.from('processo_portal_link').update({ ativo: !link.ativo }).eq('id', link.id).select('id,token,ativo').single()
      if (data) setLink(data as LinkRow)
    } finally {
      setOcupado(false)
    }
  }

  async function copiar() {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* ignore */ }
  }

  if (link === undefined) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" style={{ color: 'var(--text-secondary)' }} /></div>
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Share2 size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Compartilhar com o cliente</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Gere um link e envie ao cliente (WhatsApp, e-mail…). Ele abre o acompanhamento deste processo sem precisar de conta.
          Só aparece o que você marcar como visível ao cliente no Feed.
        </p>

        {!link ? (
          <Button onClick={() => void gerar()} loading={ocupado} icon={<Link2 size={15} />}>Gerar link do cliente</Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', opacity: link.ativo ? 1 : 0.5 }}>
              <Link2 size={15} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <span className="flex-1 truncate text-sm" style={{ color: 'var(--text-primary)' }}>{url}</span>
              <button type="button" onClick={() => void copiar()} className="flex-shrink-0 grid size-8 place-items-center rounded-md" style={{ color: copiado ? 'var(--success)' : 'var(--accent)' }} title="Copiar">
                {copiado ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => void alternarAtivo()} icon={<RefreshCw size={14} />}>
                {link.ativo ? 'Revogar link' : 'Reativar link'}
              </Button>
              {!link.ativo && <span className="text-xs" style={{ color: 'var(--danger)' }}>Link revogado — o cliente não consegue mais abrir.</span>}
            </div>
          </div>
        )}

        {erro && <p className="mt-2 text-xs" style={{ color: '#f87171' }}>{erro}</p>}
      </div>
    </div>
  )
}
