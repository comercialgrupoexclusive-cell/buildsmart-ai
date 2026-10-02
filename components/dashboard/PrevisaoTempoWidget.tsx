'use client'

// Previsão do tempo — widget autônomo da Visão Geral (reaproveita /api/weather,
// o mesmo motor usado no dashboard de obras, mas sem acoplar a etapas). Usa a
// cidade/estado do perfil. Degrada com mensagem clara quando não há cidade ou o
// serviço está fora.

import { useEffect, useState } from 'react'
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, MapPin, RefreshCw, Sun, WifiOff,
} from 'lucide-react'
import { useProfile } from '@/lib/profile-context'

type WeatherDay = { data: string; tempMax: number; tempMin: number; chanceChuva: number; codigo: number }
type WeatherResponse = { local: string | null; hoje: string; previsao: WeatherDay[]; mode: 'open-meteo' | 'offline' }

function iconForCode(codigo: number) {
  if (codigo === 0) return Sun
  if (codigo <= 3) return CloudSun
  if (codigo === 45 || codigo === 48) return CloudFog
  if (codigo >= 51 && codigo <= 67) return CloudRain
  if (codigo >= 71 && codigo <= 86) return CloudSnow
  if (codigo >= 95) return CloudLightning
  return Cloud
}

function formatDiaCurto(data: string) {
  const d = new Date(`${data}T00:00:00`)
  const label = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function PrevisaoTempoWidget() {
  const { currentProfile } = useProfile()
  const [weather, setWeather] = useState<WeatherResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!currentProfile?.cidade) { setLoading(false); return }
    let ativo = true
    setLoading(true); setErro(false)
    fetch('/api/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cidade: currentProfile.cidade, estado: currentProfile.estado || null }),
    })
      .then(r => r.json())
      .then(j => { if (ativo) setWeather(j) })
      .catch(() => { if (ativo) { setWeather(null); setErro(true) } })
      .finally(() => { if (ativo) setLoading(false) })
    return () => { ativo = false }
  }, [currentProfile?.cidade, currentProfile?.estado, retry])

  const previsao = weather?.previsao ?? []

  return (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CloudSun size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Previsão do tempo</h2>
        </div>
        {weather?.local && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <MapPin size={12} /> {weather.local}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !currentProfile?.cidade ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
          Cadastre cidade e estado em <a href="/configuracoes" className="underline" style={{ color: 'var(--accent)' }}>Configurações</a> para ver a previsão.
        </p>
      ) : erro || !weather || weather.mode === 'offline' ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <WifiOff size={26} style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Não foi possível carregar a previsão.</p>
          <button onClick={() => setRetry(k => k + 1)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
            <RefreshCw size={12} /> Tentar novamente
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {previsao.map(dia => {
            const Icon = iconForCode(dia.codigo)
            const chuvaForte = dia.chanceChuva >= 60
            return (
              <div key={dia.data} className="flex items-center gap-3 px-1 py-1.5">
                <span className="w-9 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{formatDiaCurto(dia.data)}</span>
                <Icon size={18} style={{ color: chuvaForte ? 'var(--accent)' : 'var(--text-secondary)' }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
                  {dia.tempMax}° <span style={{ color: 'var(--text-secondary)' }}>/ {dia.tempMin}°</span>
                </span>
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: chuvaForte ? 'rgba(59,123,248,0.15)' : 'var(--bg-secondary)', color: chuvaForte ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {dia.chanceChuva}% chuva
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
