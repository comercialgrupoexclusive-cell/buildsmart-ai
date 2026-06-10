'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { BotMessageSquare, MessageSquare, Phone, Power, Save, ShieldOff, Trash2 } from 'lucide-react'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type WaMessage = {
  id: string
  phone: string
  sender_name: string | null
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

type PhoneRule = {
  phone: string
  nome: string | null
  persona: string | null
  bloqueado: boolean
}

type ConversaGroup = {
  phone: string
  nome: string
  msgs: WaMessage[]
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AdminLuiziaPage() {
  const db = supabase()

  const [pausado, setPausado] = useState(false)
  const [persona, setPersona] = useState('')
  const [conversas, setConversas] = useState<ConversaGroup[]>([])
  const [rules, setRules] = useState<PhoneRule[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [personaPhone, setPersonaPhone] = useState('')
  const [nomePhone, setNomePhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingPhone, setSavingPhone] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const [cfgRes, msgsRes, rulesRes] = await Promise.all([
      db.from('luizia_wa_config').select('key,value'),
      db.from('luizia_wa_messages').select('*').order('created_at', { ascending: false }).limit(200),
      db.from('luizia_wa_phone_rules').select('*'),
    ])

    const cfg = Object.fromEntries((cfgRes.data || []).map((r: any) => [r.key, r.value]))
    setPausado(cfg['modo_pausado'] === 'true')
    setPersona(cfg['persona_global'] || '')

    const msgs: WaMessage[] = (msgsRes.data || []).reverse()
    const byPhone: Record<string, WaMessage[]> = {}
    for (const m of msgs) {
      if (!byPhone[m.phone]) byPhone[m.phone] = []
      byPhone[m.phone].push(m)
    }
    const groups: ConversaGroup[] = Object.entries(byPhone).map(([phone, list]) => ({
      phone,
      nome: list.find(m => m.sender_name && m.sender_name !== 'Luizia')?.sender_name || phone,
      msgs: list,
    }))
    setConversas(groups)
    setRules(rulesRes.data || [])
  }

  useEffect(() => { void load() }, [])

  async function togglePause() {
    const next = !pausado
    await db.from('luizia_wa_config').upsert({ key: 'modo_pausado', value: String(next), updated_at: new Date().toISOString() })
    setPausado(next)
    setMsg(next ? 'Luizia pausada — sem respostas automaticas.' : 'Luizia reativada.')
    setTimeout(() => setMsg(''), 3000)
  }

  async function savePersona() {
    setSaving(true)
    await db.from('luizia_wa_config').upsert({ key: 'persona_global', value: persona, updated_at: new Date().toISOString() })
    setSaving(false)
    setMsg('Personalidade salva!')
    setTimeout(() => setMsg(''), 2500)
  }

  function selectPhone(phone: string) {
    setSelectedPhone(phone)
    const rule = rules.find(r => r.phone === phone)
    setPersonaPhone(rule?.persona || '')
    setNomePhone(rule?.nome || '')
  }

  async function savePhoneRule(bloqueado?: boolean) {
    if (!selectedPhone) return
    setSavingPhone(true)
    const rule: PhoneRule = {
      phone: selectedPhone,
      nome: nomePhone || null,
      persona: personaPhone || null,
      bloqueado: bloqueado !== undefined ? bloqueado : (rules.find(r => r.phone === selectedPhone)?.bloqueado || false),
    }
    await db.from('luizia_wa_phone_rules').upsert({ ...rule, updated_at: new Date().toISOString() })
    await load()
    setSavingPhone(false)
    setMsg('Regra salva!')
    setTimeout(() => setMsg(''), 2500)
  }

  async function clearHistory(phone: string) {
    if (!confirm(`Apagar historico de ${phone}?`)) return
    await db.from('luizia_wa_messages').delete().eq('phone', phone)
    await load()
    if (selectedPhone === phone) setSelectedPhone(null)
  }

  const selectedConv = conversas.find(c => c.phone === selectedPhone)
  const selectedRule = rules.find(r => r.phone === selectedPhone)

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="card p-4 flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BotMessageSquare size={20} style={{ color: 'var(--accent)' }} />
            Painel Admin — Luizia WhatsApp
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {conversas.length} numero(s) com historico · {conversas.reduce((a, c) => a + c.msgs.length, 0)} mensagens
          </p>
        </div>
        <button
          onClick={() => void togglePause()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{
            background: pausado ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)',
            color: 'white',
          }}
        >
          <Power size={15} />
          {pausado ? 'Reativar Luizia' : 'Pausar Luizia'}
        </button>
      </div>

      {msg && (
        <div className="rounded-xl px-4 py-2 text-sm text-center" style={{ background: 'var(--accent)', color: 'white' }}>
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
        {/* Sidebar: lista de numeros */}
        <aside className="card p-4 flex flex-col gap-3 h-fit">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            Numeros ativos
          </p>
          {conversas.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma conversa ainda.</p>
          ) : (
            conversas.map(c => {
              const rule = rules.find(r => r.phone === c.phone)
              return (
                <button
                  key={c.phone}
                  onClick={() => selectPhone(c.phone)}
                  className="w-full text-left rounded-xl p-3 transition-colors"
                  style={{
                    background: selectedPhone === c.phone ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: selectedPhone === c.phone ? 'white' : 'var(--text-primary)',
                    opacity: rule?.bloqueado ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Phone size={14} />
                    <span className="font-medium text-sm truncate">{rule?.nome || c.nome}</span>
                    {rule?.bloqueado && <ShieldOff size={12} />}
                  </div>
                  <p className="text-xs mt-0.5 truncate opacity-75">
                    {c.phone} · {c.msgs.length} msg
                  </p>
                </button>
              )
            })
          )}
        </aside>

        {/* Main */}
        <main className="flex flex-col gap-5">
          {/* Personalidade global */}
          <div className="card p-5 flex flex-col gap-3">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              🧠 Personalidade global da Luizia
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Este texto e enviado como instrucao do sistema em todas as conversas do WhatsApp.
            </p>
            <textarea
              value={persona}
              onChange={e => setPersona(e.target.value)}
              rows={5}
              className="input-base resize-y text-sm"
              placeholder="Descreva como a Luizia deve se comportar..."
            />
            <button
              onClick={() => void savePersona()}
              disabled={saving}
              className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <Save size={14} />
              {saving ? 'Salvando...' : 'Salvar personalidade'}
            </button>
          </div>

          {/* Conversa do numero selecionado */}
          {selectedConv ? (
            <div className="card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    <MessageSquare size={16} className="inline mr-1" style={{ color: 'var(--accent)' }} />
                    {selectedRule?.nome || selectedConv.nome}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{selectedConv.phone}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void savePhoneRule(!selectedRule?.bloqueado)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{
                      background: selectedRule?.bloqueado ? 'var(--success, #22c55e)' : '#ef4444',
                      color: 'white',
                    }}
                  >
                    <ShieldOff size={12} />
                    {selectedRule?.bloqueado ? 'Desbloquear' : 'Bloquear'}
                  </button>
                  <button
                    onClick={() => void clearHistory(selectedConv.phone)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    <Trash2 size={12} /> Limpar historico
                  </button>
                </div>
              </div>

              {/* Persona especifica */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Nome de exibicao (opcional)
                </label>
                <input
                  value={nomePhone}
                  onChange={e => setNomePhone(e.target.value)}
                  className="input-base text-sm"
                  placeholder="Ex: Joao da Silva"
                />
                <label className="text-xs font-semibold mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Instrucao especifica para este numero (opcional)
                </label>
                <textarea
                  value={personaPhone}
                  onChange={e => setPersonaPhone(e.target.value)}
                  rows={3}
                  className="input-base resize-y text-sm"
                  placeholder="Ex: Esta pessoa e um cliente VIP. Trate com prioridade e seja mais detalhada nas respostas."
                />
                <button
                  onClick={() => void savePhoneRule()}
                  disabled={savingPhone}
                  className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  <Save size={12} />
                  {savingPhone ? 'Salvando...' : 'Salvar regra'}
                </button>
              </div>

              {/* Historico */}
              <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                {selectedConv.msgs.map(m => (
                  <div
                    key={m.id}
                    className={`rounded-xl px-3 py-2 text-sm max-w-[85%] ${m.role === 'user' ? 'self-start' : 'self-end'}`}
                    style={{
                      background: m.role === 'user' ? 'var(--bg-secondary)' : 'var(--accent)',
                      color: m.role === 'user' ? 'var(--text-primary)' : 'white',
                    }}
                  >
                    <p className="text-xs opacity-60 mb-0.5">{m.role === 'user' ? m.sender_name || m.role : 'Luizia'} · {fmt(m.created_at)}</p>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card p-10 text-center" style={{ color: 'var(--text-secondary)' }}>
              Selecione um numero na lista para ver a conversa e configurar regras.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
