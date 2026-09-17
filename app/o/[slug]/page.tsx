import { redirect } from 'next/navigation'
import { destinoSeguro } from '@/lib/auth/next-path'

export default async function Entry({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = destinoSeguro((await searchParams).next)
  redirect('/login' + (next ? `?next=${encodeURIComponent(next)}` : ''))
}
