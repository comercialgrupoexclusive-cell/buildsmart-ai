'use client'

export const LUIZIA_LOG_KEY = 'buildsmart-luizia-monitor-logs'
export const LUIZIA_INSTRUCTIONS_KEY = 'buildsmart-luizia-admin-instructions'

export type LuiziaLogEntry = {
  id: string
  at: string
  origem: 'buildassist' | 'floating'
  usuario: string | null
  pergunta: string
  resposta: string
  mode?: string
  model?: string
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

export function getLuiziaLogs() {
  return safeRead<LuiziaLogEntry[]>(LUIZIA_LOG_KEY, [])
}

export function addLuiziaLog(entry: Omit<LuiziaLogEntry, 'id' | 'at'>) {
  if (typeof window === 'undefined') return
  const logs = getLuiziaLogs()
  const next: LuiziaLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry,
  }
  localStorage.setItem(LUIZIA_LOG_KEY, JSON.stringify([next, ...logs].slice(0, 250)))
}

export function clearLuiziaLogs() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(LUIZIA_LOG_KEY)
}

export function getLuiziaInstructions() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(LUIZIA_INSTRUCTIONS_KEY) || ''
}

export function setLuiziaInstructions(value: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LUIZIA_INSTRUCTIONS_KEY, value)
}
