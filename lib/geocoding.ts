// Núcleo N06.2 (Investidor/Imóveis) — geocoding do endereço da Prospecção e
// dos comparáveis, para filtrar/corrigir por distância real em vez de só
// confiar no julgamento textual da IA de "mesmo prédio/mesma rua/entorno/
// bairro". Serviço escolhido: Nominatim (OpenStreetMap) — gratuito, sem
// chave de API, adequado ao volume atual (poucas prospecções/comparáveis
// por vez). Limite de uso justo do Nominatim: 1 requisição/segundo e um
// User-Agent identificável — nunca chamado direto do navegador (só
// server-side, via app/api/investidor/geocode/route.ts ou dentro de
// lib/investidor-ai-tools.ts), e sempre "best effort": uma falha de
// geocoding nunca bloqueia o fluxo, só deixa lat/long null.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'BuildSmartAI-Investidor/1.0 (contato: suporte@buildsmart.ai)'

export type Coordenada = { lat: number; lon: number }

export async function geocodeEndereco(endereco: string): Promise<Coordenada | null> {
  const query = endereco.trim()
  if (!query) return null
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    return parseNominatimResponse(data)
  } catch {
    return null
  }
}

// Separado da chamada de rede para poder testar o parsing sem depender de
// fetch/rede (ver lib/__tests__/geocoding.test.ts).
export function parseNominatimResponse(data: unknown): Coordenada | null {
  if (!Array.isArray(data) || data.length === 0) return null
  const primeiro = data[0] as Record<string, unknown>
  const lat = Number(primeiro?.lat)
  const lon = Number(primeiro?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

// Distância em km entre duas coordenadas (fórmula de Haversine) — pura,
// sem I/O, para poder corrigir a similaridade dos comparáveis de forma
// determinística e testável.
export function haversineKm(a: Coordenada, b: Coordenada): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export type Similaridade = 'mesmo_predio' | 'mesma_rua' | 'entorno' | 'bairro'

// Corrige (só para baixo — nunca promove uma categoria) a similaridade que
// a IA declarou usando a distância real geocodificada. A IA julga por texto
// (título/descrição do anúncio); a distância real é fato, não deve ser
// contrariada por uma alegação textual otimista demais.
const LIMITE_KM: Record<Similaridade, number> = {
  mesmo_predio: 0.15,
  mesma_rua: 0.5,
  entorno: 2,
  bairro: Infinity,
}
const ORDEM: Similaridade[] = ['mesmo_predio', 'mesma_rua', 'entorno', 'bairro']

export function corrigirSimilaridadePorDistancia(
  declarada: Similaridade | null | undefined,
  distanciaKm: number | null,
): Similaridade | null | undefined {
  if (distanciaKm == null || declarada == null) return declarada
  const idxDeclarada = ORDEM.indexOf(declarada)
  if (idxDeclarada < 0) return declarada
  // Acha a categoria mais específica cujo limite ainda comporta a distância real.
  const idxReal = ORDEM.findIndex(cat => distanciaKm <= LIMITE_KM[cat])
  const idxCorrigida = Math.max(idxDeclarada, idxReal < 0 ? ORDEM.length - 1 : idxReal)
  return ORDEM[idxCorrigida]
}
