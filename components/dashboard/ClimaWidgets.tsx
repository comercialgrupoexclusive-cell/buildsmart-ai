'use client'

import { useEffect, useState } from 'react'
import {
  CloudSun, CloudRain, Cloud, Sun, CloudLightning, CloudFog, CloudSnow,
  AlertTriangle, CalendarClock, MapPin, CheckCircle2,
} from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { Etapa } from '@/lib/types'
import { diasAteData } from '@/lib/utils'

export const CLIMA_ATIVO_KEY = 'buildsmart-clima-ativo'
export const CLIMA_THRESHOLD_KEY = 'buildsmart-clima-chuva-threshold'
export const CLIMA_THRESHOLD_DEFAULT = 60

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

function formatDiaCompleto(data: string) {
  const d = new Date(`${data}T00:00:00`)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function readClimaSettings() {
  if (typeof window === 'undefined') return { ativo: true, threshold: CLIMA_THRESHOLD_DEFAULT }
  const ativo = localStorage.getItem(CLIMA_ATIVO_KEY)
  const threshold = Number(localStorage.getItem(CLIMA_THRESHOLD_KEY))
  return {
    ativo: ativo !== 'false',
    threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : CLIMA_THRESHOLD_DEFAULT,
  }
}

type ClimaWidgetsProps = {
  etapasProximas: (Etapa & { obra_nome: string })[]
  alertasInternos: number
}

export function ClimaWidgets({ etapasProximas, alertasInternos }: ClimaWidgetsProps) {
  const { currentProfile } = useProfile()
  const [settings, setSettings] = useState(() => readClimaSettings())
  const [weather, setWeather] = useState<WeatherResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function syncSettings() { setSettings(readClimaSettings()) }
    syncSettings()
    window.addEventListener('storage', syncSettings)
    window.addEventListener('buildsmart:clima-settings-changed', syncSettings)
    return () => {
      window.removeEventListener('storage', syncSettings)
      window.removeEventListener('buildsmart:clima-settings-changed', syncSettings)
    }
  }, [])

  useEffect(() => {
    if (!settings.ativo) { setLoading(false); return }
    let active = true
    setLoading(true)

    fetch('/api/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cidade: currentProfile?.cidade || null,
        estado: currentProfile?.estado || null,
      }),
    })
      .then(res => res.json())
      .then(json => { if (active) setWeather(json) })
      .catch(() => { if (active) setWeather(null) })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [settings.ativo, currentProfile?.cidade, currentProfile?.estado])

  if (!settings.ativo) return null

  const previsao = weather?.previsao || []
  const diasChuvosos = previsao.filter(d => d.chanceChuva >= settings.threshold)

  // Cruza etapas previstas com dias de chuva forte para sugerir replanejamento
  const atividadesImpactadas = etapasProximas
    .map(etapa => {
      if (!etapa.data_inicio) return null
      const dia = diasChuvosos.find(d => d.data === etapa.data_inicio)
      if (!dia) return null
      return { etapa, dia }
    })
    .filter((x): x is { etapa: Etapa & { obra_nome: string }; dia: WeatherDay } => x !== null)
    .slice(0, 4)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Previsão 7 dias */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CloudSun size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Previsão 7 dias</h2>
          </div>
          {weather?.local && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <MapPin size={12} />
              {weather.local}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : !currentProfile?.cidade ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
            Cadastre cidade e estado em Configurações para ver a previsão do tempo.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {previsao.map(dia => {
              const Icon = iconForCode(dia.codigo)
              const chuvaForte = dia.chanceChuva >= settings.threshold
              return (
                <div key={dia.data} className="flex items-center gap-3 px-1 py-1.5">
                  <span className="w-9 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {formatDiaCurto(dia.data)}
                  </span>
                  <Icon size={18} style={{ color: chuvaForte ? 'var(--accent)' : 'var(--text-secondary)' }} />
                  <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
                    {dia.tempMax}° <span style={{ color: 'var(--text-secondary)' }}>/ {dia.tempMin}°</span>
                  </span>
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: chuvaForte ? 'rgba(59,123,248,0.15)' : 'var(--bg-secondary)',
                      color: chuvaForte ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {dia.chanceChuva}% chuva
                  </span>
                </div>
              )
            })}
            {weather?.mode === 'offline' && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Previsão estimada — não foi possível consultar o serviço de clima agora.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Alertas da obra */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Alertas da obra</h2>
        </div>

        <div className="flex flex-col gap-2.5">
          {alertasInternos > 0 && (
            <AlertaItem
              icon={CalendarClock}
              color="var(--warning)"
              titulo={`${alertasInternos} ${alertasInternos === 1 ? 'etapa prevista' : 'etapas previstas'} nos próximos dias`}
              subtitulo="Confira materiais e equipe antes do início"
            />
          )}

          {diasChuvosos.slice(0, 3).map(dia => (
            <AlertaItem
              key={dia.data}
              icon={CloudRain}
              color="var(--accent)"
              titulo={`Chuva prevista (${dia.chanceChuva}%) em ${formatDiaCompleto(dia.data)}`}
              subtitulo="Avalie atividades externas para esse dia"
            />
          ))}

          {alertasInternos === 0 && diasChuvosos.length === 0 && (
            <div className="py-6 text-center flex flex-col items-center gap-2">
              <CheckCircle2 size={26} style={{ color: 'var(--success)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum alerta no momento</p>
            </div>
          )}
        </div>
      </div>

      {/* Atividades impactadas */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock size={18} style={{ color: 'var(--danger)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Atividades impactadas</h2>
        </div>

        {atividadesImpactadas.length === 0 ? (
          <div className="py-6 text-center flex flex-col items-center gap-2">
            <CheckCircle2 size={26} style={{ color: 'var(--success)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma etapa prevista coincide com chuva forte
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {atividadesImpactadas.map(({ etapa, dia }) => (
              <div key={etapa.id} className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                <p className="text-xs truncate mb-1" style={{ color: 'var(--text-secondary)' }}>{etapa.obra_nome}</p>
                <p className="text-xs" style={{ color: 'var(--accent)' }}>
                  Chuva de {dia.chanceChuva}% prevista para {formatDiaCompleto(dia.data)} — considere antecipar ou reorganizar essa etapa.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const ALERT_BG: Record<string, string> = {
  'var(--warning)': 'rgba(245,158,11,0.15)',
  'var(--accent)': 'rgba(59,123,248,0.15)',
  'var(--danger)': 'rgba(239,68,68,0.15)',
  'var(--success)': 'rgba(16,185,129,0.15)',
}

function AlertaItem({ icon: Icon, color, titulo, subtitulo }: {
  icon: typeof AlertTriangle
  color: string
  titulo: string
  subtitulo: string
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: ALERT_BG[color] || 'rgba(255,255,255,0.1)' }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{titulo}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{subtitulo}</p>
      </div>
    </div>
  )
}
