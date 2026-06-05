'use client'

import { useState, useRef } from 'react'
import { Sun, Moon, Database, Info, Pipette } from 'lucide-react'
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
  const [darkMode, setDarkMode] = useState(currentProfile?.dark_mode ?? true)
  const colorPickerRef = useRef<HTMLInputElement>(null)

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
    await supabase
      .from('profiles')
      .update({ name: nome, theme_color: accentColor, dark_mode: darkMode })
      .eq('id', currentProfile.id)

    const updated = { ...currentProfile, name: nome, theme_color: accentColor, dark_mode: darkMode }
    setCurrentProfile(updated)
    document.documentElement.style.setProperty('--accent', accentColor)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
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

          <Button loading={saving} onClick={handleSave} disabled={!nome.trim()}>
            {saved ? '✓ Salvo com sucesso!' : 'Salvar configurações'}
          </Button>
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
            { label: 'Supabase', desc: 'Banco de dados', status: 'Conectado' },
            { label: 'Claude API (Anthropic)', desc: 'BuildAssist IA', status: 'Configurar chave em .env.local' },
            { label: 'OpenWeather API', desc: 'Alertas meteorológicos', status: 'Opcional' },
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
          BuildSmart AI v1.0 — Next.js 16 + Supabase + Claude API
        </p>
      </div>
    </div>
  )
}
