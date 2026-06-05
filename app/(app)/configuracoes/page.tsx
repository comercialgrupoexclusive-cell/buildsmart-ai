'use client'

import { useState } from 'react'
import { Sun, Moon, Bell, Database, Info } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

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

export default function ConfiguracoesPage() {
  const { currentProfile, setCurrentProfile, theme, toggleTheme } = useProfile()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [nome, setNome] = useState(currentProfile?.name || '')
  const [accentColor, setAccentColor] = useState(currentProfile?.theme_color || '#3B7BF8')

  async function handleSave() {
    if (!currentProfile) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ name: nome, theme_color: accentColor })
      .eq('id', currentProfile.id)

    setCurrentProfile({ ...currentProfile, name: nome, theme_color: accentColor })
    document.documentElement.style.setProperty('--accent', accentColor)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Perfil */}
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.15)' }}>
            <Info size={14} style={{ color: 'var(--accent)' }} />
          </div>
          Perfil
        </h2>

        <div className="flex flex-col gap-4">
          {currentProfile && (
            <div className="flex items-center gap-4 mb-2">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                style={{ background: accentColor }}
              >
                {nome.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{currentProfile.name}</p>
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

          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
              Cor de destaque
            </label>
            <div className="flex gap-3 flex-wrap">
              {ACCENT_OPTIONS.map(({ color, label }) => (
                <button
                  key={color}
                  onClick={() => setAccentColor(color)}
                  title={label}
                  className="w-9 h-9 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: color,
                    outline: accentColor === color ? `3px solid ${color}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          <Button loading={saving} onClick={handleSave} disabled={!nome.trim()}>
            {saved ? '✓ Salvo!' : 'Salvar alterações'}
          </Button>
        </div>
      </div>

      {/* Aparência */}
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.15)' }}>
            {theme === 'dark' ? <Moon size={14} style={{ color: 'var(--accent)' }} /> : <Sun size={14} style={{ color: 'var(--accent)' }} />}
          </div>
          Aparência
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Modo {theme === 'dark' ? 'Escuro' : 'Claro'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Alterne entre modo escuro e claro
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className="w-12 h-6 rounded-full relative transition-colors"
            style={{ background: theme === 'dark' ? 'var(--accent)' : 'var(--border)' }}
          >
            <div
              className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform"
              style={{ transform: theme === 'dark' ? 'translateX(26px)' : 'translateX(2px)' }}
            />
          </button>
        </div>
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
            { label: 'Supabase', desc: 'Banco de dados e autenticação', status: 'Conectado' },
            { label: 'Claude API (Anthropic)', desc: 'Assistente BuildAssist IA', status: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Configurado' : 'Configurar' },
            { label: 'OpenWeather API', desc: 'Alertas meteorológicos para obras', status: 'Opcional' },
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

        <p className="text-xs mt-4" style={{ color: 'var(--text-secondary)' }}>
          Configure as chaves de API no arquivo <span className="font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>.env.local</span> do projeto.
        </p>
      </div>

      {/* Versão */}
      <div className="card p-4 text-center">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          BuildSmart AI v1.0 — Stack: Next.js 14 + Supabase + Claude API
        </p>
      </div>
    </div>
  )
}
