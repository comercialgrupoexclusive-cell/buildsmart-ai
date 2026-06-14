import { NextRequest, NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'

export const maxDuration = 60

const MAX_CHARS = 15000

// Extrai texto de PDF — recebe o arquivo via FormData (campo "file")
// ou JSON { url } para baixar e extrair de uma URL (usado pelo WhatsApp)
export async function POST(req: NextRequest) {
  try {
    let buffer: ArrayBuffer | null = null

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'Arquivo nao enviado' }, { status: 400 })
      buffer = await file.arrayBuffer()
    } else {
      const { url } = await req.json()
      if (!url) return NextResponse.json({ error: 'URL nao informada' }, { status: 400 })
      const res = await fetch(url)
      if (!res.ok) return NextResponse.json({ error: `Falha ao baixar PDF (${res.status})` }, { status: 400 })
      buffer = await res.arrayBuffer()
    }

    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text, totalPages } = await extractText(pdf, { mergePages: true })

    const texto = (text || '').trim().slice(0, MAX_CHARS)

    return NextResponse.json({
      ok: true,
      paginas: totalPages,
      caracteres: texto.length,
      truncado: (text || '').length > MAX_CHARS,
      texto,
    })
  } catch (err: any) {
    console.error('[extract-pdf]', err?.message)
    return NextResponse.json({ error: err?.message || 'Erro ao extrair PDF' }, { status: 500 })
  }
}
