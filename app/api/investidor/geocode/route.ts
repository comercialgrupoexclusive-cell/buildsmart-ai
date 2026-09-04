import { NextRequest, NextResponse } from 'next/server'
import { geocodeEndereco } from '@/lib/geocoding'

// Núcleo N06.2 — geocoding server-side (Nominatim exige um User-Agent
// identificável e não deve ser chamado direto do navegador). Endpoint fino:
// recebe um endereço, devolve lat/long ou { erro } — nunca lança exceção
// para o cliente, "não encontrado" é uma resposta válida (endereço vago
// demais), não um erro de servidor.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const endereco = typeof body?.endereco === 'string' ? body.endereco.trim() : ''
  if (!endereco) return NextResponse.json({ erro: 'Informe um endereço.' }, { status: 400 })

  const coordenada = await geocodeEndereco(endereco)
  if (!coordenada) {
    return NextResponse.json({ erro: 'Não conseguimos localizar esse endereço. Informe um endereço mais específico (rua, número, bairro, cidade).' })
  }
  return NextResponse.json({ latitude: coordenada.lat, longitude: coordenada.lon })
}
