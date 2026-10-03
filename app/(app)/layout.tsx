'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { ObraOrcamentoProvider } from '@/lib/obra-orcamento-context'
import { OrganizacaoProvider } from '@/lib/organizacao/contexto'
import { GuardaNavegacaoProvider } from '@/components/ui/GuardaNavegacao'

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrganizacaoProvider>
      <GuardaNavegacaoProvider>
        <ObraOrcamentoProvider><AppLayout>{children}</AppLayout></ObraOrcamentoProvider>
      </GuardaNavegacaoProvider>
    </OrganizacaoProvider>
  )
}
