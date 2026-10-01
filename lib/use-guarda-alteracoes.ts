import { useEffect } from 'react'

// Avisa o usuário antes de sair/recarregar a página quando há alterações não
// salvas (formulários que não têm salvamento automático). O cancelamento
// explícito do formulário usa confirmarDescarte().
export function useGuardaAlteracoes(temAlteracoes: boolean) {
  useEffect(() => {
    if (!temAlteracoes) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [temAlteracoes])
}

export function confirmarDescarte(temAlteracoes: boolean): boolean {
  if (!temAlteracoes) return true
  return window.confirm('Você tem alterações não salvas. Descartar as alterações?')
}
