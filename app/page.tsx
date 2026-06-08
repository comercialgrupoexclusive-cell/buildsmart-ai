'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, X, CheckSquare, Square, Lock, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Profile } from '@/lib/types'
import { APP_VERSION } from '@/lib/version'

const ACCENT_OPTIONS = [
  '#3B7BF8', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
]

function ProfileSelectionPage() {
  const router = useRouter()
  const { setCurrentProfile } = useProfile()
  const supabase = createClient()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    theme_color: '#3B7BF8',
    dark_mode: true,
    photo_url: '',
    password: '',
  })
  const [saving, setSaving] = useState(false)
  // Estado para perfil que requer senha
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setProfiles(data || [])
    setLoading(false)
  }

  async function handleSelectProfile(profile: Profile) {
    if (profile.password_hash) {
      // Tem senha — pedir antes de entrar
      setPendingProfile(profile)
      setPasswordInput('')
      setPasswordError(false)
      return
    }
    enterProfile(profile)
  }

  function enterProfile(profile: Profile) {
    setCurrentProfile(profile)
    if (!profile.onboarding_done) {
      router.push('/onboarding')
    } else {
      router.push('/dashboard')
    }
  }

  async function handlePasswordSubmit() {
    if (!pendingProfile) return
    // Comparação simples (sem hash real para MVP — melhorar depois)
    if (passwordInput === pendingProfile.password_hash) {
      enterProfile(pendingProfile)
      setPendingProfile(null)
    } else {
      setPasswordError(true)
    }
  }

  async function handleSaveProfile() {
    if (!formData.name.trim()) return
    setSaving(true)

    const payload: any = {
      name: formData.name,
      theme_color: formData.theme_color,
      dark_mode: formData.dark_mode,
      photo_url: formData.photo_url || null,
      password_hash: formData.password.trim() || null,
    }

    if (editingProfile) {
      await supabase.from('profiles').update(payload).eq('id', editingProfile.id)
    } else {
      await supabase.from('profiles').insert({ ...payload, onboarding_done: false })
    }

    setSaving(false)
    setShowForm(false)
    setEditingProfile(null)
    resetForm()
    loadProfiles()
  }

  async function handleDeleteProfile(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Remover este perfil?')) return
    await supabase.from('profiles').delete().eq('id', id)
    loadProfiles()
  }

  function openEdit(profile: Profile, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingProfile(profile)
    setFormData({
      name: profile.name,
      theme_color: profile.theme_color,
      dark_mode: profile.dark_mode,
      photo_url: profile.photo_url || '',
      password: profile.password_hash || '',
    })
    setShowForm(true)
  }

  function resetForm() {
    setFormData({ name: '', theme_color: '#3B7BF8', dark_mode: true, photo_url: '', password: '' })
    setEditingProfile(null)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'var(--bg-primary)' }}>
      {/* Logo */}
      <div className="mb-12 text-center animate-enter">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl" style={{ background: 'var(--accent)' }}>
            B
          </div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}>
            BuildSmart <span style={{ color: 'var(--accent)' }}>AI</span>
            <span
              className="ml-2 align-middle text-xs font-medium px-1.5 py-0.5 rounded-md"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              v{APP_VERSION}
            </span>
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Gestão de obras residenciais inteligente
        </p>
      </div>

      {/* Seleção de perfis */}
      <div className="w-full max-w-2xl animate-enter" style={{ animationDelay: '100ms' }}>
        <p className="text-center text-sm mb-6 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Quem vai usar agora?
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 justify-center">
            {profiles.map((profile) => (
              // div em vez de button para evitar button-dentro-de-button (hydration error)
              <div
                key={profile.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectProfile(profile)}
                onKeyDown={e => e.key === 'Enter' && handleSelectProfile(profile)}
                className="relative group flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-200 hover:scale-105 w-36 cursor-pointer"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                {profile.photo_url ? (
                  <img src={profile.photo_url} alt={profile.name} className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ background: profile.theme_color }}>
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-center leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {profile.name}
                </span>

                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => openEdit(profile, e)} className="p-1 rounded-md" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={(e) => handleDeleteProfile(profile.id, e)} className="p-1 rounded-md" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={() => { resetForm(); setShowForm(true) }}
              className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-dashed transition-all duration-200 hover:scale-105 w-36"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center border-2 border-current">
                <Plus size={24} />
              </div>
              <span className="text-sm font-medium">Novo perfil</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal de senha */}
      {pendingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPendingProfile(null)} />
          <div className="card relative w-full max-w-xs p-6 animate-enter" style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-col items-center gap-3 mb-5">
              {pendingProfile.photo_url ? (
                <img src={pendingProfile.photo_url} alt={pendingProfile.name} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ background: pendingProfile.theme_color }}>
                  {pendingProfile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-center">
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{pendingProfile.name}</p>
                <p className="text-xs flex items-center gap-1 justify-center mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  <Lock size={11} /> Perfil protegido por senha
                </p>
              </div>
            </div>
            <div className="relative mb-3">
              <input
                type={showPw ? 'text' : 'password'}
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordError(false) }}
                onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="Digite sua senha"
                className="input-base pr-10"
                autoFocus
                style={passwordError ? { borderColor: 'var(--danger)' } : {}}
              />
              <button
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs mb-3 text-center" style={{ color: 'var(--danger)' }}>Senha incorreta</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setPendingProfile(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                Entrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de perfil */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowForm(false); resetForm() }} />
          <div className="card relative w-full max-w-sm p-6 animate-enter" style={{ background: 'var(--bg-card)' }}>
            <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>
              {editingProfile ? 'Editar perfil' : 'Novo perfil'}
            </h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Nome</label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveProfile()}
                  placeholder="Seu nome"
                  className="input-base"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Cor de destaque</label>
                <div className="flex gap-2 flex-wrap">
                  {ACCENT_OPTIONS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData(f => ({ ...f, theme_color: color }))}
                      className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                      style={{
                        background: color,
                        outline: formData.theme_color === color ? `2px solid ${color}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => setFormData(f => ({ ...f, dark_mode: !f.dark_mode }))}
                className="flex items-center gap-2.5 text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {formData.dark_mode
                  ? <CheckSquare size={18} style={{ color: 'var(--accent)' }} />
                  : <Square size={18} />
                }
                Preferir modo escuro
              </button>

              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                  Senha (opcional)
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(f => ({ ...f, password: e.target.value }))}
                  placeholder="Deixe em branco para sem senha"
                  className="input-base"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Se definida, será pedida ao selecionar este perfil.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowForm(false); resetForm() }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={!formData.name.trim() || saving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  return <ProfileSelectionPage />
}
