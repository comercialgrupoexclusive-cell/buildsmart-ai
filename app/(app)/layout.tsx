'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { ObraOrcamentoProvider } from '@/lib/obra-orcamento-context'

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <ObraOrcamentoProvider><AppLayout>{children}</AppLayout></ObraOrcamentoProvider>
}
