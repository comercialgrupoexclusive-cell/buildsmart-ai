'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  HardHat,
  FileText,
  CalendarDays,
  Package,
  ClipboardList,
  BotMessageSquare,
  BarChart3,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/obras',        label: 'Obras',           icon: HardHat },
  { href: '/orcamentos',   label: 'Orçamentos',      icon: FileText },
  { href: '/cronograma',   label: 'Cronograma',      icon: CalendarDays },
  { href: '/materiais',    label: 'Materiais',       icon: Package },
  { href: '/medicoes',     label: 'Medições',        icon: ClipboardList },
  { href: '/buildassist',  label: 'BuildAssist IA',  icon: BotMessageSquare },
]

const NAV_BOTTOM = [
  { href: '/relatorios',   label: 'Relatórios',      icon: BarChart3 },
  { href: '/configuracoes',label: 'Configurações',   icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  function linkStyle(href: string) {
    return isActive(href)
      ? { background: 'var(--accent)', color: 'white' }
      : { color: 'var(--text-secondary)' }
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full w-60 flex flex-col z-40"
      style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
    >
      {/* Logo */}
      <div className="px-6 py-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'var(--accent)' }}
          >
            B
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)', fontFamily: 'DM Serif Display, serif' }}>
              BuildSmart
            </p>
            <p className="text-xs" style={{ color: 'var(--accent)' }}>AI</p>
          </div>
        </div>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive(href) ? 'text-white' : 'hover:bg-[var(--bg-card)]'
            )}
            style={linkStyle(href)}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Nav inferior */}
      <div className="px-3 py-3 border-t flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
        {NAV_BOTTOM.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive(href) ? 'text-white' : 'hover:bg-[var(--bg-card)]'
            )}
            style={linkStyle(href)}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
        <p className="text-xs px-3 pt-2" style={{ color: 'var(--text-secondary)' }}>
          BuildSmart AI v1.0
        </p>
      </div>
    </aside>
  )
}
