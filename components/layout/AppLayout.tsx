'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/lib/profile-context'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { WelcomeGuide } from './WelcomeGuide'
import { LuiziaFloatingChat } from './LuiziaFloatingChat'

export function AppLayout({ children }: { children: ReactNode }) {
  const { currentProfile } = useProfile()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (mounted && !currentProfile) router.replace('/')
  }, [mounted, currentProfile, router])

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!currentProfile) return null

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <Header />
      <WelcomeGuide />
      <main className="ml-14 pt-16 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
      <LuiziaFloatingChat />
    </div>
  )
}
