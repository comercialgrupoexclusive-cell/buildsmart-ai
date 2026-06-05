'use client'

import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/lib/profile-context'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AppLayout({ children }: { children: ReactNode }) {
  const { currentProfile } = useProfile()
  const router = useRouter()

  useEffect(() => {
    if (!currentProfile) {
      router.replace('/')
    }
  }, [currentProfile, router])

  if (!currentProfile) return null

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <Header />
      <main className="ml-60 pt-16 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
