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

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [currentProfile, setCurrentProfileState] = useState<Profile | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('buildsmart_profile')
    if (stored) {
      try {
        const profile = JSON.parse(stored) as Profile
        setCurrentProfileState(profile)
        setTheme(profile.dark_mode ? 'dark' : 'light')
        applyTheme(profile.dark_mode ? 'dark' : 'light', profile.theme_color)
      } catch {
        localStorage.removeItem('buildsmart_profile')
      }
    }
  }, [])

  function applyTheme(t: 'dark' | 'light', accentColor?: string) {
    document.documentElement.removeAttribute('data-theme')
    if (t === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    }
    if (accentColor) {
      document.documentElement.style.setProperty('--accent', accentColor)
    }
  }

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
