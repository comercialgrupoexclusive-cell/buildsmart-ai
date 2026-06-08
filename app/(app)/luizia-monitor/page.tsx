'use client'

import { useEffect, useMemo, useState } from 'react'
import { BotMessageSquare, Copy, Eraser, RefreshCw, Save, Search, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  LuiziaLogEntry,
  clearLuiziaLogs,
  getLuiziaInstructions,
  getLuiziaLogs,
  setLuiziaInstructions,
} from '@/lib/luizia-monitor'

function formatDate(value?: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function LuiziaMonitorPage() {
  const [logs, setLogs] = useState<LuiziaLogEntry[]>([])
  const [busca, setBusca] = useState('')
  const [instructions, setInstructions] = useState('')
  const [saved, setSaved] = useState(false)
  const [remote, setRemote] = useState<boolean | null>(null)
  const [remoteError, setRemoteError] = useState('')

  async function refresh() {
    setRemoteError('')
    try {
      const response = await fetch('/api/luizia-monitor', { cache: 'no-store' })
      const data = await response.json()
      if (data.remote && Array.isArray(data.logs)) {
        setLogs(data.logs)
        setRemote(true)
      } else {
        setLogs(getLuiziaLogs())
        setRemote(false)
        setRemoteError(data.error || 'Tabela online ainda nao configurada.')
      }
    } catch {
      setLogs(getLuiziaLogs())
      setRemote(false)
      setRemoteError('Nao foi possivel buscar o historico online agora.')
    }

    setInstructions(getLuiziaInstructions())
  }

  useEffect(() => { void refresh() }, [])

  const filtrados = useMemo(() => {
    const term = busca.trim().toLowerCase()
    if (!term) return logs
    return logs.filter(log =>
      log.pergunta.toLowerCase().includes(term)
      || log.resposta.toLowerCase().includes(term)
      || (log.usuario || '').toLowerCase().includes(term)
      || (log.model || '').toLowerCase().includes(term)
      || (log.mode || '').toLowerCase().includes(term)
    )
  }, [logs, busca])

  function saveInstructions() {
    setLuiziaInstructions(instructions)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function limparLogs() {
    if (!confirm('Limpar todo o historico da Luizia?')) return
    if (remote) await fetch('/api/luizia-monitor', { method: 'DELETE' }).catch(() => null)
    clearLuiziaLogs()
    await refresh()
  }

  async function copiar(log: LuiziaLogEntry) {
    const text = [
      `Horario: ${formatDate(log.at || log.created_at)}`,
      `Origem: ${log.origem}`,
      `Usuario: ${log.usuario || '-'}`,
      `Modo/modelo: ${log.mode || '-'} / ${log.model || '-'}`,
      '',
      `Pergunta:\n${log.pergunta}`,
      '',
      `Resposta:\n${log.resposta}`,
    ].join('\n')
    await navigator.clipboard?.writeText(text)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <aside className="card p-5 flex flex-col gap-4 h-fit">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)', color: 'white' }}>
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Controle da Luizia</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Ajuste rapido do comportamento da IA neste navegador.
              </p>
            </div>
          </div>

          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            className="input-base min-h-40 resize-y text-sm"
            placeholder="Ex: Responder sempre curto, nao dizer que criou registros, explicar em linguagem simples, separar materiais e mao de obra..."
          />

          <Button onClick={saveInstructions} icon={<Save size={15} />}>
            {saved ? 'Salvo' : 'Salvar instrucao'}
          </Button>

          <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            Esta instrucao e enviada junto nas proximas mensagens do BuildAssistente e do balao da Luizia.
          </div>
        </aside>

        <main className="flex flex-col gap-4">
          <div className="card p-4 flex flex-col md:flex-row gap-3 md:items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <BotMessageSquare size={20} style={{ color: 'var(--accent)' }} />
                Monitor da Luizia
              </h1>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {logs.length} conversa(s) registradas {remote ? 'online' : 'neste navegador'}.
              </p>
              {remote === false && (
                <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                  Historico online indisponivel: {remoteError}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void refresh()} icon={<RefreshCw size={15} />}>Atualizar</Button>
              <Button variant="danger" onClick={() => void limparLogs()} icon={<Eraser size={15} />}>Limpar</Button>
            </div>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="input-base input-search"
              placeholder="Buscar em perguntas, respostas, usuario ou modelo..."
            />
          </div>

          {filtrados.length === 0 ? (
            <div className="card p-10 text-center" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma conversa registrada ainda. Faca uma pergunta para a Luizia e volte aqui.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtrados.map(log => (
                <article key={log.id} className="card p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex flex-wrap gap-2 items-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-semibold" style={{ color: 'var(--accent)' }}>{formatDate(log.at || log.created_at)}</span>
                      <span>{log.origem === 'buildassist' ? 'Chat completo' : 'Balao flutuante'}</span>
                      <span>{log.usuario || 'Sem usuario'}</span>
                      <span>{log.mode || 'modo n/d'}{log.model ? ` - ${log.model}` : ''}</span>
                    </div>
                    <button
                      onClick={() => copiar(log)}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg hover:bg-[var(--bg-secondary)]"
                      style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                      <Copy size={12} /> Copiar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Pergunta</p>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{log.pergunta}</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Resposta</p>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{log.resposta}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
