'use client'

import { useEffect, useState } from 'react'
import { Plus, X as XIcon, Check, Loader2, LayoutTemplate } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { UsarTemplateOrcamentoModal } from './TemplateOrcamentoModal'
import { fetchEtapasPadrao, type EtapaPadrao } from '@/lib/settings/etapas-padrao'

function normalizarNome(nome: string) {
  return nome.trim().toLocaleLowerCase('pt-BR')
}

export function OrcamentoEtapasIniciaisModal({
  open, onClose, obraId, orcamentoId, onDone,
}: {
  open: boolean
  onClose: () => void
  obraId: string
  orcamentoId: string
  onDone?: () => void
}) {
  const supabase = createClient()
  const [catalogo, setCatalogo] = useState<EtapaPadrao[]>([])
  const [pendentes, setPendentes] = useState<string[]>([])
  const [novaEtapa, setNovaEtapa] = useState('')
  const [showTemplate, setShowTemplate] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (open) {
      setPendentes([])
      setNovaEtapa('')
      setErro('')
      fetchEtapasPadrao(supabase).then(setCatalogo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const chavesPendentes = new Set(pendentes.map(normalizarNome))

  function adicionarDigitada() {
    const nome = novaEtapa.trim()
    if (!nome || chavesPendentes.has(normalizarNome(nome))) return
    setPendentes(prev => [...prev, nome])
    setNovaEtapa('')
  }

  function alternarCatalogo(nome: string) {
    const chave = normalizarNome(nome)
    if (chavesPendentes.has(chave)) {
      setPendentes(prev => prev.filter(n => normalizarNome(n) !== chave))
    } else {
      setPendentes(prev => [...prev, nome])
    }
  }

  function removerPendente(nome: string) {
    setPendentes(prev => prev.filter(n => n !== nome))
  }

  async function handleCriarEtapas() {
    if (pendentes.length === 0) return
    setCriando(true)
    setErro('')
    try {
      const { data: existentesRaw } = await supabase.from('etapas').select('id, nome, ordem').eq('obra_id', obraId)
      const existentes = (existentesRaw || []) as { id: string; nome: string; ordem: number | null }[]
      const chavesExistentes = new Set(existentes.map(e => normalizarNome(e.nome)))
      let proximaOrdem = existentes.reduce((max, e) => Math.max(max, e.ordem || 0), 0) + 1

      const novas = pendentes.filter(nome => !chavesExistentes.has(normalizarNome(nome)))
      if (novas.length > 0) {
        const { error } = await supabase.from('etapas').insert(
          novas.map(nome => ({ obra_id: obraId, nome, status: 'planejada' as const, ordem: proximaOrdem++ }))
        )
        if (error) throw error
      }

      onDone?.()
      onClose()
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar etapas')
    } finally {
      setCriando(false)
    }
  }

  return (
    <>
      <Modal open={open && !showTemplate} onClose={onClose} title="Montar etapas do orçamento" size="lg">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Prefere reaproveitar um orçamento salvo inteiro (etapas + composições)?
            </p>
            <Button size="sm" variant="secondary" icon={<LayoutTemplate size={14} />} onClick={() => setShowTemplate(true)}>
              Usar template
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              value={novaEtapa}
              onChange={e => setNovaEtapa(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionarDigitada()}
              placeholder="Digite o nome da etapa e adicione"
              className="flex-1"
            />
            <Button icon={<Plus size={16} />} onClick={adicionarDigitada} disabled={!novaEtapa.trim()}>
              Adicionar
            </Button>
          </div>

          {catalogo.length > 0 && (
            <div>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>Ou escolha das etapas padrão:</p>
              <div className="flex flex-wrap gap-1.5">
                {catalogo.map(etapa => {
                  const ativa = chavesPendentes.has(normalizarNome(etapa.nome))
                  return (
                    <button
                      key={etapa.id}
                      type="button"
                      onClick={() => alternarCatalogo(etapa.nome)}
                      className="text-xs px-2.5 py-1 rounded-full transition-colors"
                      style={ativa
                        ? { background: 'var(--accent)', color: 'white' }
                        : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                      {etapa.nome}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {pendentes.length > 0 && (
            <div>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>{pendentes.length} etapa(s) selecionada(s):</p>
              <div className="flex flex-col gap-1">
                {pendentes.map(nome => (
                  <div key={nome} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5" style={{ background: 'var(--bg-secondary)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{nome}</span>
                    <button onClick={() => removerPendente(nome)} className="p-1 rounded hover:bg-red-500/20" title="Remover">
                      <XIcon size={13} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {erro && <p className="text-xs" style={{ color: 'var(--danger)' }}>{erro}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={criando}>
              Pular por enquanto
            </Button>
            <Button
              className="flex-1" onClick={handleCriarEtapas} disabled={pendentes.length === 0 || criando}
              icon={criando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            >
              {criando ? 'Criando...' : `Criar ${pendentes.length || ''} etapa(s)`}
            </Button>
          </div>
        </div>
      </Modal>

      <UsarTemplateOrcamentoModal
        open={showTemplate}
        onClose={() => setShowTemplate(false)}
        obraId={obraId}
        orcamentoId={orcamentoId}
        onApplied={() => { setShowTemplate(false); onDone?.(); onClose() }}
      />
    </>
  )
}
