'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  BotMessageSquare, MessageSquare, Phone, Power, Save, ShieldOff,
  Trash2, Users, Plus, Link2, Image as ImageIcon, Mic, UsersRound,
  Settings2, ToggleLeft, ToggleRight, Send, RefreshCw, Wrench,
} from 'lucide-react'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type WaMessage = { id: string; phone: string; sender_name: string | null; role: 'user' | 'assistant'; content: string; created_at: string }
type PhoneRule = { phone: string; nome: string | null; persona: string | null; bloqueado: boolean; profile_id: string | null }
type Profile = { id: string; name: string }
type Conversa = { phone: string; nome: string; msgs: WaMessage[]; isGroup: boolean }
type Tab = 'conversas' | 'usuarios' | 'disparos' | 'configuracao'

type Dispatch = {
  id: string
  nome: string
  tipo: 'resumo_obra' | 'personalizada' | 'resumo_tarefas'
  obra_id: string | null
  destino_phone: string
  destino_nome: string | null
  mensagem: string | null
  dias_semana: string
  horario: string
  recorrente: boolean
  ativo: boolean
  last_sent_at: string | null
  next_run_at: string | null
}

type DispatchLog = { id: string; dispatch_id: string; sent_at: string; conteudo: string; status: string; erro: string | null }

const DIAS_SEMANA = [
  { v: 0, label: 'Dom' }, { v: 1, label: 'Seg' }, { v: 2, label: 'Ter' }, { v: 3, label: 'Qua' },
  { v: 4, label: 'Qui' }, { v: 5, label: 'Sex' }, { v: 6, label: 'Sáb' },
]

// Próxima execução no fuso America/Sao_Paulo (UTC-3) + jitter 0-2 min
function calcNextRun(diasSemana: string, horario: string): Date | null {
  const dias = diasSemana.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6)
  if (dias.length === 0 || !horario) return null
  const hhmm = horario.slice(0, 5)
  const now = new Date()
  for (let i = 0; i < 8; i++) {
    const spNow = new Date(now.getTime() - 3 * 3600 * 1000)
    const candidate = new Date(spNow)
    candidate.setUTCDate(candidate.getUTCDate() + i)
    if (!dias.includes(candidate.getUTCDay())) continue
    const dateStr = candidate.toISOString().split('T')[0]
    const runAt = new Date(`${dateStr}T${hhmm}:00-03:00`)
    if (runAt.getTime() > now.getTime()) {
      return new Date(runAt.getTime() + Math.floor(Math.random() * 120 * 1000))
    }
  }
  return null
}

type Config = {
  persona_global: string
  bot_name: string
  modo_pausado: boolean
  crud_enabled: boolean
  audio_enabled: boolean
  photos_enabled: boolean
  groups_enabled: boolean
  group_require_mention: boolean
}

const DEFAULT_PERSONA = `Voce e a Luiza, assistente inteligente do BuildSmart AI, sistema de gestao de obras para construcao civil. Responda via WhatsApp de forma breve, clara e em portugues brasileiro. NAO use markdown (asterisco, hashtag, bullet). Escreva texto simples. Maximo 3 paragrafos curtos. Quando puder ajudar com dados do sistema (obras, materiais, medicoes), use as funcoes disponiveis.`

