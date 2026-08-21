// ═══════════════════════════════════════════════════════════════════════════
// Persistência do chat flutuante da Luiza — SEMPRE namespaced por profile_id.
//
// BUG CRÍTICO corrigido (rodada "Identidade única da Luiza"): antes disto as
// chaves eram globais (buildsmart-luizia-floating-chat-session, -modo,
// -draft), sem profile_id nenhum. Como o BuildSmart permite trocar de perfil
// no mesmo navegador, um perfil podia abrir e ver a conversa/rascunho/modo
// deixado por outro — vazamento de conversa entre usuários.
//
// Extraído para módulo puro (sem depender de React) para poder testar a
// própria lógica de isolamento sem precisar de jsdom/testing-library, que
// este projeto não usa — ver lib/__tests__/luizia-chat-storage.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

export type LuizaChatMessage = { role: 'user' | 'assistant'; content: string }
export type LuizaChatModo = 'chat' | 'work'

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>

/**
 * "anon" é o único bucket sem profile_id — usado só no instante antes do
 * perfil carregar (ProfileProvider hidrata de localStorage de forma síncrona
 * no primeiro render, então essa janela é mínima) e nunca deve acumular
 * conversa real de ninguém: o componente troca para a chave do profile_id
 * assim que currentProfile existe.
 */
export function chatStorageKey(profileId: string | null | undefined, kind: 'chat' | 'modo' | 'draft'): string {
  return `buildsmart:luiza:${profileId || 'anon'}:${kind}`
}

export function readLuizaMessages(storage: ReadableStorage, profileId: string | null | undefined): LuizaChatMessage[] {
  const raw = storage.getItem(chatStorageKey(profileId, 'chat'))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LuizaChatMessage[]) : []
  } catch { return [] }
}

export function writeLuizaMessages(storage: WritableStorage, profileId: string | null | undefined, messages: LuizaChatMessage[]): void {
  storage.setItem(chatStorageKey(profileId, 'chat'), JSON.stringify(messages.slice(-40)))
}

export function readLuizaModo(storage: ReadableStorage, profileId: string | null | undefined): LuizaChatModo {
  const raw = storage.getItem(chatStorageKey(profileId, 'modo'))
  return raw === 'work' ? 'work' : 'chat'
}

export function writeLuizaModo(storage: WritableStorage, profileId: string | null | undefined, modo: LuizaChatModo): void {
  storage.setItem(chatStorageKey(profileId, 'modo'), modo)
}

export function readLuizaDraft<T>(storage: ReadableStorage, profileId: string | null | undefined): T | null {
  const raw = storage.getItem(chatStorageKey(profileId, 'draft'))
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export function writeLuizaDraft<T>(storage: WritableStorage, profileId: string | null | undefined, draft: T | null): void {
  const key = chatStorageKey(profileId, 'draft')
  if (draft) storage.setItem(key, JSON.stringify(draft))
  else storage.removeItem(key)
}
