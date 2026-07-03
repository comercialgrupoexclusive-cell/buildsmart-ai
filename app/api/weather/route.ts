import { NextRequest, NextResponse } from 'next/server'
import { nomeEstadoPorUf, normalizarLocalidade } from '@/lib/brasil-localidades'

type WeatherDay = {
  data: string
  tempMax: number
  tempMin: number
  chanceChuva: number
  codigo: number
}

type WeatherResponse = {
  local: string | null
  hoje: string
  previsao: WeatherDay[]
  mode: 'open-meteo' | 'offline'
}

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

function offlineFallback(local: string | null): WeatherResponse {
  const hoje = new Date()
  const previsao: WeatherDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    return {
      data: d.toISOString().split('T')[0],
      tempMax: 27,
      tempMin: 18,
      chanceChuva: 20,
      codigo: 1,
    }
  })

  return {
    local,
    hoje: hoje.toISOString().split('T')[0],
    previsao,
    mode: 'offline',
  }
}

async function geocode(cidade: string, estado?: string | null) {
  const estadoNome = nomeEstadoPorUf(estado) || estado || null
  const query = cidade
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=5&language=pt&format=json&country=BR`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    .finally(() => clearTimeout(timer))
  if (!res.ok) throw new Error('Falha no geocoding')

  const json = await res.json()
  const results: any[] = json?.results || []
  if (results.length === 0) throw new Error('Localidade não encontrada')

  const estadoNormalizado = estadoNome ? normalizarLocalidade(estadoNome) : null
  const match = (estadoNormalizado
    ? results.find(r => normalizarLocalidade(String(r.admin1 || '')).includes(estadoNormalizado))
    : null) || results[0]

  return {
    lat: match.latitude as number,
    lon: match.longitude as number,
    nome: `${match.name}${match.admin1 ? ` / ${match.admin1}` : ''}`,
  }
}

async function forecast(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'America/Sao_Paulo',
    forecast_days: '7',
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
    .finally(() => clearTimeout(timer))
  if (!res.ok) throw new Error('Falha na previsão')

  const json = await res.json()
  const daily = json?.daily
  if (!daily?.time) throw new Error('Previsão indisponível')

  const previsao: WeatherDay[] = daily.time.map((data: string, i: number) => ({
    data,
    tempMax: Math.round(daily.temperature_2m_max?.[i] ?? 0),
    tempMin: Math.round(daily.temperature_2m_min?.[i] ?? 0),
    chanceChuva: Math.round(daily.precipitation_probability_max?.[i] ?? 0),
    codigo: daily.weather_code?.[i] ?? 0,
  }))

  return previsao
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    cidade?: string
    estado?: string | null
    lat?: number
    lon?: number
  }
  const { cidade, estado, lat, lon } = body
  const fallbackLocal = cidade ? `${cidade}${estado ? ` / ${estado}` : ''}` : null

  try {
    let coords: { lat: number; lon: number; nome: string | null }

    if (typeof lat === 'number' && typeof lon === 'number') {
      coords = { lat, lon, nome: null }
    } else if (cidade) {
      const geo = await geocode(cidade, estado)
      coords = { lat: geo.lat, lon: geo.lon, nome: geo.nome }
    } else {
      return NextResponse.json(offlineFallback(null))
    }

    const previsao = await forecast(coords.lat, coords.lon)

    const response: WeatherResponse = {
      local: coords.nome || fallbackLocal,
      hoje: new Date().toISOString().split('T')[0],
      previsao,
      mode: 'open-meteo',
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Weather route error:', error)
    return NextResponse.json(offlineFallback(fallbackLocal))
  }
}
