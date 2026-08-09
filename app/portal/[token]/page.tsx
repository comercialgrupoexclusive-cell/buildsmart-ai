import { notFound } from 'next/navigation'
import { getPortalContext } from '@/lib/portal/portal-service'
import { PortalClient } from '@/components/portal/PortalClient'

export const dynamic = 'force-dynamic'

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ budget?: string; view?: string; node?: string; yaw?: string; pitch?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  const context = await getPortalContext(token, query.budget || 'todos')
  if (!context) notFound()
  return <PortalClient token={token} initialContext={context} initialView={query.view} deepLink={{ node: query.node, yaw: query.yaw, pitch: query.pitch }} />
}
