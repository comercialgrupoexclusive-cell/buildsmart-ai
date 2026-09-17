'use client'

import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react'
import { Profile } from './types'

type ProfileContextType = {
  currentProfile: Profile | null
  setCurrentProfile: (profile: Profile | null) => void
  theme: 'dark' | 'light'
  toggleTheme: () => void
}

const ProfileContext = createContext<ProfileContextType>({
  currentProfile: null,
  setCurrentProfile: () => {},
  theme: 'dark',
  toggleTheme: () => {},
})

function applyTheme(t: 'dark' | 'light', accentColor?: string) {
  document.documentElement.removeAttribute('data-theme')
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  }
  if (accentColor) {
    document.documentElement.style.setProperty('--accent', accentColor)
  }
}

export function ProfileProvider({ children, initialProfile = null }: { children: ReactNode; initialProfile?: Profile | null }) {
  const [currentProfile, setCurrentProfileState] = useState<Profile | null>(initialProfile)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return initialProfile?.dark_mode === false ? 'light' : 'dark'
  })

  // Aplica o tema do perfil após montar (só afeta DOM, não causa redirect)
  useEffect(() => {
    if (currentProfile) {
      applyTheme(currentProfile.dark_mode ? 'dark' : 'light', currentProfile.theme_color)
    }
  }, [])

  function setCurrentProfile(profile: Profile | null) {
    setCurrentProfileState(profile)
    if (profile) {
      localStorage.setItem('buildsmart_profile', JSON.stringify(profile))
      const t = profile.dark_mode ? 'dark' : 'light'
      setTheme(t)
      applyTheme(t, profile.theme_color)
    } else {
      localStorage.removeItem('buildsmart_profile')
    }
  }

  function toggleTheme() {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    applyTheme(newTheme, currentProfile?.theme_color)
    if (currentProfile) {
      const updated = { ...currentProfile, dark_mode: newTheme === 'dark' }
      setCurrentProfileState(updated)
      localStorage.setItem('buildsmart_profile', JSON.stringify(updated))
    }
  }

  // Memoizado: sem isso, todo render de ProfileProvider cria um objeto novo e
  // força re-render em cascata de toda a árvore que consome useProfile() —
  // inclusive páginas que não mudaram nada, alguns segundos depois do mount
  // (quando o AppLayout termina de sincronizar o perfil com o Supabase).
  const value = useMemo(
    () => ({ currentProfile, setCurrentProfile, theme, toggleTheme }),
    [currentProfile, theme]
  )

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => useContext(ProfileContext)
