'use client'

export const ETAPAS_PADRAO_KEY = 'buildsmart-etapas-padrao'
export const ETAPAS_PADRAO_CHANGED_EVENT = 'buildsmart:etapas-padrao-changed'

export const ETAPAS_PADRAO_SINAPI = [
  'Serviços Preliminares e Gerais',
  'Infraestrutura',
  'Supraestrutura',
  'Paredes e Painéis',
  'Esquadrias',
  'Vidros e Plásticos',
  'Coberturas',
  'Impermeabilizações',
  'Revestimentos Internos',
  'Forros',
  'Revestimentos Externos',
  'Pinturas',
  'Pisos',
  'Acabamentos',
  'Instalações Elétricas e Telefônicas',
  'Instalações Hidráulicas',
  'Instalações: Esgoto e Águas Pluviais',
  'Louças e Metais',
  'Complementos',
  'Outros',
]

export function limparEtapasPadrao(etapas: string[]) {
  return Array.from(new Set(etapas.map(e => e.trim()).filter(Boolean))).slice(0, 20)
}

export function readEtapasPadrao() {
  if (typeof window === 'undefined') return ETAPAS_PADRAO_SINAPI

  const stored = window.localStorage.getItem(ETAPAS_PADRAO_KEY)
  if (!stored) {
    window.localStorage.setItem(ETAPAS_PADRAO_KEY, JSON.stringify(ETAPAS_PADRAO_SINAPI))
    return ETAPAS_PADRAO_SINAPI
  }

  try {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) {
      const cleaned = limparEtapasPadrao(parsed)
      if (cleaned.length > 0) return cleaned
    }
  } catch {
    // Recria abaixo.
  }

  window.localStorage.setItem(ETAPAS_PADRAO_KEY, JSON.stringify(ETAPAS_PADRAO_SINAPI))
  return ETAPAS_PADRAO_SINAPI
}

export function saveEtapasPadraoStorage(etapas: string[]) {
  const cleaned = limparEtapasPadrao(etapas)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ETAPAS_PADRAO_KEY, JSON.stringify(cleaned))
    window.dispatchEvent(new CustomEvent(ETAPAS_PADRAO_CHANGED_EVENT, { detail: cleaned }))
  }
  return cleaned
}
