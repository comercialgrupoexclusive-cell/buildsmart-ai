'use client'

export const dynamic = 'force-dynamic'

import { ProfileProvider } from '@/lib/profile-context'
import { AppLayout } from '@/components/layout/AppLayout'

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <AppLayout>{children}</AppLayout>
    </ProfileProvider>
  )
}
