import { redirect } from 'next/navigation'
import { readAccess } from '@/lib/auth/session'
import { destinoSeguro } from '@/lib/auth/next-path'
import { OrganizationPicker } from './OrganizationPicker'

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ next?: string; trocar?: string }> }) {
  const params = await searchParams
  const next = destinoSeguro(params.next) || '/processos'
  const access = await readAccess()
  if (!access) redirect(`/login?next=${encodeURIComponent(next)}`)
  if (access.active && !params.trocar) redirect(next)
  // The selection RPC writes audit/database state and is called only via POST.
  return <main className="flex min-h-dvh items-center justify-center bg-[#080e1b] p-5 text-slate-100"><OrganizationPicker memberships={access.memberships} next={next} /></main>
}
