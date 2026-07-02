'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, HardHat, FileText, CalendarDays,
  ShoppingCart, ClipboardList, BotMessageSquare, BarChart3, Settings, FolderOpen, Hammer, MessageCircle, X, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'
import { useProfile } from '@/lib/profile-context'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/imoveis', label: 'Imóveis (Investimento)', icon: Building2 },
  { href: '/projetos', label: 'Projetos', icon: FolderOpen },
  { href: '/obras', label: 'Obras', icon: HardHat },
  { href: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { href: '/cronograma', label: 'Cronograma', icon: CalendarDays },
  { href: '/materiais', label: 'Compras', icon: ShoppingCart },
  { href: '/medicoes', label: 'Diário / Medições', icon: ClipboardList },
  { href: '/canteiro', label: 'Canteiro', icon: Hammer },
  { href: '/buildassist', label: 'BuildAssistente IA', icon: BotMessageSquare, featured: true },
]

const NAV_BOTTOM_BASE = [
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

// Painel da Luiza WhatsApp só aparece no menu para o perfil ADM — acesso direto via /admin-luiza para os demais
const ADMIN_LUIZA_ITEM = { href: '/admin-luiza', label: 'Luiza WhatsApp', icon: MessageCircle }

type NavEntry = { href: string; label: string; icon: typeof LayoutDashboard; featured?: boolean }

function NavLink({ href, label, icon: Icon, featured, active, onNavigate }: NavEntry & { active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      title={label}
      onClick={onNavigate}
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
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void }) {
  const pathname = usePathname()
  const { currentProfile } = useProfile()
  const isAdmin = currentProfile?.tipo === 'admin'
  const navBottom = isAdmin
    ? [NAV_BOTTOM_BASE[0], ADMIN_LUIZA_ITEM, NAV_BOTTOM_BASE[1]]
    : NAV_BOTTOM_BASE

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* Sidebar desktop — fixa, expande no hover. Oculta em telas pequenas */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-full z-50 flex-col group/sidebar overflow-hidden"
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
          {NAV_ITEMS.map(item => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </nav>

        <div className="py-3 border-t flex flex-col gap-0.5 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {navBottom.map(item => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
          <p className="text-xs px-3.5 pt-1 overflow-hidden whitespace-nowrap" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
            v{APP_VERSION}
          </p>
        </div>
      </aside>

      {/* Menu mobile — drawer deslizante, aberto via botão no Header */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onCloseMobile} />
          <div
            className="relative h-full w-64 max-w-[80vw] flex flex-col overflow-hidden animate-enter"
            style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between h-16 px-3.5 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: 'var(--accent)' }}
                >
                  B
                </div>
                <div className="ml-3">
                  <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>BuildSmart</p>
                  <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                    AI <span style={{ color: 'var(--text-secondary)' }}>v{APP_VERSION}</span>
                  </p>
                </div>
              </div>
              <button onClick={onCloseMobile} className="p-2 rounded-lg" style={{ color: 'var(--text-secondary)' }} aria-label="Fechar menu">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 py-3 flex flex-col gap-0.5 overflow-y-auto">
              {NAV_ITEMS.map(item => (
                <NavLink key={item.href} {...item} active={isActive(item.href)} onNavigate={onCloseMobile} />
              ))}
            </nav>

            <div className="py-3 border-t flex flex-col gap-0.5" style={{ borderColor: 'var(--border)' }}>
              {navBottom.map(item => (
                <NavLink key={item.href} {...item} active={isActive(item.href)} onNavigate={onCloseMobile} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
