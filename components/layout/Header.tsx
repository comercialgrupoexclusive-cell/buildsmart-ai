'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Moon, Sun, LogOut, Pencil, ChevronDown } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { useState, useRef, useEffect } from 'react'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/obras': 'Obras',
  '/orcamentos': 'Orçamentos',
  '/cronograma': 'Cronograma',
  '/materiais': 'Materiais',
  '/medicoes': 'Diário / Medições',
  '/servicos': 'Composições',
  '/sinapi': 'Base de referência',
  '/buildassist': 'BuildAssistente IA',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
}

function getTitle(pathname: string): string {
  if (pathname.startsWith('/obras/') && pathname.split('/').length > 2) return 'Detalhe da Obra'
  return PAGE_TITLES[pathname] || 'BuildSmart AI'
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentProfile, setCurrentProfile, theme, toggleTheme } = useProfile()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSwitchProfile() {
    setCurrentProfile(null)
    router.push('/')
  }

  function handleToggleTheme() {
    toggleTheme()
    const next = theme === 'dark' ? 'claro' : 'escuro'
    setToast(`Modo ${next} ativado. Para salvar, vá em Configurações.`)
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <>
      <header
        className="fixed top-0 right-0 h-16 flex items-center justify-between px-6 z-30"
        style={{
          left: '56px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {getTitle(pathname)}
        </h1>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleTheme}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--text-secondary)' }}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {currentProfile && (
            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setDropdownOpen(v => !v)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              >
                {currentProfile.photo_url ? (
                  <img
                    src={currentProfile.photo_url}
                    alt={currentProfile.name}
                    className="w-8 h-8 rounded-full object-cover ring-2"
                    style={{ '--tw-ring-color': 'var(--accent)' } as any}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                    style={{ background: currentProfile.theme_color || 'var(--accent)' }}
                  >
                    {currentProfile.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium hidden md:block" style={{ color: 'var(--text-primary)' }}>
                  {currentProfile.name}
                </span>
                <ChevronDown
                  size={14}
                  className="transition-transform duration-150"
                  style={{
                    color: 'var(--text-secondary)',
                    transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-44 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <button
                    onClick={() => { setDropdownOpen(false); router.push('/configuracoes') }}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
                    Editar perfil
                  </button>
                  <div className="my-1 mx-3" style={{ height: '1px', background: 'var(--border)' }} />
                  <button
                    onClick={handleSwitchProfile}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--danger)' }}
                  >
                    <LogOut size={14} />
                    Trocar perfil
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg animate-enter"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            maxWidth: '320px',
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}
