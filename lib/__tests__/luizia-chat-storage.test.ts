// GOLDEN TEST — isolamento de conversa/draft/modo do chat flutuante entre
// perfis (rodada "Identidade única da Luiza x Painel x Avisos", item 16).
//
// Testa a mecânica real de persistência usada por components/layout/
// LuiziaFloatingChat.tsx (lib/luizia-chat-storage.ts) com um Storage falso
// em memória — sem jsdom/testing-library (não instalados neste projeto), o
// que a suíte NÃO cobre é o timing de render do React em si (o
// useLayoutEffect que zera o estado antes do paint) — ver limitação no
// relatório desta rodada.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  chatStorageKey, readLuizaMessages, writeLuizaMessages,
  readLuizaModo, writeLuizaModo, readLuizaDraft, writeLuizaDraft,
} from '../luizia-chat-storage'

const LUIZ_ID = 'profile-luiz'
const GABRIEL_ID = 'profile-gabriel'

class FakeStorage {
  private map = new Map<string, string>()
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

let storage: FakeStorage
beforeEach(() => { storage = new FakeStorage() })

describe('chatStorageKey — namespaced por profile_id, nunca chave global', () => {
  it('duas identidades diferentes nunca colidem na mesma chave', () => {
    expect(chatStorageKey(LUIZ_ID, 'chat')).not.toBe(chatStorageKey(GABRIEL_ID, 'chat'))
    expect(chatStorageKey(LUIZ_ID, 'modo')).not.toBe(chatStorageKey(GABRIEL_ID, 'modo'))
    expect(chatStorageKey(LUIZ_ID, 'draft')).not.toBe(chatStorageKey(GABRIEL_ID, 'draft'))
  })
  it('sem perfil cai no bucket "anon", nunca reaproveita chave de um perfil real', () => {
    expect(chatStorageKey(null, 'chat')).not.toBe(chatStorageKey(LUIZ_ID, 'chat'))
    expect(chatStorageKey(undefined, 'chat')).toBe(chatStorageKey(null, 'chat'))
  })
})

describe('GOLDEN — Luiz e Gabriel nunca veem a conversa um do outro', () => {
  it('mensagem privada de Luiz não aparece para Gabriel; ao voltar, Luiz recupera só a sua', () => {
    // Luiz conversa
    writeLuizaMessages(storage, LUIZ_ID, [{ role: 'user', content: 'SEGREDO_LUIZ' }])

    // Troca para Gabriel — carrega o bucket do Gabriel (vazio ainda)
    const gabrielInicial = readLuizaMessages(storage, GABRIEL_ID)
    expect(gabrielInicial).toEqual([])
    expect(JSON.stringify(gabrielInicial)).not.toContain('SEGREDO_LUIZ')

    // Gabriel conversa
    writeLuizaMessages(storage, GABRIEL_ID, [{ role: 'user', content: 'SEGREDO_GABRIEL' }])

    // Volta para Luiz — recupera só a própria conversa, não a do Gabriel
    const luizDeVolta = readLuizaMessages(storage, LUIZ_ID)
    expect(luizDeVolta).toEqual([{ role: 'user', content: 'SEGREDO_LUIZ' }])
    expect(JSON.stringify(luizDeVolta)).not.toContain('SEGREDO_GABRIEL')

    // E o bucket do Gabriel continua intacto e isolado
    const gabrielDeVolta = readLuizaMessages(storage, GABRIEL_ID)
    expect(gabrielDeVolta).toEqual([{ role: 'user', content: 'SEGREDO_GABRIEL' }])
  })

  it('draft de uma proposta do Luiz não aparece para Gabriel', () => {
    writeLuizaDraft(storage, LUIZ_ID, { skill: 'tarefas', itens: [{ id: '1', alvo: 'Orçar esquadrias', campo: 'x', valor: 'y' }], status: 'rascunho' })
    const draftGabriel = readLuizaDraft(storage, GABRIEL_ID)
    expect(draftGabriel).toBeNull()
    const draftLuiz = readLuizaDraft<{ skill: string }>(storage, LUIZ_ID)
    expect(draftLuiz?.skill).toBe('tarefas')
  })

  it('modo (Chat/Work) é individual por perfil — trocar em um não muda o outro', () => {
    writeLuizaModo(storage, LUIZ_ID, 'work')
    expect(readLuizaModo(storage, GABRIEL_ID)).toBe('chat') // padrão, nunca herda do Luiz
    expect(readLuizaModo(storage, LUIZ_ID)).toBe('work')
    writeLuizaModo(storage, GABRIEL_ID, 'chat')
    expect(readLuizaModo(storage, LUIZ_ID)).toBe('work') // não foi afetado pela escrita do Gabriel
  })

  it('limpar a conversa (writeLuizaMessages([])) do perfil atual não apaga o histórico do outro', () => {
    writeLuizaMessages(storage, LUIZ_ID, [{ role: 'user', content: 'SEGREDO_LUIZ' }])
    writeLuizaMessages(storage, GABRIEL_ID, [{ role: 'user', content: 'SEGREDO_GABRIEL' }])
    writeLuizaMessages(storage, LUIZ_ID, [])
    expect(readLuizaMessages(storage, LUIZ_ID)).toEqual([])
    expect(readLuizaMessages(storage, GABRIEL_ID)).toEqual([{ role: 'user', content: 'SEGREDO_GABRIEL' }])
  })
})
