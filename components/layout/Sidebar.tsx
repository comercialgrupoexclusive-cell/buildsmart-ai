'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  HardHat,
  Database,
  BotMessageSquare,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/obras', label: 'Obras', icon: HardHat },
  { href: '/sinapi', label: 'Base SINAPI', icon: Database },
  { href: '/buildassist', label: 'BuildAssist IA', icon: BotMessageSquare },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-full w-60 flex flex-col z-40"
      style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
      {/* Logo */}
      <div className="px-6 py-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'var(--accent)' }}>
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                active
                  ? 'text-white'
                  : 'hover:bg-[var(--bg-card)]'
              )}
              style={active ? {
                background: 'var(--accent)',
                color: 'white',
              } : {
                color: 'var(--text-secondary)',
              }}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Version */}
      <div className="px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          BuildSmart AI v1.0
        </p>
      </div>
    </aside>
  )
}
