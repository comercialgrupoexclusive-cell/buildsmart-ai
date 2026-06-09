'use client'

import { useEffect, useState, useRef } from 'react'
import { Sun, Moon, Database, Info, Pipette, ListChecks, Plus, Trash2, Monitor, Users, Pencil, X, ShieldCheck } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BackupRestauracaoModal } from '@/components/ui/BackupRestauracaoModal'
import { APP_VERSION } from '@/lib/version'
import { CLIMA_ATIVO_KEY, CLIMA_THRESHOLD_KEY, CLIMA_THRESHOLD_DEFAULT, readClimaSettings } from '@/components/dashboard/ClimaWidgets'
import { SINAPI_UFS, type Profile } from '@/lib/types'

const EMPTY_USER_FORM = {
  name: '',
  apelido: '',
  descricao: '',
  cidade: '',
  estado: '',
  password: '',
  tipo: 'usuario' as 'admin' | 'usuario',
  theme_color: '#3B7BF8',
}

const ACCENT_OPTIONS = [
  { color: '#3B7BF8', label: 'Azul' },
  { color: '#10B981', label: 'Verde' },
  { color: '#F59E0B', label: 'Âmbar' },
  { color: '#EF4444', label: 'Vermelho' },
  { color: '#8B5CF6', label: 'Roxo' },
  { color: '#EC4899', label: 'Rosa' },
  { color: '#14B8A6', label: 'Teal' },
  { color: '#F97316', label: 'Laranja' },
]

const ETAPAS_PADRAO_KEY = 'buildsmart-etapas-padrao'
const WELCOME_HIDDEN_KEY = 'buildsmart-welcome-hidden'

const ETAPAS_PADRAO_SINAPI = [
  'Serviços preliminares',
  'Administração local',
  'Mobilização e desmobilização',
  'Canteiro de obras',
  'Movimento de terra',
  'Fundações',
  'Estrutura',
  'Alvenaria e vedação',
  'Cobertura',
  'Impermeabilização',
  'Instalações hidrossanitárias',
  'Instalações elétricas',
  'Instalações especiais',
  'Esquadrias',
  'Revestimentos internos',
  'Revestimentos externos',
  'Pisos',
  'Pintura',
  'Louças e metais',
  'Serviços complementares',
]

