import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const userA = uuid(1), userB = uuid(2), userZero = uuid(3)
const sessionA = uuid(11), sessionB = uuid(12), sessionZero = uuid(13)
const orgA = uuid(21), orgB = uuid(22), processA = uuid(31), processB = uuid(32)
let db: PGlite
const file = (path: string) => readFileSync(resolve(path), 'utf8')
const rows = async (sql: string) => (await db.query(sql)).rows
const scalar = async (sql: string) => Object.values((await rows(sql))[0] as object)[0]
async function asUser(user = userA, session = sessionA, metadata = {}) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({ sub: user, session_id: session, user_metadata: metadata })])
  await db.exec('set role authenticated')
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(file('lib/__tests__/auth-database-fixture.sql'))
  for (const migration of ['20260911060000_p4_5_fundacao_auth_organizacao.sql', '20260911090000_p4_6_login_organizacao_rbac.sql', '20260912100000_p4_7_signup_publico_organizacao.sql']) {
    await db.exec(file(`supabase/migrations/${migration}`))
  }
  await db.exec(file('supabase/migrations/20260917061212_fundacao_auth_global.sql'))
  await db.exec(file('supabase/migrations/20260917234152_quarantine_unscoped_legacy_rls.sql'))
  await db.exec(file('supabase/migrations/20260917234538_quarantine_legacy_security_definers.sql'))
  await db.exec(`
    insert into legacy_secrets(secret) values('preserved');
    insert into organizations(id,nome,slug) values('${orgA}','A','org-a'),('${orgB}','B','org-b');
    insert into app_private.auth_invitations(email,organization_id,role) values
      ('a@example.com','${orgA}','member'),('b@example.com','${orgB}','owner'),('zero@example.com',null,'member');
    insert into auth.users(id,email,email_confirmed_at) values
      ('${userA}','a@example.com',now()),('${userB}','b@example.com',now()),('${userZero}','zero@example.com',now());
    insert into auth.sessions(id,user_id) values('${sessionA}','${userA}'),('${sessionB}','${userB}'),('${sessionZero}','${userZero}');
    insert into processos(id,organization_id,nome) values('${processA}','${orgA}','A'),('${processB}','${orgB}','B');
    insert into orcamentos(id,processo_id,nome) values('${uuid(41)}','${processA}','A'),('${uuid(42)}','${processB}','B'),('${uuid(43)}',null,'orphan');
    insert into orcamento_itens(id,orcamento_id,nome) values('${uuid(51)}','${uuid(41)}','A'),('${uuid(52)}','${uuid(42)}','B'),('${uuid(53)}','${uuid(43)}','orphan');
    insert into boards(id,processo_id) values('${uuid(61)}','${processA}'),('${uuid(62)}',null);
    insert into board_files(board_id) values('${uuid(61)}'),('${uuid(62)}'),(null);
  `)
}, 30000)
beforeEach(async () => { await db.exec('reset role'); await db.exec('begin') })
afterAll(async () => { await db.close() })
afterEach(async () => { await db.exec('rollback'); await db.exec('reset role') })

