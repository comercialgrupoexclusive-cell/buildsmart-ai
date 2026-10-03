'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { ObraOrcamentoProvider } from '@/lib/obra-orcamento-context'
import { OrganizacaoProvider } from '@/lib/organizacao/contexto'

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrganizacaoProvider>
      <ObraOrcamentoProvider><AppLayout>{children}</AppLayout></ObraOrcamentoProvider>
    </OrganizacaoProvider>
  )
}
