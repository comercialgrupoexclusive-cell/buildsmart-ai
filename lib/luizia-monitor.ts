'use client'

export type LuiziaLogEntry = {
  id?: string
  at?: string
  origem: 'buildassist' | 'floating'
  usuario: string | null
  pergunta: string
  resposta: string
  mode?: string | null
  model?: string | null
}

const LOCAL_LOG_KEY = 'buildsmart-luizia-monitor-local'

function localLogs(): LuiziaLogEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LOCAL_LOG_KEY) || '[]') as LuiziaLogEntry[]
  } catch {
    return []
  }
}

function saveLocal(entry: LuiziaLogEntry) {
  if (typeof window === 'undefined') return
  const next = [{ ...entry, id: `${Date.now()}`, at: new Date().toISOString() }, ...localLogs()].slice(0, 250)
  localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(next))
}

export async function logLuizia(entry: LuiziaLogEntry) {
  saveLocal(entry)

  try {
    await fetch('/api/luizia-monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
  } catch {
    // Nunca quebrar a IA por falha no monitor.
  }
}

export function getLocalLuiziaLogs() {
  return localLogs()
}

export function clearLocalLuiziaLogs() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(LOCAL_LOG_KEY)
}
