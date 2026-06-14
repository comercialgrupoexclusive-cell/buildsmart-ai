// Envio de mensagens via Z-API — usado pelo webhook e pelo disparador agendado
export async function sendZApiText(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const id = process.env.ZAPI_INSTANCE_ID
  const token = process.env.ZAPI_TOKEN
  const clientToken = process.env.ZAPI_CLIENT_TOKEN
  if (!id || !token) return { ok: false, error: 'ZAPI_INSTANCE_ID/ZAPI_TOKEN nao configurados' }

  try {
    const res = await fetch(`https://api.z-api.io/instances/${id}/token/${token}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientToken ? { 'Client-Token': clientToken } : {}),
      },
      body: JSON.stringify({ phone, message }),
    })
    const data = await res.json()
    console.log('ZAPI SEND RESULT', res.status, JSON.stringify(data).slice(0, 200))
    if (!res.ok) return { ok: false, error: JSON.stringify(data) }
    return { ok: true }
  } catch (err: any) {
    console.log('ZAPI SEND ERROR', err?.message)
    return { ok: false, error: err?.message }
  }
}