describe('global identity: real PostgreSQL migration and RLS', () => {
  it('rejects signup without approved invitation, including technical-email claims', async () => {
    await expect(db.exec(`insert into auth.users(email) values('intruder@example.com')`)).rejects.toThrow(/approved invitation/)
  })
  it('does not promote an unconfirmed invitation or forged metadata', async () => {
    await db.exec(`insert into app_private.auth_invitations(email,organization_id,role) values('pending@example.com','${orgA}','member');
      insert into auth.users(id,email,raw_user_meta_data) values('${uuid(4)}','pending@example.com','{"platform_admin":true,"role":"owner"}');`)
    expect(await scalar(`select count(*) from organization_members where user_id='${uuid(4)}'`)).toBe(0)
    await db.exec(`update auth.users set email_confirmed_at=now() where id='${uuid(4)}'`)
    expect(await scalar(`select role from organization_members where user_id='${uuid(4)}'`)).toBe('member')
    expect(await scalar(`select count(*) from app_private.platform_admins where user_id='${uuid(4)}'`)).toBe(0)
  })
  it('has zero memberships for an invited global identity with no organization', async () => {
    await asUser(userZero, sessionZero)
    expect(await scalar('select count(*) from organization_members')).toBe(0)
    expect(await scalar('select current_organization_id()')).toBe(null)
    expect(await scalar('select count(*) from processos')).toBe(0)
  })
  it('allows selector self-read but requires explicit organization selection for business data', async () => {
    await asUser()
    expect(await scalar('select count(*) from organization_members')).toBe(1)
    expect(await scalar('select count(*) from organizations')).toBe(1)
    expect(await scalar('select count(*) from processos')).toBe(0)
    await db.query('select select_organization($1)',[orgA])
    expect(await scalar('select current_organization_id()')).toBe(orgA)
    expect(await rows('select nome from processos')).toEqual([{ nome: 'A' }])
    expect(await rows('select nome from orcamentos')).toEqual([{ nome: 'A' }])
    expect(await rows('select nome from orcamento_itens')).toEqual([{ nome: 'A' }])
    expect(await scalar('select count(*) from board_files')).toBe(1)
    expect(await scalar('select processo_is_accessible(null)')).toBe(false)
  })
  it('denies selecting another tenant even with forged owner and platform admin metadata', async () => {
    await asUser(userA,sessionA,{ platform_admin:true, role:'owner', organization_id:orgB })
    expect(await scalar('select is_platform_admin()')).toBe(false)
    await expect(db.query('select select_organization($1)',[orgB])).rejects.toThrow(/denied/)
  })
  it('does not let a member promote themselves or link another profile', async () => {
    await asUser()
    await expect(db.exec(`update organization_members set role='owner' where user_id='${userA}'`)).rejects.toThrow(/permission denied/)
  })
  it('locks auth linkage and legacy privilege columns even on the own profile', async () => {
    await asUser()
    await expect(db.exec(`update profiles set tipo='admin' where auth_user_id='${userA}'`)).rejects.toThrow(/permission denied/)
  })
  it('rejects linking a self profile to a different auth identity', async () => {
    await asUser()
    await expect(db.exec(`update profiles set auth_user_id='${userB}' where auth_user_id='${userA}'`)).rejects.toThrow(/permission denied/)
  })
  it('rejects profile creation directly through the authenticated data API', async () => {
    await asUser()
    await expect(db.exec(`insert into profiles(name,tipo) values('claim','admin')`)).rejects.toThrow(/permission denied/)
  })
  it('allows safe self edits, never another user profile', async () => {
    await asUser()
    expect(await scalar(`update profiles set name='New name' where auth_user_id='${userA}' returning name`)).toBe('New name')
    expect(await rows(`update profiles set name='hacked' where auth_user_id='${userB}' returning id`)).toEqual([])
    expect(await scalar('select count(*) from profiles')).toBe(1)
  })
  it('prevents anonymous profile reads and claims', async () => {
    await db.exec('set role anon')
    await expect(db.exec('select * from profiles')).rejects.toThrow(/permission denied/)
  })
  it('quarantines legacy tables with unconditional policies without deleting rows', async () => {
    await asUser()
    expect(await scalar('select count(*) from legacy_secrets')).toBe(0)
    await db.exec('reset role')
    expect(await scalar('select count(*) from legacy_secrets')).toBe(1)
  })
  it('revokes legacy SECURITY DEFINER functions from Data API roles', async () => {
    await asUser()
    await expect(db.exec('select legacy_security_definer()')).rejects.toThrow(/permission denied/)
  })
  it('supports multiple memberships while isolating current selection per session', async () => {
    await db.exec(`insert into organization_members(organization_id,profile_id,user_id,role,papel)
      select '${orgB}',id,'${userA}','member','membro' from profiles where auth_user_id='${userA}'`)
    await asUser()
    expect(await scalar('select count(*) from organization_members')).toBe(2)
    await db.query('select select_organization($1)',[orgA])
    await db.query('select select_organization($1)',[orgB])
    expect(await rows('select nome from processos')).toEqual([{ nome: 'B' }])
    await db.exec('reset role')
    await db.exec(`insert into auth.sessions(id,user_id) values('${uuid(14)}','${userA}')`)
    await asUser(userA,uuid(14))
    expect(await scalar('select current_organization_id()')).toBe(null)
  })
  it('platform administrator never bypasses tenant RLS', async () => {
    await db.exec(`insert into app_private.platform_admins(user_id) values('${userA}')`)
    await asUser()
    expect(await scalar('select is_platform_admin()')).toBe(true)
    await db.query('select select_organization($1)',[orgA])
    expect(await scalar(`select processo_is_accessible('${processB}')`)).toBe(false)
    expect(await rows('select nome from processos')).toEqual([{ nome: 'A' }])
  })
  it('rejects moving an accessible process to another tenant', async () => {
    await asUser(); await db.query('select select_organization($1)',[orgA])
    await expect(db.exec(`update processos set organization_id='${orgB}' where id='${processA}'`)).rejects.toThrow(/row-level security/)
  })
  it('creates a process only in the selected tenant', async () => {
    await asUser(); await db.query('select select_organization($1)',[orgA])
    await db.exec(`insert into processos(organization_id,nome) values('${orgA}','new')`)
    expect(await scalar('select count(*) from processos')).toBe(2)
    await expect(db.exec(`insert into processos(organization_id,nome) values('${orgB}','forged')`)).rejects.toThrow(/row-level security/)
  })
  it('revokes tenant access when the organization is disabled', async () => {
    await asUser(); await db.query('select select_organization($1)',[orgA])
    await db.exec('reset role'); await db.exec(`update organizations set ativo=false where id='${orgA}'`)
    await asUser()
    expect(await scalar('select current_organization_id()')).toBe(null)
    expect(await scalar('select count(*) from organization_members')).toBe(0)
  })
  it('rejects an expired session even when the JWT remains present', async () => {
    await db.exec(`update auth.sessions set not_after=now()-interval '1 second' where id='${sessionA}'`)
    await asUser()
    expect(await scalar('select current_profile_id()')).toBe(null)
  })
  it('rejects a real session belonging to another user', async () => {
    await asUser(userA,sessionB)
    expect(await scalar('select current_profile_id()')).toBe(null)
  })
  it('revokes technical email resolver despite explicit historical anon grants', async () => {
    await db.exec('set role anon')
    await expect(db.exec(`select * from resolver_acesso_organizacao('org-a','owner')`)).rejects.toThrow(/permission denied/)
  })
  it('keeps admin audit rows private and records trusted role changes', async () => {
    await db.exec(`update organization_members set role='admin',papel='admin' where user_id='${userA}'`)
    expect(await scalar(`select details->'new'->>'role' from app_private.auth_audit_log where event='membership_changed' and subject_user_id='${userA}' order by id desc limit 1`)).toBe('admin')
    await asUser()
    await expect(db.exec('select * from app_private.auth_audit_log')).rejects.toThrow(/permission denied/)
  })
  it('rejects access immediately when session is deleted or membership deactivated', async () => {
    await asUser(); await db.query('select select_organization($1)',[orgA])
    await db.exec('reset role'); await db.exec(`update organization_members set ativo=false where user_id='${userA}'`)
    await asUser(); expect(await scalar('select current_organization_id()')).toBe(null)
    await db.exec('reset role'); await db.exec(`update organization_members set ativo=true where user_id='${userA}'; delete from auth.sessions where id='${sessionA}'`)
    await asUser(); expect(await scalar('select current_profile_id()')).toBe(null)
    expect(await scalar('select count(*) from processos')).toBe(0)
  })
  it('writes actor-bound session events and rejects unsupported admin events', async () => {
    await asUser(); await db.query('select select_organization($1)',[orgA])
    await db.exec(`select log_auth_event('password_changed')`)
    await db.exec('reset role')
    expect(await scalar(`select actor_user_id from app_private.auth_audit_log where event='password_changed' order by id desc limit 1`)).toBe(userA)
    await asUser()
    await expect(db.exec(`select log_auth_event('platform_admin_changed')`)).rejects.toThrow(/Unsupported/)
  })
  it('provisions the confirmed initial owner only in Sandbox', async () => {
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${uuid(5)}','comercialgrupoexclusive@gmail.com',now())`)
    expect(await scalar(`select role from organization_members where user_id='${uuid(5)}'`)).toBe('owner')
    expect(await scalar(`select count(*) from app_private.platform_admins where user_id='${uuid(5)}'`)).toBe(1)
    expect(await scalar(`select o.slug from organizations o join organization_members m on o.id=m.organization_id where m.user_id='${uuid(5)}'`)).toBe('sandbox')
  })
})
