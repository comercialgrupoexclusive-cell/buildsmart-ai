'use client'

import { useProfile } from '@/lib/profile-context'

export function usePermission() {
  const { currentProfile } = useProfile()
  return {
    canDelete:   currentProfile?.pode_excluir ?? true,
    isAdmin:     currentProfile?.tipo === 'admin',
    isCliente:   currentProfile?.tipo === 'cliente',
    isPrestador: currentProfile?.tipo === 'prestador',
    isInterno:   currentProfile?.tipo === 'admin' || currentProfile?.tipo === 'usuario',
  }
}