function fmt(dt: string) {
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Mascara o telefone/grupo para exibição na aba Usuários (não é dado
// sensível de terceiros fora do painel admin, mas evita expor o número
// completo à primeira vista na listagem).
function maskPhone(phone: string): string {
  if (phone.endsWith('-group')) return `Grupo •••${phone.slice(-10, -6)}`
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return phone
  return `${digits.slice(0, 4)}•••••${digits.slice(-2)}`
}

// Projeção ÚNICA "vínculo" para a aba Usuários: profiles ↔
// luizia_wa_phone_rules.profile_id — nunca um segundo cadastro. Cada
// profile aparece uma vez (vinculado ou não); telefones de phone_rules sem
// profile_id nenhum aparecem à parte como "sem perfil".
type Vinculo =
  | { tipo: 'vinculado'; profile: Profile; rule: PhoneRule }
  | { tipo: 'sem_whatsapp'; profile: Profile }
  | { tipo: 'sem_perfil'; rule: PhoneRule }

function montarVinculos(profiles: Profile[], rules: PhoneRule[]): Vinculo[] {
  const porProfileId = new Map(rules.filter(r => r.profile_id).map(r => [r.profile_id as string, r]))
  const vinculos: Vinculo[] = profiles.map(p => {
    const rule = porProfileId.get(p.id)
    return rule ? { tipo: 'vinculado', profile: p, rule } : { tipo: 'sem_whatsapp', profile: p }
  })
  for (const r of rules) {
    if (!r.profile_id) vinculos.push({ tipo: 'sem_perfil', rule: r })
  }
  return vinculos
}

function MsgContent({ content }: { content: string }) {
  if (content.startsWith('[foto]')) return <><ImageIcon size={11} className="inline mr-1" />{content.slice(6).trim()}</>
  if (content.startsWith('[audio]')) return <><Mic size={11} className="inline mr-1" />{content.slice(7).trim()}</>
  return <>{content}</>
}

function Toggle({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
      </div>
      <button onClick={onToggle} className="flex-shrink-0 transition-colors">
        {on
          ? <ToggleRight size={32} style={{ color: 'var(--accent)' }} />
          : <ToggleLeft size={32} style={{ color: 'var(--text-secondary)' }} />}
      </button>
    </div>
  )
}

export default function AdminLuizaPage() {
  const db = supabase()
  const [tab, setTab] = useState<Tab>('conversas')
  const [msg, setMsg] = useState('')

  // ── Estado conversas ────────────────────────────────────────────────────────
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [rules, setRules] = useState<PhoneRule[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [nomePhone, setNomePhone] = useState('')
  const [personaPhone, setPersonaPhone] = useState('')
  const [profileIdPhone, setProfileIdPhone] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])

  // ── Estado usuários (projeção profiles ↔ luizia_wa_phone_rules.profile_id,
  // nunca um cadastro paralelo) ────────────────────────────────────────────────
  const [vinculando, setVinculando] = useState<string | null>(null) // profile.id sendo vinculado, ou null
  const [vincularTelefoneExistente, setVincularTelefoneExistente] = useState('')
  const [vincularTelefoneNovo, setVincularTelefoneNovo] = useState('')
  const [savingVinculo, setSavingVinculo] = useState(false)

  // ── Estado configuração ─────────────────────────────────────────────────────
  const [config, setConfig] = useState<Config>({
    persona_global: DEFAULT_PERSONA,
    bot_name: 'Luiza',
    modo_pausado: false,
    crud_enabled: true,
    audio_enabled: true,
    photos_enabled: true,
    groups_enabled: true,
    group_require_mention: false,
  })
  const [savingConfig, setSavingConfig] = useState(false)

  // ── Teste ao vivo ───────────────────────────────────────────────────────────
  const [testMsg, setTestMsg] = useState('')
  const [testHistory, setTestHistory] = useState<{ role: 'user' | 'luizia'; text: string }[]>([])
  const [testing, setTesting] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Disparos ─────────────────────────────────────────────────────────────────
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [dispatchLogs, setDispatchLogs] = useState<DispatchLog[]>([])
  const [obras, setObras] = useState<{ id: string; nome: string; status: string }[]>([])
  const [editingDispatch, setEditingDispatch] = useState<string | null>(null) // id ou 'novo'
  const [savingDispatch, setSavingDispatch] = useState(false)
  const [sendingNow, setSendingNow] = useState<string | null>(null)
  const [dispatchForm, setDispatchForm] = useState({
    nome: '', tipo: 'resumo_obra' as 'resumo_obra' | 'personalizada' | 'resumo_tarefas',
    obra_id: '', destino_phone: '', mensagem: '',
    dias: [1, 2, 3, 4, 5] as number[], horario: '07:30', recorrente: true,
  })

  // ── Load ─────────────────────────────────────────────────────────────────────
  async function load() {
    const [cfgRes, msgsRes, rulesRes, dispRes, logsRes, obrasRes, profilesRes] = await Promise.all([
      db.from('luizia_wa_config').select('key,value'),
      db.from('luizia_wa_messages').select('*').order('created_at', { ascending: false }).limit(300),
      db.from('luizia_wa_phone_rules').select('*'),
      db.from('luizia_wa_dispatches').select('*').order('created_at', { ascending: false }),
      db.from('luizia_wa_dispatch_log').select('*').order('sent_at', { ascending: false }).limit(50),
      db.from('obras').select('id,nome,status').order('created_at', { ascending: false }),
      db.from('profiles').select('id,name').order('name'),
    ])
    setDispatches((dispRes.data || []) as Dispatch[])
    setDispatchLogs((logsRes.data || []) as DispatchLog[])
    setObras((obrasRes.data || []) as { id: string; nome: string; status: string }[])
    setProfiles((profilesRes.data || []) as Profile[])

    const cfgMap = Object.fromEntries((cfgRes.data || []).map((r: any) => [r.key, r.value]))
    setConfig({
      persona_global: cfgMap['persona_global'] || DEFAULT_PERSONA,
      bot_name: cfgMap['bot_name'] || 'Luiza',
      modo_pausado: cfgMap['modo_pausado'] === 'true',
      crud_enabled: cfgMap['crud_enabled'] !== 'false',
      audio_enabled: cfgMap['audio_enabled'] !== 'false',
      photos_enabled: cfgMap['photos_enabled'] !== 'false',
      groups_enabled: cfgMap['groups_enabled'] !== 'false',
      group_require_mention: cfgMap['group_require_mention'] === 'true',
    })

    const msgs: WaMessage[] = (msgsRes.data || []).reverse()
    const byPhone: Record<string, WaMessage[]> = {}
    for (const m of msgs) { if (!byPhone[m.phone]) byPhone[m.phone] = []; byPhone[m.phone].push(m) }
    setConversas(Object.entries(byPhone).map(([phone, list]) => ({
      phone,
      nome: list.find(m => m.role === 'user' && m.sender_name)?.sender_name || phone,
      msgs: list,
      isGroup: phone.length > 20 || /^120363/.test(phone),
    })))
    setRules(rulesRes.data || [])
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [testHistory])

  // Sinal cross-componente para o caso do admin ter esta página aberta
  // enquanto usa o chat flutuante (que fica visível em qualquer página) —
  // ver components/layout/LuiziaFloatingChat.tsx / lib/luizia-avisos-ai-
  // tools.ts. Dentro desta própria página, Conversas e Usuários já
  // compartilham o mesmo estado (rules/profiles) — não precisam do evento
  // entre si, só o load() já reaproveitado por toda ação de escrita.
  useEffect(() => {
    function onChanged() { void load() }
    window.addEventListener('buildsmart:luiza-dispatches-changed', onChanged)
    window.addEventListener('buildsmart:luiza-users-changed', onChanged)
    return () => {
      window.removeEventListener('buildsmart:luiza-dispatches-changed', onChanged)
      window.removeEventListener('buildsmart:luiza-users-changed', onChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  // ── Config ─────────────────────────────────────────────────────────────────
  async function saveConfig() {
    setSavingConfig(true)
    const entries = [
      ['persona_global', config.persona_global],
      ['bot_name', config.bot_name.trim() || 'Luiza'],
      ['modo_pausado', String(config.modo_pausado)],
      ['crud_enabled', String(config.crud_enabled)],
      ['audio_enabled', String(config.audio_enabled)],
      ['photos_enabled', String(config.photos_enabled)],
      ['groups_enabled', String(config.groups_enabled)],
      ['group_require_mention', String(config.group_require_mention)],
    ]
    for (const [key, value] of entries) {
      await db.from('luizia_wa_config').upsert({ key, value, updated_at: new Date().toISOString() })
    }
    setSavingConfig(false)
    flash('Configuracoes salvas!')
  }

  function setToggle(key: keyof Config, val: boolean) {
    setConfig(c => ({ ...c, [key]: val }))
  }

  // ── Conversas ───────────────────────────────────────────────────────────────
  function selectPhone(phone: string) {
    setSelectedPhone(phone)
    const rule = rules.find(r => r.phone === phone)
    setNomePhone(rule?.nome || '')
    setPersonaPhone(rule?.persona || '')
    setProfileIdPhone(rule?.profile_id || '')
  }

  async function savePhoneRule(bloqueado?: boolean) {
    if (!selectedPhone) return
    setSavingPhone(true)
    await db.from('luizia_wa_phone_rules').upsert({
      phone: selectedPhone,
      nome: nomePhone || null,
      persona: personaPhone || null,
      profile_id: profileIdPhone || null,
      bloqueado: bloqueado !== undefined ? bloqueado : (rules.find(r => r.phone === selectedPhone)?.bloqueado || false),
      updated_at: new Date().toISOString(),
    })
    await load()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('buildsmart:luiza-users-changed'))
    setSavingPhone(false)
    flash('Regra salva!')
  }

  async function clearHistory(phone: string) {
    if (!confirm(`Apagar historico de ${phone}?`)) return
    await db.from('luizia_wa_messages').delete().eq('phone', phone)
    await load()
    if (selectedPhone === phone) setSelectedPhone(null)
  }

  // ── Usuários (projeção profiles ↔ phone_rules — mesma fonte da aba
  // Conversas, nunca um segundo cadastro) ───────────────────────────────────────
  function abrirVincular(profileId: string) {
    setVinculando(profileId)
    setVincularTelefoneExistente('')
    setVincularTelefoneNovo('')
  }

  async function vincularProfile(profileId: string) {
    const phoneExistente = vincularTelefoneExistente
    const phoneNovo = vincularTelefoneNovo.trim().replace(/\D/g, '')
    const phone = phoneExistente || phoneNovo
    if (!phone) return
    setSavingVinculo(true)
    const ruleAtual = rules.find(r => r.phone === phone)
    await db.from('luizia_wa_phone_rules').upsert({
      phone,
      profile_id: profileId,
      nome: ruleAtual?.nome || null,
      persona: ruleAtual?.persona || null,
      bloqueado: ruleAtual?.bloqueado || false,
      updated_at: new Date().toISOString(),
    })
    setVinculando(null)
    setVincularTelefoneExistente('')
    setVincularTelefoneNovo('')
    await load()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('buildsmart:luiza-users-changed'))
    setSavingVinculo(false)
    flash('WhatsApp vinculado!')
  }

  async function desvincularProfile(phone: string) {
    if (!confirm('Desvincular este WhatsApp do perfil?')) return
    await db.from('luizia_wa_phone_rules').update({ profile_id: null, updated_at: new Date().toISOString() }).eq('phone', phone)
    await load()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('buildsmart:luiza-users-changed'))
    flash('WhatsApp desvinculado.')
  }

  // ── Disparos ─────────────────────────────────────────────────────────────────
  function openDispatchForm(d?: Dispatch) {
    if (d) {
      setDispatchForm({
        nome: d.nome, tipo: d.tipo, obra_id: d.obra_id || '',
        destino_phone: d.destino_phone, mensagem: d.mensagem || '',
        dias: d.dias_semana.split(',').map(x => parseInt(x)).filter(x => !isNaN(x)),
        horario: d.horario.slice(0, 5), recorrente: d.recorrente,
      })
      setEditingDispatch(d.id)
    } else {
      setDispatchForm({ nome: '', tipo: 'resumo_obra', obra_id: '', destino_phone: '', mensagem: '', dias: [1, 2, 3, 4, 5], horario: '07:30', recorrente: true })
      setEditingDispatch('novo')
    }
  }

  async function saveDispatch() {
    const f = dispatchForm
    if (!f.nome.trim() || !f.destino_phone || f.dias.length === 0) return
    if (f.tipo === 'resumo_obra' && !f.obra_id) { flash('Escolha a obra para o resumo.'); return }
    if (f.tipo === 'personalizada' && !f.mensagem.trim()) { flash('Escreva a mensagem personalizada.'); return }
    setSavingDispatch(true)

    const diasStr = [...f.dias].sort().join(',')
    const next = calcNextRun(diasStr, f.horario)
    const row = {
      nome: f.nome.trim(),
      tipo: f.tipo,
      obra_id: (f.tipo === 'resumo_obra' || f.tipo === 'resumo_tarefas') ? (f.obra_id || null) : null,
      destino_phone: f.destino_phone,
      destino_nome: conversas.find(c => c.phone === f.destino_phone)?.nome
        || rules.find(r => r.phone === f.destino_phone)?.nome || null,
      mensagem: f.mensagem.trim() || null,
      dias_semana: diasStr,
      horario: f.horario + ':00',
      recorrente: f.recorrente,
      ativo: true,
      next_run_at: next ? next.toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    if (editingDispatch && editingDispatch !== 'novo') {
      await db.from('luizia_wa_dispatches').update(row).eq('id', editingDispatch)
    } else {
      await db.from('luizia_wa_dispatches').insert(row)
    }
    setEditingDispatch(null)
    await load()
    setSavingDispatch(false)
    flash('Disparo salvo!')
  }

  async function toggleDispatchAtivo(d: Dispatch) {
    const updates: Record<string, unknown> = { ativo: !d.ativo, updated_at: new Date().toISOString() }
    if (!d.ativo) {
      // Reativando: recalcula próximo envio
      const next = calcNextRun(d.dias_semana, d.horario)
      updates.next_run_at = next ? next.toISOString() : null
    }
    await db.from('luizia_wa_dispatches').update(updates).eq('id', d.id)
    await load()
  }

  async function deleteDispatch(id: string) {
    if (!confirm('Excluir este disparo?')) return
    await db.from('luizia_wa_dispatch_log').delete().eq('dispatch_id', id)
    await db.from('luizia_wa_dispatches').delete().eq('id', id)
    await load()
  }

  async function sendDispatchNow(id: string) {
    setSendingNow(id)
    try {
      const res = await fetch('/api/whatsapp/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatch_id: id }),
      })
      const data = await res.json()
      if (data.reason === 'sem_tarefas_relevantes') flash('Nenhuma tarefa relevante para enviar — nada foi mandado pelo WhatsApp.')
      else if (!data.ok) flash(`Erro: ${data.erro || data.error || 'falha no envio'}`)
      else flash('Mensagem enviada agora!')
    } catch (err: any) {
      flash(`Erro: ${err.message}`)
    }
    setSendingNow(null)
    await load()
  }

  // ── Teste ao vivo ─────────────────────────────────────────────────────────
  async function sendTest() {
    const text = testMsg.trim()
    if (!text || testing) return
    setTestMsg('')
    setTesting(true)
    setTestHistory(h => [...h, { role: 'user', text }])
    try {
      const res = await fetch('/api/luizia-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: testHistory }),
      })
      const data = await res.json()
      setTestHistory(h => [...h, { role: 'luizia', text: data.reply || data.error || 'Erro ao obter resposta' }])
    } catch (err: any) {
      setTestHistory(h => [...h, { role: 'luizia', text: `Erro: ${err.message}` }])
    }
    setTesting(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const selectedConv = conversas.find(c => c.phone === selectedPhone)
  const selectedRule = rules.find(r => r.phone === selectedPhone)

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'conversas', label: 'Conversas', icon: <MessageSquare size={13} /> },
    { key: 'usuarios', label: 'Usuarios', icon: <Users size={13} /> },
    { key: 'disparos', label: 'Disparos', icon: <Send size={13} /> },
    { key: 'configuracao', label: 'Configuracao', icon: <Settings2 size={13} /> },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="card p-4 flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BotMessageSquare size={20} style={{ color: 'var(--accent)' }} />
            Painel — Luiza WhatsApp
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {conversas.length} conversa(s) · {rules.filter(r => r.profile_id).length} vinculado(s)
            {config.modo_pausado && <span className="ml-2 px-1.5 py-0.5 rounded text-white text-xs" style={{ background: '#f59e0b' }}>PAUSADA</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="p-2 rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => { setToggle('modo_pausado', !config.modo_pausado); void saveConfig() }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: config.modo_pausado ? '#22c55e' : '#f59e0b', color: 'white' }}
          >
            <Power size={15} />
            {config.modo_pausado ? 'Reativar' : 'Pausar'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl px-4 py-2.5 text-sm text-center font-medium" style={{ background: 'var(--accent)', color: 'white' }}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: tab === t.key ? 'var(--accent)' : 'var(--bg-secondary)', color: tab === t.key ? 'white' : 'var(--text-secondary)' }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── CONVERSAS ─────────────────────────────────────────────────────── */}
      {tab === 'conversas' && (
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
          <aside className="card p-3 flex flex-col gap-2 max-h-[74vh] overflow-y-auto">
            <p className="text-xs font-semibold uppercase tracking-wide px-1" style={{ color: 'var(--text-secondary)' }}>Conversas</p>
            {conversas.length === 0
              ? <p className="text-sm p-2" style={{ color: 'var(--text-secondary)' }}>Nenhuma ainda.</p>
              : conversas.map(c => {
                  const rule = rules.find(r => r.phone === c.phone)
                  const vinculado = !!rule?.profile_id
                  const last = c.msgs[c.msgs.length - 1]
                  return (
                    <button key={c.phone} onClick={() => selectPhone(c.phone)}
                      className="w-full text-left rounded-xl p-2.5 transition-colors"
                      style={{ background: selectedPhone === c.phone ? 'var(--accent)' : 'var(--bg-secondary)', color: selectedPhone === c.phone ? 'white' : 'var(--text-primary)', opacity: rule?.bloqueado ? 0.5 : 1 }}>
                      <div className="flex items-center gap-1.5">
                        {c.isGroup ? <UsersRound size={12} /> : <Phone size={12} />}
                        <span className="font-medium text-sm truncate">{rule?.nome || c.nome}</span>
                        {rule?.bloqueado && <ShieldOff size={10} />}
                        {vinculado && <Link2 size={10} aria-label="Vinculado a um perfil do BuildSmart" />}
                      </div>
                      <p className="text-xs opacity-65 truncate">{c.msgs.length} msgs {last && `· ${last.content.slice(0, 28)}…`}</p>
                    </button>
                  )
                })}
          </aside>

          <main className="flex flex-col gap-4">
            {selectedConv ? (
              <div className="card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                      {selectedConv.isGroup ? <UsersRound size={15} style={{ color: 'var(--accent)' }} /> : <MessageSquare size={15} style={{ color: 'var(--accent)' }} />}
                      {selectedRule?.nome || selectedConv.nome}
                      {selectedConv.isGroup && <span className="text-xs px-1.5 py-0.5 rounded-full ml-1" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>Grupo</span>}
                    </h2>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{selectedConv.phone}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => void savePhoneRule(!selectedRule?.bloqueado)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
                      style={{ background: selectedRule?.bloqueado ? '#22c55e' : '#ef4444', color: 'white' }}>
                      <ShieldOff size={11} />{selectedRule?.bloqueado ? 'Desbloquear' : 'Bloquear'}
                    </button>
                    <button onClick={() => void clearHistory(selectedConv.phone)}
                      className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      <Trash2 size={11} /> Limpar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Nome</label>
                    <input value={nomePhone} onChange={e => setNomePhone(e.target.value)} className="input-base text-sm" placeholder="Nome de exibicao" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Instrucao especifica</label>
                    <input value={personaPhone} onChange={e => setPersonaPhone(e.target.value)} className="input-base text-sm" placeholder="Ex: Trate com prioridade" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Vincular a um perfil do BuildSmart</label>
                  <select value={profileIdPhone} onChange={e => setProfileIdPhone(e.target.value)} className="input-base text-sm max-w-xs">
                    <option value="">Nao vinculado</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Necessario para a Luiza responder &quot;minhas tarefas&quot;/&quot;o que tenho hoje&quot; com seguranca — sem isso ela nao adivinha quem e a pessoa e pede o vinculo.
                  </p>
                </div>
                <button onClick={() => void savePhoneRule()} disabled={savingPhone}
                  className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  <Save size={11} />{savingPhone ? 'Salvando...' : 'Salvar'}
                </button>

                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                  {selectedConv.msgs.map(m => (
                    <div key={m.id}
                      className={`rounded-xl px-3 py-2 text-sm max-w-[82%] ${m.role === 'user' ? 'self-start' : 'self-end'}`}
                      style={{ background: m.role === 'user' ? 'var(--bg-secondary)' : 'var(--accent)', color: m.role === 'user' ? 'var(--text-primary)' : 'white' }}>
                      <p className="text-xs opacity-55 mb-0.5">{m.role === 'user' ? m.sender_name || 'User' : (config.bot_name || 'Luiza')} · {fmt(m.created_at)}</p>
                      <p className="whitespace-pre-wrap"><MsgContent content={m.content} /></p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card p-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Selecione uma conversa para ver o historico.
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── USUARIOS ──────────────────────────────────────────────────────── */}
      {/* Projeção de profiles ↔ luizia_wa_phone_rules.profile_id — a MESMA
          fonte da aba Conversas, nunca um cadastro paralelo (luizia_wa_users
          foi removida: não existe mais no banco). Vincular/desvincular aqui
          e na aba Conversas mexem exatamente na mesma linha, então os dois
          lugares já mostram sempre o mesmo estado (mesmo array `rules`). */}
      {tab === 'usuarios' && (
        <div className="flex flex-col gap-5">
          <div className="card p-5 flex flex-col gap-3">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <UsersRound size={15} style={{ color: 'var(--accent)' }} />
              Usuários — vínculo com WhatsApp
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Cada perfil do BuildSmart pode estar vinculado a um número/grupo de WhatsApp — necessário para a Luiza responder &quot;minhas tarefas&quot;/&quot;me avise&quot; com segurança, sem adivinhar quem é a pessoa.
            </p>

            <div className="flex flex-col gap-2">
              {profiles.length === 0 && rules.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum perfil nem conversa ainda.</p>
              )}
              {montarVinculos(profiles, rules).map(v => {
                if (v.tipo === 'vinculado') {
                  return (
                    <div key={`p-${v.profile.id}`} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="min-w-0">
                        <p className="font-medium text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                          {v.profile.name}
                          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Vinculado</span>
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          WhatsApp: {maskPhone(v.rule.phone)}{v.rule.nome ? ` · ${v.rule.nome}` : ''}
                        </p>
                      </div>
                      <button onClick={() => void desvincularProfile(v.rule.phone)}
                        className="text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>
                        Desvincular
                      </button>
                    </div>
                  )
                }
                if (v.tipo === 'sem_whatsapp') {
                  const aberto = vinculando === v.profile.id
                  const naoVinculadas = rules.filter(r => !r.profile_id)
                  return (
                    <div key={`p-${v.profile.id}`} className="flex flex-col gap-2 rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                          {v.profile.name}
                          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>Sem WhatsApp</span>
                        </p>
                        <button onClick={() => aberto ? setVinculando(null) : abrirVincular(v.profile.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0 flex items-center gap-1"
                          style={{ background: 'var(--accent)', color: 'white' }}>
                          <Link2 size={11} /> {aberto ? 'Cancelar' : 'Vincular WhatsApp'}
                        </button>
                      </div>
                      {aberto && (
                        <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                          {naoVinculadas.length > 0 && (
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Telefone/grupo já em Conversas</label>
                              <select value={vincularTelefoneExistente} onChange={e => setVincularTelefoneExistente(e.target.value)} className="input-base text-sm">
                                <option value="">Selecione...</option>
                                {naoVinculadas.map(r => <option key={r.phone} value={r.phone}>{r.nome || maskPhone(r.phone)}</option>)}
                              </select>
                            </div>
                          )}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Ou um número novo (DDI sem +)</label>
                            <input value={vincularTelefoneNovo} onChange={e => setVincularTelefoneNovo(e.target.value)}
                              className="input-base text-sm" placeholder="5551995076895" disabled={!!vincularTelefoneExistente} />
                          </div>
                          <button onClick={() => void vincularProfile(v.profile.id)}
                            disabled={savingVinculo || (!vincularTelefoneExistente && !vincularTelefoneNovo.trim())}
                            className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                            style={{ background: 'var(--accent)', color: 'white' }}>
                            <Save size={11} />{savingVinculo ? 'Salvando...' : 'Salvar vínculo'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <div key={`r-${v.rule.phone}`} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--bg-secondary)', opacity: 0.85 }}>
                    <div className="min-w-0">
                      <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{v.rule.nome || maskPhone(v.rule.phone)}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {maskPhone(v.rule.phone)} · <span style={{ color: '#f59e0b' }}>Telefone sem perfil</span>
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── DISPAROS ──────────────────────────────────────────────────────── */}
      {tab === 'disparos' && (
        <div className="flex flex-col gap-5">
          {/* Cabeçalho + novo */}
          <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Send size={15} style={{ color: 'var(--accent)' }} />
                Mensagens automáticas
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Resumos de obra gerados pela IA ou mensagens fixas, enviados nos dias e horários escolhidos (com atraso aleatório de até 2 min).
              </p>
            </div>
            <button onClick={() => openDispatchForm()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}>
              <Plus size={14} /> Novo disparo
            </button>
          </div>

          {/* Form criar/editar */}
          {editingDispatch && (
            <div className="card p-5 flex flex-col gap-4" style={{ border: '1px solid var(--accent)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {editingDispatch === 'novo' ? 'Novo disparo' : 'Editar disparo'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Nome do disparo</label>
                  <input value={dispatchForm.nome} onChange={e => setDispatchForm(f => ({ ...f, nome: e.target.value }))}
                    className="input-base text-sm" placeholder="Ex: Status diário - Obra Sobrado" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Tipo</label>
                  <select value={dispatchForm.tipo}
                    onChange={e => setDispatchForm(f => ({ ...f, tipo: e.target.value as 'resumo_obra' | 'personalizada' | 'resumo_tarefas' }))}
                    className="input-base text-sm">
                    <option value="resumo_obra">🤖 Resumo da obra (gerado pela IA)</option>
                    <option value="resumo_tarefas">📋 Resumo de tarefas (atrasadas/hoje/aguardando)</option>
                    <option value="personalizada">✍️ Mensagem personalizada (texto fixo)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(dispatchForm.tipo === 'resumo_obra' || dispatchForm.tipo === 'resumo_tarefas') && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      Obra vinculada{dispatchForm.tipo === 'resumo_tarefas' ? ' (opcional — filtra só tarefas dessa obra)' : ''}
                    </label>
                    <select value={dispatchForm.obra_id}
                      onChange={e => setDispatchForm(f => ({ ...f, obra_id: e.target.value }))}
                      className="input-base text-sm">
                      <option value="">{dispatchForm.tipo === 'resumo_tarefas' ? 'Todas as obras/projetos' : 'Selecione a obra...'}</option>
                      {obras.map(o => <option key={o.id} value={o.id}>{o.nome} ({o.status})</option>)}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Enviar para (conversa/grupo já existente)
                  </label>
                  <select value={dispatchForm.destino_phone}
                    onChange={e => setDispatchForm(f => ({ ...f, destino_phone: e.target.value }))}
                    className="input-base text-sm">
                    <option value="">Selecione o destino...</option>
                    {conversas.map(c => (
                      <option key={c.phone} value={c.phone}>
                        {c.isGroup ? '👥 ' : '👤 '}{rules.find(r => r.phone === c.phone)?.nome || c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {dispatchForm.tipo !== 'resumo_tarefas' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {dispatchForm.tipo === 'personalizada' ? 'Mensagem a enviar' : 'Instrução extra para a IA (opcional)'}
                  </label>
                  <textarea value={dispatchForm.mensagem} onChange={e => setDispatchForm(f => ({ ...f, mensagem: e.target.value }))}
                    rows={3} className="input-base resize-y text-sm"
                    placeholder={dispatchForm.tipo === 'personalizada'
                      ? 'Ex: Bom dia equipe! Lembrem de preencher o diário de obra até as 17h.'
                      : 'Ex: Destaque sempre os materiais pendentes e cobre prazos.'} />
                </div>
              )}
              {dispatchForm.tipo === 'resumo_tarefas' && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Resumo gerado automaticamente (sem IA): atrasadas, tarefas que vencem hoje, próximas urgentes/altas nos
                  próximos 3 dias e tarefas aguardando há mais de 2 dias — do responsável ligado ao destino escolhido
                  (nome vinculado ao contato/grupo, comparado com o nome do usuário no BuildSmart). Se não houver nada
                  relevante, nada é enviado nesse dia.
                </p>
              )}

              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Dias da semana</label>
                  <div className="flex gap-1.5">
                    {DIAS_SEMANA.map(d => {
                      const on = dispatchForm.dias.includes(d.v)
                      return (
                        <button key={d.v}
                          onClick={() => setDispatchForm(f => ({ ...f, dias: on ? f.dias.filter(x => x !== d.v) : [...f.dias, d.v] }))}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: on ? 'var(--accent)' : 'var(--bg-secondary)', color: on ? 'white' : 'var(--text-secondary)' }}>
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Horário</label>
                  <input type="time" value={dispatchForm.horario}
                    onChange={e => setDispatchForm(f => ({ ...f, horario: e.target.value }))}
                    className="input-base text-sm w-28" />
                </div>
                <button
                  onClick={() => setDispatchForm(f => ({ ...f, recorrente: !f.recorrente }))}
                  className="px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: dispatchForm.recorrente ? 'var(--accent)' : 'var(--bg-secondary)', color: dispatchForm.recorrente ? 'white' : 'var(--text-secondary)' }}>
                  {dispatchForm.recorrente ? '🔁 Recorrente' : '1️⃣ Enviar uma vez'}
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingDispatch(null)}
                  className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button onClick={() => void saveDispatch()} disabled={savingDispatch}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  <Save size={13} />{savingDispatch ? 'Salvando...' : 'Salvar disparo'}
                </button>
              </div>
            </div>
          )}

          {/* Lista de disparos */}
          <div className="flex flex-col gap-3">
            {dispatches.length === 0 && !editingDispatch && (
              <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Nenhum disparo configurado ainda. Clique em "Novo disparo" para começar.
              </div>
            )}
            {dispatches.map(d => {
              const diasLabel = d.dias_semana.split(',').map(x => DIAS_SEMANA.find(ds => ds.v === parseInt(x))?.label).filter(Boolean).join(', ')
              return (
                <div key={d.id} className="card p-4 flex flex-col gap-2" style={{ opacity: d.ativo ? 1 : 0.55 }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        {d.tipo === 'resumo_obra' ? '🤖' : d.tipo === 'resumo_tarefas' ? '📋' : '✍️'} {d.nome}
                        {!d.ativo && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>inativo</span>}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        Para: {d.destino_nome || d.destino_phone} · {diasLabel} às {d.horario.slice(0, 5)} · {d.recorrente ? 'recorrente' : 'envio único'}
                        {(d.tipo === 'resumo_obra' || d.tipo === 'resumo_tarefas') && d.obra_id && ` · Obra: ${obras.find(o => o.id === d.obra_id)?.nome || '?'}`}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {d.last_sent_at ? `Último envio: ${fmt(d.last_sent_at)}` : 'Nunca enviado'}
                        {d.ativo && d.next_run_at && ` · Próximo: ${fmt(d.next_run_at)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => void sendDispatchNow(d.id)} disabled={sendingNow === d.id}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>
                        {sendingNow === d.id ? 'Enviando...' : '⚡ Enviar agora'}
                      </button>
                      <button onClick={() => openDispatchForm(d)}
                        className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        Editar
                      </button>
                      <button onClick={() => void toggleDispatchAtivo(d)} className="p-1">
                        {d.ativo
                          ? <ToggleRight size={26} style={{ color: 'var(--accent)' }} />
                          : <ToggleLeft size={26} style={{ color: 'var(--text-secondary)' }} />}
                      </button>
                      <button onClick={() => void deleteDispatch(d.id)} className="p-1.5 rounded-lg" style={{ color: '#ef4444' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Histórico deste disparo */}
                  {dispatchLogs.filter(l => l.dispatch_id === d.id).slice(0, 3).map(l => (
                    <div key={l.id} className="text-xs rounded-lg px-2.5 py-1.5 flex items-center gap-2"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      <span style={{ color: l.status === 'ok' ? '#22c55e' : '#ef4444' }}>{l.status === 'ok' ? '✓' : '✗'}</span>
                      <span className="flex-shrink-0">{fmt(l.sent_at)}</span>
                      <span className="truncate">{l.erro || l.conteudo.slice(0, 80)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CONFIGURACAO ──────────────────────────────────────────────────── */}
      {tab === 'configuracao' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
          {/* Esquerda: persona + toggles */}
          <div className="flex flex-col gap-5">
            {/* Nome da IA */}
            <div className="card p-5 flex flex-col gap-3">
              <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <BotMessageSquare size={15} style={{ color: 'var(--accent)' }} />
                Nome da IA
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Como ela se apresenta e qual nome ativa a resposta em grupos (quando exigir mencao).
              </p>
              <input
                value={config.bot_name}
                onChange={e => setConfig(c => ({ ...c, bot_name: e.target.value }))}
                className="input-base text-sm max-w-xs"
                placeholder="Luiza"
              />
            </div>

            {/* Persona */}
            <div className="card p-5 flex flex-col gap-3">
              <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <BotMessageSquare size={15} style={{ color: 'var(--accent)' }} />
                Personalidade (System Prompt)
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Define como a IA se comporta em todas as conversas. Escreva em linguagem natural — ela segue estas instrucoes no WhatsApp.
              </p>
              <textarea
                value={config.persona_global}
                onChange={e => setConfig(c => ({ ...c, persona_global: e.target.value }))}
                rows={9}
                className="input-base resize-y text-sm font-mono"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfig(c => ({ ...c, persona_global: DEFAULT_PERSONA }))}
                  className="text-xs px-3 py-1.5 rounded-xl"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  Restaurar padrao
                </button>
                <button onClick={() => void saveConfig()} disabled={savingConfig}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  <Save size={13} />{savingConfig ? 'Salvando...' : 'Salvar tudo'}
                </button>
              </div>
            </div>

            {/* Feature toggles */}
            <div className="card p-5 flex flex-col gap-3">
              <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Wrench size={15} style={{ color: 'var(--accent)' }} />
                Funcionalidades
              </h2>
              <Toggle on={config.crud_enabled} onToggle={() => setToggle('crud_enabled', !config.crud_enabled)}
                label="Acoes no BuildSmart (CRUD)"
                desc="A IA pode criar obras, etapas, materiais e registrar medicoes via WhatsApp" />
              <Toggle on={config.audio_enabled} onToggle={() => setToggle('audio_enabled', !config.audio_enabled)}
                label="Transcricao de audio (Whisper)"
                desc="Transcreve mensagens de voz e responde o conteudo" />
              <Toggle on={config.photos_enabled} onToggle={() => setToggle('photos_enabled', !config.photos_enabled)}
                label="Analise de fotos (GPT-4o Vision)"
                desc="Analisa imagens enviadas e descreve o que ve" />
              <Toggle on={config.groups_enabled} onToggle={() => setToggle('groups_enabled', !config.groups_enabled)}
                label="Responder em grupos"
                desc="Ela participa de grupos de WhatsApp" />
              <Toggle on={config.group_require_mention} onToggle={() => setToggle('group_require_mention', !config.group_require_mention)}
                label={`Exigir \"${config.bot_name}\" no grupo`}
                desc={`OFF = responde a tudo no grupo | ON = so responde quando alguem escrever \"${config.bot_name}\"`} />
              <button onClick={() => void saveConfig()} disabled={savingConfig}
                className="self-start flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium mt-1"
                style={{ background: 'var(--accent)', color: 'white' }}>
                <Save size={13} />{savingConfig ? 'Salvando...' : 'Salvar configuracoes'}
              </button>
            </div>
          </div>

          {/* Direita: chat de teste */}
          <div className="card p-4 flex flex-col gap-3 h-fit sticky top-4">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Send size={14} style={{ color: 'var(--accent)' }} />
              Testar a IA ao vivo
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Simula uma conversa com a IA usando a persona atual. Nao envia WhatsApp.
            </p>

            <div className="flex flex-col gap-2 min-h-[200px] max-h-80 overflow-y-auto rounded-xl p-2" style={{ background: 'var(--bg-secondary)' }}>
              {testHistory.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                  Digite algo para testar...
                </p>
              )}
              {testHistory.map((h, i) => (
                <div key={i}
                  className={`rounded-xl px-3 py-2 text-sm max-w-[90%] ${h.role === 'user' ? 'self-end' : 'self-start'}`}
                  style={{
                    background: h.role === 'user' ? 'var(--accent)' : 'var(--bg-card, #1a1a1a)',
                    color: h.role === 'user' ? 'white' : 'var(--text-primary)',
                    border: h.role !== 'user' ? '1px solid var(--border)' : 'none',
                  }}>
                  <p className="whitespace-pre-wrap">{h.text}</p>
                </div>
              ))}
              {testing && (
                <div className="self-start rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                  Digitando...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="flex gap-2">
              <input
                value={testMsg}
                onChange={e => setTestMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && void sendTest()}
                className="input-base text-sm flex-1"
                placeholder="Ex: quais obras temos ativas?"
                disabled={testing}
              />
              <button onClick={() => void sendTest()} disabled={!testMsg.trim() || testing}
                className="px-3 py-2 rounded-xl flex-shrink-0"
                style={{ background: 'var(--accent)', color: 'white', opacity: (!testMsg.trim() || testing) ? 0.5 : 1 }}>
                <Send size={14} />
              </button>
            </div>
            <button onClick={() => setTestHistory([])} className="text-xs self-start" style={{ color: 'var(--text-secondary)' }}>
              Limpar conversa de teste
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
