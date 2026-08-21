// Menor trava de acesso administrativo (hotfix "Luiza/WhatsApp/
// privacidade", item 2) — testa isProfileAdmin isoladamente (FakeDB).
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeDB } from './fake-supabase'
import { isProfileAdmin } from '../luizia-admin-guard'

function novoDb() {
  const db = new FakeDB()
  db.seed('profiles', [
    { id: 'profile-admin', name: 'Admin', tipo: 'admin' },
    { id: 'profile-luiz', name: 'Luiz', tipo: 'usuario' },
  ])
  return db
}

describe('isProfileAdmin', () => {
  it('admin acessa', async () => {
    const db = novoDb() as unknown as SupabaseClient
    expect(await isProfileAdmin(db, 'profile-admin')).toBe(true)
  })

  it('usuário comum é bloqueado', async () => {
    const db = novoDb() as unknown as SupabaseClient
    expect(await isProfileAdmin(db, 'profile-luiz')).toBe(false)
  })

  it('sem profileId (ninguém logado) é bloqueado', async () => {
    const db = novoDb() as unknown as SupabaseClient
    expect(await isProfileAdmin(db, null)).toBe(false)
    expect(await isProfileAdmin(db, undefined)).toBe(false)
  })

  it('profileId inexistente é bloqueado', async () => {
    const db = novoDb() as unknown as SupabaseClient
    expect(await isProfileAdmin(db, 'profile-que-nao-existe')).toBe(false)
  })
})
