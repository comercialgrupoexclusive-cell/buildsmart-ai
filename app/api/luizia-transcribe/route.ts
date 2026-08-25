import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  try {
    const key = process.env.OPENAI_API_KEY || ''
    if (!key.startsWith('sk-')) {
      return NextResponse.json({ error: 'OpenAI não configurada' }, { status: 503 })
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo de áudio não enviado' }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey: key })
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    })

    return NextResponse.json({ texto: transcription.text || '' })
  } catch (error) {
    console.error('Luizia transcribe error:', error)
    const message = error instanceof Error ? error.message : 'Falha ao transcrever áudio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
