'use client'

import { useEffect, useMemo, useState } from 'react'
import { BotMessageSquare, Copy, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LuiziaLogEntry, getLocalLuiziaLogs } from '@/lib/luizia-monitor'

function when(value?: string) {
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
  const [remote, setRemote] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busca, setBusca] = useState('')

  async function refresh() {
    setError('')
    try {
      const res = await fetch('/api/luizia-monitor', { cache: 'no-store' })
      const data = await res.json()
      if (data.remote && Array.isArray(data.logs)) {
        setLogs(data.logs)
        setRemote(true)
      } else {
        setLogs(getLocalLuiziaLogs())
        setRemote(false)
        setError(data.error || 'Historico online indisponivel.')
      }
    } catch {
      setLogs(getLocalLuiziaLogs())
      setRemote(false)
      setError('Nao foi possivel buscar o historico online.')
    }
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
    )
  }, [logs, busca])

  async function copiar(log: LuiziaLogEntry) {
    await navigator.clipboard?.writeText([
      `Horario: ${when(log.at)}`,
      `Origem: ${log.origem}`,
      `Usuario: ${log.usuario || '-'}`,
      `Modelo: ${log.model || '-'}`,
      '',
      `Pergunta:\n${log.pergunta}`,
      '',
      `Resposta:\n${log.resposta}`,
    ].join('\n'))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-5 flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BotMessageSquare size={21} style={{ color: 'var(--accent)' }} />
            Monitor da Luizia
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {logs.length} conversa(s) registradas {remote ? 'online' : 'neste navegador'}.
          </p>
          {remote === false && (
            <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>{error}</p>
          )}
        </div>
        <Button variant="secondary" onClick={() => void refresh()} icon={<RefreshCw size={15} />}>
          Atualizar
        </Button>
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
          Nenhuma conversa registrada ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtrados.map((log, index) => (
            <article key={log.id || `${log.at}-${index}`} className="card p-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--accent)' }}>{when(log.at)}</span>
                  <span>{log.origem === 'buildassist' ? 'Chat completo' : log.origem === 'whatsapp' ? 'WhatsApp' : 'Balao flutuante'}</span>
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
    </div>
  )
}
