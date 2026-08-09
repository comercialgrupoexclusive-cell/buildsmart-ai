import type { Metadata } from 'next'
import './portal.css'

export const metadata: Metadata = {
  title: 'Portal da Obra | BuildSmart AI',
  description: 'Acompanhamento executivo da sua obra.',
  robots: { index: false, follow: false },
}
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="portal-client-root">{children}</div>
}
