'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, HardHat, FileText, CalendarDays,
  ShoppingCart, ClipboardList, BotMessageSquare, BarChart3, Settings, FolderOpen, Hammer, Briefcase,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cadastro', label: 'Cadastro', icon: Briefcase },
  { href: '/projetos', label: 'Projetos', icon: FolderOpen },
  { href: '/obras', label: 'Obras', icon: HardHat },
  { href: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { href: '/cronograma', label: 'Cronograma', icon: CalendarDays },
  { href: '/materiais', label: 'Compras', icon: ShoppingCart },
  { href: '/medicoes', label: 'Diário / Medições', icon: ClipboardList },
  { href: '/canteiro', label: 'Canteiro', icon: Hammer },
  { href: '/buildassist', label: 'BuildAssistente IA', icon: BotMessageSquare, featured: true },
]

// Painel da Luiza WhatsApp fica oculto do menu — acesso direto via /admin-luiza
const NAV_BOTTOM = [
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full z-50 flex flex-col group/sidebar overflow-hidden"
      style={{
        width: '56px',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        transition: 'width 0.2s ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.width = '232px' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.width = '56px' }}
    >
      <div className="flex items-center h-16 px-3.5 flex-shrink-0 border-b overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ background: 'var(--accent)' }}
        >
          B
        </div>
        <div className="ml-3 overflow-hidden whitespace-nowrap" style={{ transition: 'opacity 0.15s ease' }}>
          <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            BuildSmart
          </p>
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>
            AI
            <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)' }}>v{APP_VERSION}</span>
          </p>
        </div>
      </div>

      <nav className="flex-1 py-3 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map(({ href, label, icon: Icon, featured }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'flex items-center gap-3 mx-1.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 overflow-hidden whitespace-nowrap',
                active ? 'text-white' : 'hover:bg-[var(--bg-card)]'
              )}
              style={active
                ? { background: 'var(--accent)', color: 'white' }
                : featured
                  ? { color: 'var(--accent)', background: 'rgba(59,123,248,0.08)' }
                  : { color: 'var(--text-secondary)' }}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="overflow-hidden">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="py-3 border-t flex flex-col gap-0.5 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {NAV_BOTTOM.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'flex items-center gap-3 mx-1.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 overflow-hidden whitespace-nowrap',
                active ? 'text-white' : 'hover:bg-[var(--bg-card)]'
              )}
              style={active ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="overflow-hidden">{label}</span>
            </Link>
          )
        })}
        <p className="text-xs px-3.5 pt-1 overflow-hidden whitespace-nowrap" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
          v{APP_VERSION}
        </p>
      </div>
    </aside>
  )
}
