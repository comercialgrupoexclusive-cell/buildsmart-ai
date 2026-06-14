'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProfile } from '@/lib/profile-context'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { WelcomeGuide } from './WelcomeGuide'
import { LuiziaFloatingChat } from './LuiziaFloatingChat'

export function AppLayout({ children }: { children: ReactNode }) {
  const { currentProfile, setCurrentProfile } = useProfile()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [checkedProfileId, setCheckedProfileId] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (mounted && !currentProfile) router.replace('/')
  }, [mounted, currentProfile, router])

  // Restrição de acesso por tipo de perfil
  useEffect(() => {
    if (!mounted || !currentProfile) return
    const tipo = currentProfile.tipo

    if (tipo === 'cliente') {
      // Cliente só acessa sua obra vinculada
      const isObraPage = pathname?.startsWith('/obras/')
      if (!isObraPage) {
        const supabase = createClient()
        supabase
          .from('obra_usuarios')
          .select('obra_id')
          .eq('profile_id', currentProfile.id)
          .limit(1)
          .then(({ data }: { data: { obra_id: string }[] | null }) => {
            if (data?.[0]) router.replace(`/obras/${data[0].obra_id}`)
            else router.replace('/obras')
          })
      }
    } else if (tipo === 'prestador') {
      // Prestador só acessa o canteiro (Sprint 6)
      if (!pathname?.startsWith('/canteiro')) {
        router.replace('/canteiro')
      }
    }
  }, [mounted, currentProfile, pathname, router])

  useEffect(() => {
    if (!mounted || !currentProfile || checkedProfileId === currentProfile.id) return

    let cancelled = false
    const profile = currentProfile
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    async function syncProfile() {
      const supabase = createClient()
      if (!uuidPattern.test(profile.id)) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('name', profile.name)
          .maybeSingle()

        if (cancelled) return
        if (data) {
          setCurrentProfile(data as any)
          return
        }
        setCurrentProfile(null)
        router.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle()

      if (cancelled) return
      setCheckedProfileId(profile.id)
      if (error) return
      if (data) {
        setCurrentProfile(data as any)
        return
      }
      setCurrentProfile(null)
      router.replace('/')
    }

    void syncProfile()
    return () => { cancelled = true }
  }, [mounted, currentProfile, checkedProfileId, setCurrentProfile, router])

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!currentProfile) return null

  const isInterno = currentProfile.tipo === 'admin' || currentProfile.tipo === 'usuario'

  if (!isInterno) {
    // Cliente / Prestador: layout simplificado sem sidebar
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
        <Header />
        <main className="pt-16 min-h-screen">
          <div className="p-3 sm:p-6 max-w-full overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <Header />
      <WelcomeGuide />
      <main className="ml-14 pt-16 min-h-screen">
        <div className="p-3 sm:p-6 max-w-full overflow-x-hidden">
          {children}
        </div>
      </main>
      <LuiziaFloatingChat />
    </div>
  )
}
