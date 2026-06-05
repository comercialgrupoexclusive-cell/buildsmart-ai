'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
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

// Lê localStorage de forma síncrona na inicialização do estado
// Isso garante que currentProfile está disponível ANTES de qualquer useEffect rodar
function loadProfileFromStorage(): Profile | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem('buildsmart_profile')
    return stored ? (JSON.parse(stored) as Profile) : null
  } catch {
    return null
  }
}

function applyTheme(t: 'dark' | 'light', accentColor?: string) {
  document.documentElement.removeAttribute('data-theme')
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  }
  if (accentColor) {
    document.documentElement.style.setProperty('--accent', accentColor)
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  // Inicialização lazy síncrona — lê localStorage no primeiro render
  const [currentProfile, setCurrentProfileState] = useState<Profile | null>(loadProfileFromStorage)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const p = loadProfileFromStorage()
    return p?.dark_mode === false ? 'light' : 'dark'
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

  return (
    <ProfileContext.Provider value={{ currentProfile, setCurrentProfile, theme, toggleTheme }}>
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => useContext(ProfileContext)
