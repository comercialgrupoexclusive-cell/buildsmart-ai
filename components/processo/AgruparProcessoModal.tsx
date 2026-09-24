'use client'

import { useMemo, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import type { Processo, ProcessoGrupo } from '@/lib/processo'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

// Agrupar não tem caixa de seleção: o campo do nome já é a lista pesquisável
// dos grupos existentes, e digitar um nome novo + "+" grava o grupo na hora.
// A escolha dos Processos é por busca e chips, não por checkbox.

type Props = {
  aberto: boolean
  onFechar: () => void
  processoBase: Processo
  processos: Processo[]
  grupos: ProcessoGrupo[]
  onCriarGrupo: (nome: string) => Promise<ProcessoGrupo>
  onConfirmar: (grupoId: string, processoIds: string[]) => Promise<void>
}

export function AgruparProcessoModal({
  aberto, onFechar, processoBase, processos, grupos, onCriarGrupo, onConfirmar,
}: Props) {
  const [nomeGrupo, setNomeGrupo] = useState('')
  const [grupoSelecionado, setGrupoSelecionado] = useState<ProcessoGrupo | null>(null)
  const [selecionados, setSelecionados] = useState<string[]>([processoBase.id])
  const [buscaProcesso, setBuscaProcesso] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const gruposFiltrados = useMemo(() => {
    const termo = nomeGrupo.trim().toLowerCase()
    if (!termo) return grupos
    return grupos.filter(g => g.nome.toLowerCase().includes(termo))
  }, [grupos, nomeGrupo])

  const nomeExato = grupos.some(g => g.nome.toLowerCase() === nomeGrupo.trim().toLowerCase())
  const podeCriar = nomeGrupo.trim().length > 0 && !nomeExato

  const candidatos = useMemo(() => {
    const termo = buscaProcesso.trim().toLowerCase()
    return processos
      .filter(p => p.id !== processoBase.id)
      .filter(p => !termo || p.nome.toLowerCase().includes(termo))
      .slice(0, 8)
  }, [processos, processoBase.id, buscaProcesso])

  function alternarProcesso(id: string) {
    setSelecionados(atual => (atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]))
  }

  async function criarEUsar() {
    if (!podeCriar || salvando) return
    setErro('')
    setSalvando(true)
    try {
      const grupo = await onCriarGrupo(nomeGrupo.trim())
      setGrupoSelecionado(grupo)
      setNomeGrupo(grupo.nome)
    } catch {
      setErro('Não foi possível criar o grupo.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmar() {
    if (salvando) return
    setErro('')

    // Nome digitado sem passar pelo "+" ainda vale: cria antes de agrupar
    // em vez de obrigar o usuário a voltar e clicar.
    let grupo = grupoSelecionado
    if (!grupo && nomeGrupo.trim()) {
      setSalvando(true)
      try {
        grupo = await onCriarGrupo(nomeGrupo.trim())
      } catch {
        setErro('Não foi possível criar o grupo.')
        setSalvando(false)
        return
      }
    }
    if (!grupo) {
      setErro('Escolha um grupo existente ou dê um nome ao novo.')
      setSalvando(false)
      return
    }

    setSalvando(true)
    try {
      await onConfirmar(grupo.id, selecionados)
      onFechar()
    } catch {
      setErro('Não foi possível agrupar os processos.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open={aberto} onClose={onFechar} title="Agrupar processos" size="md">
      <div className="space-y-5">
        <div>
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Grupo</label>
          <div className="mt-1.5 flex gap-2">
            <input
              value={nomeGrupo}
              onChange={e => { setNomeGrupo(e.target.value); setGrupoSelecionado(null) }}
              placeholder="Buscar grupo ou escrever um novo…"
              className="input-base"
              autoFocus
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void criarEUsar()}
              disabled={!podeCriar || salvando}
              aria-label="Criar grupo"
              className="flex-shrink-0 px-3"
            >
              <Plus size={16} />
            </Button>
          </div>

          {grupoSelecionado ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs" style={{ color: '#10b981' }}>
              <Check size={13} /> Grupo &ldquo;{grupoSelecionado.nome}&rdquo; selecionado
            </p>
          ) : gruposFiltrados.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gruposFiltrados.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setGrupoSelecionado(g); setNomeGrupo(g.nome) }}
                  className="rounded-full px-2.5 py-1 text-xs transition-colors hover:brightness-125"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {g.nome}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {nomeGrupo.trim() ? 'Nenhum grupo com esse nome — use o + para criar.' : 'Nenhum grupo ainda. Escreva um nome e use o +.'}
            </p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Processos no grupo ({selecionados.length})
          </label>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selecionados.map(id => {
              const p = processos.find(x => x.id === id)
              if (!p) return null
              const fixo = id === processoBase.id
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {p.nome}
                  {!fixo && (
                    <button type="button" onClick={() => alternarProcesso(id)} aria-label={`Remover ${p.nome}`}>
                      <X size={12} />
                    </button>
                  )}
                </span>
              )
            })}
          </div>

          <div className="relative mt-2.5">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={buscaProcesso}
              onChange={e => setBuscaProcesso(e.target.value)}
              placeholder="Buscar outros processos…"
              className="input-base input-search"
            />
          </div>

          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
            {candidatos.map(p => {
              const dentro = selecionados.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => alternarProcesso(p.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="truncate">{p.nome}</span>
                  {dentro && <Check size={14} style={{ color: '#10b981' }} />}
                </button>
              )
            })}
            {candidatos.length === 0 && (
              <p className="px-1 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhum outro processo encontrado.</p>
            )}
          </div>
        </div>

        {erro && <p className="text-xs" style={{ color: '#f87171' }}>{erro}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void confirmar()} loading={salvando}>Agrupar</Button>
        </div>
      </div>
    </Modal>
  )
}