export default function ConfiguracoesPage() {
  const { currentProfile, setCurrentProfile, theme, toggleTheme } = useProfile()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showBackup, setShowBackup] = useState(false)
  const [nome, setNome] = useState(currentProfile?.name || '')
  const [apelido, setApelido] = useState(currentProfile?.apelido || '')
  const [descricao, setDescricao] = useState(currentProfile?.descricao || '')
  const [cidade, setCidade] = useState(currentProfile?.cidade || '')
  const [estado, setEstado] = useState(currentProfile?.estado || '')
  const [cidadesPerfil, setCidadesPerfil] = useState<string[]>([])
  const [cidadesLoading, setCidadesLoading] = useState(false)
  const [accentColor, setAccentColor] = useState(currentProfile?.theme_color || '#3B7BF8')
  const [darkMode, setDarkMode] = useState(currentProfile?.dark_mode ?? true)
  const [etapasPadrao, setEtapasPadrao] = useState<string[]>(ETAPAS_PADRAO_SINAPI)
  const [novaEtapaPadrao, setNovaEtapaPadrao] = useState('')
  const [showWelcomeOnEntry, setShowWelcomeOnEntry] = useState(true)
  const [climaAtivo, setClimaAtivoState] = useState(true)
  const [chuvaThreshold, setChuvaThresholdState] = useState(CLIMA_THRESHOLD_DEFAULT)
  const colorPickerRef = useRef<HTMLInputElement>(null)

  const isAdmin = currentProfile?.tipo === 'admin'
  const [users, setUsers] = useState<Profile[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM)
  const [cidadesUsuario, setCidadesUsuario] = useState<string[]>([])
  const [cidadesUsuarioLoading, setCidadesUsuarioLoading] = useState(false)
  const [userSaving, setUserSaving] = useState(false)
  const [userError, setUserError] = useState('')

  useEffect(() => {
    setNome(currentProfile?.name || '')
    setApelido(currentProfile?.apelido || '')
    setDescricao(currentProfile?.descricao || '')
    setCidade(currentProfile?.cidade || '')
    setEstado(currentProfile?.estado || '')
    setAccentColor(currentProfile?.theme_color || '#3B7BF8')
    setDarkMode(currentProfile?.dark_mode ?? true)
  }, [currentProfile])

  useEffect(() => {
    if (isAdmin) loadUsers()
  }, [isAdmin])

  async function carregarCidades(uf: string, setter: (cidades: string[]) => void, setLoadingFn: (loading: boolean) => void) {
    const cleanUf = uf.trim().toUpperCase()
    if (!cleanUf) { setter([]); return }
    setLoadingFn(true)
    try {
      const res = await fetch(`/api/localidades/municipios?uf=${encodeURIComponent(cleanUf)}`)
      const json = await res.json()
      setter(Array.isArray(json.cidades) ? json.cidades : [])
    } catch {
      setter([])
    } finally {
      setLoadingFn(false)
    }
  }

  useEffect(() => {
    if (estado) carregarCidades(estado, setCidadesPerfil, setCidadesLoading)
  }, [estado])

  useEffect(() => {
    if (userForm.estado) carregarCidades(userForm.estado, setCidadesUsuario, setCidadesUsuarioLoading)
  }, [userForm.estado])

  async function loadUsers() {
    setUsersLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (error) {
      setUserError(`Nao foi possivel carregar usuarios: ${error.message}`)
      setUsersLoading(false)
      return
    }
    setUsers((data as Profile[]) || [])
    setUsersLoading(false)
  }

  function openCreateUser() {
    setEditingUser(null)
    setUserForm(EMPTY_USER_FORM)
    setUserError('')
    setUserModalOpen(true)
  }

  function openEditUser(profile: Profile) {
    setEditingUser(profile)
    setUserForm({
      name: profile.name,
      apelido: profile.apelido || '',
      descricao: profile.descricao || '',
      cidade: profile.cidade || '',
      estado: profile.estado || '',
      password: '',
      tipo: profile.tipo || 'usuario',
      theme_color: profile.theme_color || '#3B7BF8',
    })
    setUserError('')
    setUserModalOpen(true)
  }

  function closeUserModal() {
    setUserModalOpen(false)
    setEditingUser(null)
    setUserForm(EMPTY_USER_FORM)
    setUserError('')
  }

  async function handleSaveUser() {
    const name = userForm.name.trim()
    if (!name) {
      setUserError('Informe o nome do usuário.')
      return
    }
    if (!editingUser && !userForm.password.trim()) {
      setUserError('Defina uma senha para o novo usuário.')
      return
    }

    setUserSaving(true)
    setUserError('')

    const payload: Record<string, any> = {
      name,
      apelido: userForm.apelido.trim() || null,
      descricao: userForm.descricao.trim() || null,
      cidade: userForm.cidade.trim() || null,
      estado: userForm.estado.trim().toUpperCase() || null,
      tipo: userForm.tipo,
      theme_color: userForm.theme_color,
    }
    if (userForm.password.trim()) payload.password_hash = userForm.password.trim()

    let savedUser: Profile | null = null

    if (editingUser) {
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingUser.id)
        .select()
        .single()

      if (error) {
        setUserSaving(false)
        setUserError(`Nao foi possivel salvar o usuario: ${error.message}`)
        return
      }

      savedUser = data as Profile
      if (currentProfile && editingUser.id === currentProfile.id) {
        setCurrentProfile({ ...currentProfile, ...savedUser })
      }
    } else {
      const { data, error } = await supabase
        .from('profiles')
        .insert({ ...payload, photo_url: null, dark_mode: true, onboarding_done: false })
        .select()
        .single()

      if (error) {
        setUserSaving(false)
        setUserError(`Nao foi possivel criar o usuario: ${error.message}`)
        return
      }

      savedUser = data as Profile
    }

    if (savedUser) {
      setUsers(prev => {
        const exists = prev.some(user => user.id === savedUser?.id)
        if (exists) return prev.map(user => user.id === savedUser?.id ? savedUser : user)
        return [...prev, savedUser]
      })
    } else {
      await loadUsers()
    }
    setUserSaving(false)
    closeUserModal()
  }

  async function handleDeleteUser(profile: Profile) {
    if (profile.id === currentProfile?.id) return
    const adminCount = users.filter(u => u.tipo === 'admin').length
    if (profile.tipo === 'admin' && adminCount <= 1) {
      setUserError('Não é possível remover o único administrador.')
      return
    }
    if (!confirm(`Remover o perfil "${profile.apelido || profile.name}"? Essa ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('profiles').delete().eq('id', profile.id)
    if (error) {
      setUserError(`Nao foi possivel remover o usuario: ${error.message}`)
      return
    }
    await loadUsers()
  }

  useEffect(() => {
    setShowWelcomeOnEntry(localStorage.getItem(WELCOME_HIDDEN_KEY) !== 'true')

    const clima = readClimaSettings()
    setClimaAtivoState(clima.ativo)
    setChuvaThresholdState(clima.threshold)

    const stored = localStorage.getItem(ETAPAS_PADRAO_KEY)
    if (!stored) {
      localStorage.setItem(ETAPAS_PADRAO_KEY, JSON.stringify(ETAPAS_PADRAO_SINAPI))
      return
    }

    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) setEtapasPadrao(parsed.slice(0, 20))
    } catch {
      localStorage.setItem(ETAPAS_PADRAO_KEY, JSON.stringify(ETAPAS_PADRAO_SINAPI))
    }
  }, [])

  // Verifica se a cor selecionada é uma das pré-definidas
  const isPreset = ACCENT_OPTIONS.some(o => o.color.toLowerCase() === accentColor.toLowerCase())

  function handleColorChange(color: string) {
    setAccentColor(color)
    // Preview ao vivo
    document.documentElement.style.setProperty('--accent', color)
  }

  async function handleSave() {
    if (!currentProfile) return
    setSaving(true)
    const payload = {
      name: nome,
      apelido: apelido.trim() || null,
      descricao: descricao.trim() || null,
      cidade: cidade.trim() || null,
      estado: estado.trim().toUpperCase() || null,
      theme_color: accentColor,
      dark_mode: darkMode,
    }
    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', currentProfile.id)
      .select()
      .single()

    if (error) {
      setSaving(false)
      alert(`Nao foi possivel salvar seu perfil.\n\nErro: ${error.message}`)
      return
    }

    const updated = { ...currentProfile, ...(data as Profile) }
    setCurrentProfile(updated)
    document.documentElement.style.setProperty('--accent', accentColor)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function saveEtapasPadrao(next: string[]) {
    const cleaned = next.map(e => e.trim()).filter(Boolean).slice(0, 20)
    setEtapasPadrao(cleaned)
    localStorage.setItem(ETAPAS_PADRAO_KEY, JSON.stringify(cleaned))
  }

  function updateEtapaPadrao(index: number, value: string) {
    saveEtapasPadrao(etapasPadrao.map((etapa, i) => i === index ? value : etapa))
  }

  function addEtapaPadrao() {
    const nomeEtapa = novaEtapaPadrao.trim()
    if (!nomeEtapa || etapasPadrao.length >= 20) return
    saveEtapasPadrao([...etapasPadrao, nomeEtapa])
    setNovaEtapaPadrao('')
  }

  function removeEtapaPadrao(index: number) {
    saveEtapasPadrao(etapasPadrao.filter((_, i) => i !== index))
  }

  function resetEtapasPadrao() {
    saveEtapasPadrao(ETAPAS_PADRAO_SINAPI)
  }

  function setWelcomePreference(enabled: boolean) {
    setShowWelcomeOnEntry(enabled)

    if (enabled) {
      localStorage.removeItem(WELCOME_HIDDEN_KEY)
    } else {
      localStorage.setItem(WELCOME_HIDDEN_KEY, 'true')
    }
  }

  function setClimaAtivo(enabled: boolean) {
    setClimaAtivoState(enabled)
    localStorage.setItem(CLIMA_ATIVO_KEY, enabled ? 'true' : 'false')
    window.dispatchEvent(new Event('buildsmart:clima-settings-changed'))
  }

  function setChuvaThreshold(value: number) {
    const cleaned = Math.min(100, Math.max(1, Math.round(value) || CLIMA_THRESHOLD_DEFAULT))
    setChuvaThresholdState(cleaned)
    localStorage.setItem(CLIMA_THRESHOLD_KEY, String(cleaned))
    window.dispatchEvent(new Event('buildsmart:clima-settings-changed'))
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">

      {/* Perfil + Aparência (unificado conforme pedido) */}
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-5 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.15)' }}>
            <Info size={14} style={{ color: 'var(--accent)' }} />
          </div>
          Perfil &amp; Aparência
        </h2>

        <div className="flex flex-col gap-5">
          {/* Avatar preview */}
          {currentProfile && (
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold transition-colors duration-200"
                style={{ background: accentColor }}
              >
                {nome.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{nome || currentProfile.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Membro desde {new Date(currentProfile.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          )}

          <Input
            label="Nome"
            value={nome}
            onChange={e => setNome(e.target.value)}
          />

          <Input
            label="Apelido (opcional)"
            value={apelido}
            onChange={e => setApelido(e.target.value)}
            placeholder="Como prefere ser chamado pela IA"
          />

          <div>
            <Input
              label="Descrição breve (opcional)"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex.: engenheiro civil, gerencio 3 obras residenciais"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Ajuda a IA a personalizar respostas e sugestões para você.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Estado (UF)</label>
              <select
                value={estado}
                onChange={e => { setEstado(e.target.value); setCidade('') }}
                className="input-base w-full"
              >
                <option value="">Selecione</option>
                {SINAPI_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Cidade</label>
              <select
                value={cidade}
                onChange={e => setCidade(e.target.value)}
                className="input-base w-full"
                disabled={!estado || cidadesLoading}
              >
                <option value="">{cidadesLoading ? 'Carregando cidades...' : 'Selecione'}</option>
                {cidade && !cidadesPerfil.includes(cidade) && <option value={cidade}>{cidade}</option>}
                {cidadesPerfil.map(nome => <option key={nome} value={nome}>{nome}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs -mt-2" style={{ color: 'var(--text-secondary)' }}>
            Cidade e estado alimentam a previsão do tempo exibida no painel.
          </p>

          {/* Cor de destaque + modo claro/escuro na mesma seção */}
          <div>
            <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--text-secondary)' }}>
              Cor de destaque
            </label>
            <div className="flex gap-3 flex-wrap items-center">
              {/* Cores pré-definidas */}
              {ACCENT_OPTIONS.map(({ color, label }) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  title={label}
                  className="w-9 h-9 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                  style={{
                    background: color,
                    outline: accentColor.toLowerCase() === color.toLowerCase() ? `3px solid ${color}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}

              {/* Separador */}
              <div className="w-px h-8 flex-shrink-0" style={{ background: 'var(--border)' }} />

              {/* Cor personalizada com eyedropper */}
              <div className="relative flex-shrink-0">
                <input
                  ref={colorPickerRef}
                  type="color"
                  value={accentColor}
                  onChange={e => handleColorChange(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  style={{ zIndex: 10 }}
                />
                <button
                  onClick={() => colorPickerRef.current?.click()}
                  title="Cor personalizada"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 border-2 border-dashed relative"
                  style={{
                    background: !isPreset ? accentColor : 'var(--bg-secondary)',
                    borderColor: !isPreset ? accentColor : 'var(--border)',
                    outline: !isPreset ? `3px solid ${accentColor}` : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  {isPreset && (
                    <Pipette size={14} style={{ color: 'var(--text-secondary)' }} />
                  )}
                </button>
              </div>
            </div>

            {/* Preview da cor selecionada */}
            <div className="mt-3 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
              <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                {accentColor.toUpperCase()}
              </span>
              {!isPreset && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>
                  Personalizada
                </span>
              )}
            </div>
          </div>

          {/* Modo claro/escuro — junto da cor como pedido */}
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.12)' }}>
                {darkMode ? <Moon size={15} style={{ color: 'var(--accent)' }} /> : <Sun size={15} style={{ color: 'var(--accent)' }} />}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Modo {darkMode ? 'Escuro' : 'Claro'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Será salvo junto com as outras configurações
                </p>
              </div>
            </div>
            <button
              onClick={() => setDarkMode(v => !v)}
              className="w-12 h-6 rounded-full relative transition-colors flex-shrink-0"
              style={{ background: darkMode ? 'var(--accent)' : 'var(--border)' }}
            >
              <div
                className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform"
                style={{ transform: darkMode ? 'translateX(26px)' : 'translateX(2px)' }}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.12)' }}>
                <Monitor size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Tela de boas-vindas
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Mostrar a apresentação ao entrar no sistema
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWelcomePreference(!showWelcomeOnEntry)}
              className="flex items-center gap-2 flex-shrink-0"
              aria-pressed={showWelcomeOnEntry}
              title={showWelcomeOnEntry ? 'Boas-vindas ativada' : 'Boas-vindas desativada'}
            >
              <span className="hidden sm:inline text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {showWelcomeOnEntry ? 'Ativada' : 'Desativada'}
              </span>
              <span
                className="w-12 h-6 rounded-full relative transition-colors"
                style={{ background: showWelcomeOnEntry ? 'var(--accent)' : 'var(--border)' }}
              >
                <span
                  className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform"
                  style={{ transform: showWelcomeOnEntry ? 'translateX(26px)' : 'translateX(2px)' }}
                />
              </span>
            </button>
          </div>

          <Button loading={saving} onClick={handleSave} disabled={!nome.trim()}>
            {saved ? '✓ Salvo com sucesso!' : 'Salvar configurações'}
          </Button>
        </div>
      </div>

      {/* Clima e alertas */}
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.15)' }}>
            <Info size={14} style={{ color: 'var(--accent)' }} />
          </div>
          Clima e alertas
        </h2>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Previsão do tempo no painel
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Mostra previsão de 7 dias, alertas e atividades impactadas pela chuva
              </p>
            </div>
            <button
              type="button"
              onClick={() => setClimaAtivo(!climaAtivo)}
              className="flex items-center gap-2 flex-shrink-0"
              aria-pressed={climaAtivo}
            >
              <span
                className="w-12 h-6 rounded-full relative transition-colors"
                style={{ background: climaAtivo ? 'var(--accent)' : 'var(--border)' }}
              >
                <span
                  className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform"
                  style={{ transform: climaAtivo ? 'translateX(26px)' : 'translateX(2px)' }}
                />
              </span>
            </button>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
              Alertar quando a chance de chuva for maior que
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={100}
                value={chuvaThreshold}
                onChange={e => setChuvaThreshold(Number(e.target.value))}
                disabled={!climaAtivo}
                className="flex-1 disabled:opacity-40"
              />
              <span
                className="inline-block px-2.5 py-1 rounded-full text-sm font-medium flex-shrink-0"
                style={{ background: 'rgba(59,123,248,0.15)', color: 'var(--accent)' }}
              >
                {chuvaThreshold}%
              </span>
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Dias acima desse limite aparecem como alerta e podem sugerir replanejamento de atividades.
            </p>
          </div>
        </div>
      </div>

      {/* Etapas padrão */}
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.15)' }}>
            <ListChecks size={14} style={{ color: 'var(--accent)' }} />
          </div>
          Etapas padrão do orçamento
        </h2>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Até 20 etapas. A lista vem preenchida com um padrão próximo ao uso SINAPI/Caixa.
            </p>
            <Button variant="secondary" size="sm" onClick={resetEtapasPadrao}>
              Restaurar padrão
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {etapasPadrao.map((etapa, index) => (
              <div key={`${index}-${etapa}`} className="flex items-center gap-2">
                <span className="w-7 text-xs text-right" style={{ color: 'var(--text-secondary)' }}>
                  {index + 1}.
                </span>
                <input
                  value={etapa}
                  onChange={e => updateEtapaPadrao(index, e.target.value)}
                  className="input-base flex-1"
                />
                <button
                  onClick={() => removeEtapaPadrao(index)}
                  className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                  title="Remover etapa"
                >
                  <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                </button>
              </div>
            ))}
          </div>

          {etapasPadrao.length < 20 && (
            <div className="flex gap-2 pt-2">
              <input
                value={novaEtapaPadrao}
                onChange={e => setNovaEtapaPadrao(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEtapaPadrao()}
                placeholder="Nova etapa padrão"
                className="input-base flex-1"
              />
              <Button onClick={addEtapaPadrao} icon={<Plus size={16} />} disabled={!novaEtapaPadrao.trim()}>
                Adicionar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Gestão de usuários — apenas ADM */}
      {isAdmin && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.15)' }}>
                <Users size={14} style={{ color: 'var(--accent)' }} />
              </div>
              Gestão de usuários
            </h2>
            <Button size="sm" icon={<Plus size={16} />} onClick={openCreateUser}>
              Novo usuário
            </Button>
          </div>

          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            Como administrador, você pode criar, editar e remover perfis, e definir quem é administrador do sistema.
          </p>

          {usersLoading ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Carregando usuários...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {users.map(user => (
                <div key={user.id} className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    {user.photo_url ? (
                      <img src={user.photo_url} alt={user.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                        style={{ background: user.theme_color || 'var(--accent)' }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {user.apelido || user.name}
                        </p>
                        {user.tipo === 'admin' && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                            style={{ background: 'rgba(59,123,248,0.15)', color: 'var(--accent)' }}
                          >
                            <ShieldCheck size={11} />
                            ADM
                          </span>
                        )}
                        {user.id === currentProfile?.id && (
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>(você)</span>
                        )}
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {[user.cidade, user.estado].filter(Boolean).join(' / ') || 'Localização não informada'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditUser(user)}
                      className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors"
                      title="Editar usuário"
                    >
                      <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user)}
                      disabled={user.id === currentProfile?.id}
                      className="p-2 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={user.id === currentProfile?.id ? 'Você não pode remover seu próprio perfil aqui' : 'Remover usuário'}
                    >
                      <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de criação/edição de usuário */}
      {userModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={closeUserModal}
        >
          <div
            className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-enter"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editingUser ? 'Editar usuário' : 'Novo usuário'}
              </h3>
              <button onClick={closeUserModal} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
                <X size={16} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <Input
                label="Nome"
                value={userForm.name}
                onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))}
              />
              <Input
                label="Apelido (opcional)"
                value={userForm.apelido}
                onChange={e => setUserForm(f => ({ ...f, apelido: e.target.value }))}
                placeholder="Como prefere ser chamado pela IA"
              />
              <Input
                label="Descrição breve (opcional)"
                value={userForm.descricao}
                onChange={e => setUserForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Ex.: engenheiro civil, gerencio 3 obras residenciais"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Estado (UF)</label>
                  <select
                    value={userForm.estado}
                    onChange={e => setUserForm(f => ({ ...f, estado: e.target.value, cidade: '' }))}
                    className="input-base w-full"
                  >
                    <option value="">Selecione</option>
                    {SINAPI_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Cidade</label>
                  <select
                    value={userForm.cidade}
                    onChange={e => setUserForm(f => ({ ...f, cidade: e.target.value }))}
                    className="input-base w-full"
                    disabled={!userForm.estado || cidadesUsuarioLoading}
                  >
                    <option value="">{cidadesUsuarioLoading ? 'Carregando cidades...' : 'Selecione'}</option>
                    {userForm.cidade && !cidadesUsuario.includes(userForm.cidade) && <option value={userForm.cidade}>{userForm.cidade}</option>}
                    {cidadesUsuario.map(nome => <option key={nome} value={nome}>{nome}</option>)}
                  </select>
                </div>
              </div>
              <Input
                label={editingUser ? 'Nova senha (opcional)' : 'Senha'}
                type="password"
                value={userForm.password}
                onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editingUser ? 'Deixe em branco para manter a atual' : 'Defina uma senha de acesso'}
              />

              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                  Tipo de perfil
                </label>
                <div className="flex gap-2">
                  {(['usuario', 'admin'] as const).map(tipo => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setUserForm(f => ({ ...f, tipo }))}
                      disabled={editingUser?.id === currentProfile?.id && tipo !== 'admin'}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: userForm.tipo === tipo ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: userForm.tipo === tipo ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {tipo === 'admin' ? 'Administrador' : 'Usuário comum'}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Administradores podem gerenciar todos os usuários do sistema.
                </p>
              </div>

              {userError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}>
                  {userError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={closeUserModal} className="flex-1">
                  Cancelar
                </Button>
                <Button loading={userSaving} onClick={handleSaveUser} className="flex-1">
                  {editingUser ? 'Salvar alterações' : 'Criar usuário'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backup e restauração */}
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.15)' }}>
            <Database size={14} style={{ color: 'var(--accent)' }} />
          </div>
          Backup e restauração do sistema
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Baixe uma cópia completa de todos os dados do sistema ou restaure a partir de um backup anterior.
        </p>
        <Button variant="secondary" size="sm" icon={<Database size={14} />} onClick={() => setShowBackup(true)}>
          Backup / restaurar dados
        </Button>
      </div>

      {/* Integrações */}
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.15)' }}>
            <Database size={14} style={{ color: 'var(--accent)' }} />
          </div>
          Integrações
        </h2>

        <div className="flex flex-col gap-3">
          {[
            { label: 'Supabase', desc: 'Banco de dados', status: 'Conectado' },
            { label: 'Claude API (Anthropic)', desc: 'BuildAssist IA', status: 'Configurar chave em .env.local' },
            { label: 'Open-Meteo API', desc: 'Previsão do tempo (gratuita, sem chave)', status: 'Conectado' },
          ].map(({ label, desc, status }) => (
            <div key={label} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: status === 'Conectado' ? 'rgba(16,185,129,0.15)' : 'var(--bg-card)',
                  color: status === 'Conectado' ? 'var(--success)' : 'var(--text-secondary)',
                  border: `1px solid ${status === 'Conectado' ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                }}>
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Versão */}
      <div className="card p-4 text-center">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          BuildSmart AI v{APP_VERSION} — Next.js 16 + Supabase + Claude API
        </p>
      </div>

      <BackupRestauracaoModal open={showBackup} onClose={() => setShowBackup(false)} />
    </div>
  )
}
