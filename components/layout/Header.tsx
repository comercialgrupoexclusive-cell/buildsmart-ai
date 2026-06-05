'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Moon, Sun, LogOut } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/obras': 'Obras',
  '/sinapi': 'Base SINAPI',
  '/buildassist': 'BuildAssist IA',
  '/configuracoes': 'Configurações',
}

function getTitle(pathname: string): string {
  if (pathname.startsWith('/obras/') && pathname.split('/').length > 2) {
    return 'Detalhe da Obra'
  }
  return PAGE_TITLES[pathname] || 'BuildSmart AI'
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentProfile, setCurrentProfile, theme, toggleTheme } = useProfile()

  function handleSwitchProfile() {
    setCurrentProfile(null)
    router.push('/')
  }

  return (
    <header
      className="fixed top-0 right-0 left-60 h-16 flex items-center justify-between px-6 z-30"
      style={{
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        {getTitle(pathname)}
      </h1>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
          style={{ color: 'var(--text-secondary)' }}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {currentProfile && (
          <button
            onClick={handleSwitchProfile}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors group"
          >
            {currentProfile.photo_url ? (
              <img
                src={currentProfile.photo_url}
                alt={currentProfile.name}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-[var(--accent)]"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                style={{ background: currentProfile.theme_color || 'var(--accent)' }}
              >
                {currentProfile.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium hidden md:block" style={{ color: 'var(--text-primary)' }}>
              {currentProfile.name}
            </span>
            <LogOut
              size={14}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-secondary)' }}
            />
          </button>
        )}
      </div>
    </header>
  )
}
