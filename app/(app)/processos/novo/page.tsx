'use client'

// Motor de Processo (P3.2) — "Criar Processo": entrada única nova (seção 9
// do contrato P2). Campos deliberadamente mínimos, os mesmos do Core
// (P3.1) — não replica todos os campos de /projetos ou /obras.
//
// UI construída só com os padrões de components/ui/ (ver
// PROCESSO_P3_PADROES_UI.md) — nenhum estilo inline reinventado aqui.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { criarProcesso } from '@/lib/processo'
import { useProfile } from '@/lib/profile-context'
import type { Profile } from '@/lib/types'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'

const EMPTY_FORM = {
  nome: '',
  tipo: '',
  cliente_nome: '',
  endereco: '',
  responsavel_id: '',
}

type OrgOption = {
  id: string
  nome: string
}

export default function NovoProcessoPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { currentProfile } = useProfile()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [organizacoes, setOrganizacoes] = useState<OrgOption[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [loadingOrg, setLoadingOrg] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('profiles').select('id, name, apelido').order('name').then(({ data }: { data: Profile[] | null }) => {
      setProfiles(data ?? [])
    })
  }, [supabase])

  useEffect(() => {
    let active = true
    async function loadOrganizacoes() {
      if (!currentProfile?.id) {
        setLoadingOrg(false)
        return
      }

      setLoadingOrg(true)
      const { data: memberships, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('profile_id', currentProfile.id)
        .eq('ativo', true)

      if (!active) return

      if (error) {
        setErro('Não foi possível carregar sua organização ativa.')
        setLoadingOrg(false)
        return
      }

      const ids = Array.from(
        new Set((memberships ?? []).map((m: { organization_id: string | null }) => m.organization_id).filter(Boolean)),
      ) as string[]
      if (ids.length === 0) {
        setOrganizacoes([])
        setOrganizationId('')
        setLoadingOrg(false)
        return
      }

      const { data: orgs, error: orgError } = await supabase
        .from('organizations')
        .select('id, nome')
        .in('id', ids)
        .order('nome')

      if (!active) return

      if (orgError) {
        setErro('Não foi possível carregar sua organização ativa.')
        setLoadingOrg(false)
        return
      }

      const options = (orgs ?? []) as OrgOption[]
      setOrganizacoes(options)
      setOrganizationId(prev => prev || (options.length === 1 ? options[0].id : ''))
      setLoadingOrg(false)
    }

    loadOrganizacoes()
    return () => { active = false }
  }, [currentProfile?.id, supabase])

  async function handleSave() {
    setErro(null)
    if (!form.nome.trim()) {
      setErro('Nome do processo é obrigatório.')
      return
    }
    if (organizacoes.length > 1 && !organizationId) {
      setErro('Selecione a organização do processo.')
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
        organization_id: organizationId || null,
      })
      router.push(`/processos/${processo.id}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      setErro(
        message.includes('row-level security')
          ? 'Você não tem permissão para criar processos nesta organização.'
          : message || 'Não foi possível criar o processo.',
      )
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

      <PageHeader
        title="Criar Processo"
        subtitle="Os módulos habilitados por padrão (Dados Gerais, Projeto técnico, Orçamento, Planejamento, Tarefas) podem ser ajustados depois de criado."
      />

      <div className="card space-y-4 p-5">
        {organizacoes.length > 1 && (
          <Select
            label="Organização"
            value={organizationId}
            onChange={e => setOrganizationId(e.target.value)}
          >
            <option value="">— Selecionar organização —</option>
            {organizacoes.map(org => (
              <option key={org.id} value={org.id}>{org.nome}</option>
            ))}
          </Select>
        )}
        <Input
          label="Nome *"
          placeholder="Ex: Jardim Allegra"
          value={form.nome}
          onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
        />
        <Input
          label="Tipo"
          placeholder="Ex: Obra para cliente, Investimento imobiliário..."
          value={form.tipo}
          onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
        />
        <Input
          label="Cliente"
          placeholder="Nome do cliente"
          value={form.cliente_nome}
          onChange={e => setForm(f => ({ ...f, cliente_nome: e.target.value }))}
        />
        <Input
          label="Endereço"
          placeholder="Rua, cidade..."
          value={form.endereco}
          onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
        />
        <Select
          label="Responsável"
          value={form.responsavel_id}
          onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}
        >
          <option value="">— Selecionar ou deixar em branco —</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.apelido || p.name}</option>
          ))}
        </Select>

        {erro && <p className="text-sm text-red-400">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/processos">
            <Button variant="secondary">Cancelar</Button>
          </Link>
          <Button onClick={handleSave} loading={saving || loadingOrg} disabled={!form.nome.trim() || loadingOrg}>
            Criar Processo
          </Button>
        </div>
      </div>
    </div>
  )
}
