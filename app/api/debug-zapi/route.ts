export async function GET() {
  return Response.json({ ok: true, route: 'debug-zapi' })
}

export async function POST(request: Request) {
  const text = await request.text()

  console.log('DEBUG ZAPI HIT', {
    date: new Date().toISOString(),
    headers: Object.fromEntries(request.headers.entries()),
    body: text,
  })

  return Response.json({
    ok: true,
    received: true,
    bodyLength: text.length,
  })
}
