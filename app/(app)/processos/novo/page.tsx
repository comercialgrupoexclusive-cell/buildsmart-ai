'use client'

// Motor de Processo (P3.2) — "Criar Processo": entrada única nova (seção 9
// do contrato P2). Campos deliberadamente mínimos, os mesmos do Core
// (P3.1) — não replica todos os campos de /projetos ou /obras.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { criarProcesso } from '@/lib/processo'
import type { Profile } from '@/lib/types'

const EMPTY_FORM = {
  nome: '',
  tipo: '',
  cliente_nome: '',
  endereco: '',
  responsavel_id: '',
}

export default function NovoProcessoPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('profiles').select('id, name, apelido').order('name').then(({ data }: { data: Profile[] | null }) => {
      setProfiles(data ?? [])
    })
  }, [supabase])

  async function handleSave() {
    setErro(null)
    if (!form.nome.trim()) {
      setErro('Nome do processo é obrigatório.')
      return
    }
    setSaving(true)
    try {
      const processo = await criarProcesso(supabase, {
        nome: form.nome,
        tipo: form.tipo || null,
        cliente_nome: form.cliente_nome || null,
        endereco: form.endereco || null,
        responsavel_id: form.responsavel_id || null,
      })
      router.push(`/processos/${processo.id}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o processo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Link href="/processos" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} />
        Voltar para Processos
      </Link>

      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Criar Processo</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Os módulos habilitados por padrão (Dados Gerais, Projeto técnico, Orçamento, Planejamento, Tarefas) podem ser ajustados depois de criado.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <Field label="Nome *">
          <input
            className="input-base"
            placeholder="Ex: Jardim Allegra"
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
          />
        </Field>
        <Field label="Tipo">
          <input
            className="input-base"
            placeholder="Ex: Obra para cliente, Investimento imobiliário..."
            value={form.tipo}
            onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
          />
        </Field>
        <Field label="Cliente">
          <input
            className="input-base"
            placeholder="Nome do cliente"
            value={form.cliente_nome}
            onChange={e => setForm(f => ({ ...f, cliente_nome: e.target.value }))}
          />
        </Field>
        <Field label="Endereço">
          <input
            className="input-base"
            placeholder="Rua, cidade..."
            value={form.endereco}
            onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
          />
        </Field>
        <Field label="Responsável">
          <select
            className="input-base"
            value={form.responsavel_id}
            onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}
          >
            <option value="">— Selecionar ou deixar em branco —</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.apelido || p.name}</option>
            ))}
          </select>
        </Field>

        {erro && <p className="text-sm" style={{ color: '#ef4444' }}>{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/processos" className="px-4 py-2 rounded-lg text-sm border" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
            Cancelar
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || !form.nome.trim()}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Criando...' : 'Criar Processo'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .input-base {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-primary);
          outline: none;
        }
        .input-base:focus { border-color: var(--accent); }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {children}
    </div>
  )
}
