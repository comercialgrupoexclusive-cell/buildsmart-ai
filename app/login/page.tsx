import { redirect } from 'next/navigation'
import { readAccess } from '@/lib/auth/session'
import { destinoSeguro } from '@/lib/auth/next-path'
import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = destinoSeguro((await searchParams).next)
  const access = await readAccess()
  if (access) redirect(`/organizacoes?next=${encodeURIComponent(next || '/processos')}`)
  return <main className="flex min-h-dvh items-center justify-center bg-[#080e1b] p-5 text-slate-100"><LoginForm next={next} /></main>
}
