'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, Sun, Moon, BotMessageSquare, AlertTriangle, X } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'

const ASSIST_ON_ENTRY_KEY = 'buildsmart-open-luizia-on-entry'

const STEPS = [
  {
    icon: Monitor,
    secondIcon: null as null | typeof Monitor,
    title: 'Sistema Beta, melhor no desktop',
    description: 'Estamos em fase Beta — algumas telas ainda podem mudar. E o sistema funciona melhor em notebook ou computador, onde orçamento, Gantt e tabelas têm mais espaço.',
  },
  {
    icon: Sun,
    secondIcon: Moon,
    title: 'Tema claro/escuro e cores personalizadas',
    description: 'Alterne entre modo claro e escuro pelo botão no topo e escolha sua cor de destaque em Configurações, do seu jeito.',
  },
  {
    icon: BotMessageSquare,
    secondIcon: null as null | typeof Monitor,
    title: 'Planejamento e execução com IA integrada',
    description: 'A Luiza, sua IA, ajuda a planejar etapas, montar orçamentos e acompanhar a execução da obra com sugestões e alertas em tempo real.',
  },
]

function OnboardingContent() {
  const router = useRouter()
  const { currentProfile } = useProfile()
  const [betaOpen, setBetaOpen] = useState(true)

  function handleStart() {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ASSIST_ON_ENTRY_KEY, '1')
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'var(--bg-primary)' }}>
      {betaOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div className="card p-6 w-full max-w-sm relative animate-enter">
            <button
              onClick={() => setBetaOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity"
              title="Fechar aviso"
            >
              <X size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>

            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(245,158,11,0.15)' }}>
              <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />
            </div>
            <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Sistema em fase Beta
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Esta versão pode conter instabilidades, telas em ajuste e comportamentos inesperados. Estamos evoluindo o sistema continuamente — use à vontade, mas evite depender dele para decisões críticas por enquanto.
            </p>

            <button
              onClick={() => setBetaOpen(false)}
              className="btn-primary w-full mt-5"
            >
              Entendi, continuar
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl animate-enter" style={{ visibility: betaOpen ? 'hidden' : 'visible' }}>
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text-primary)' }}>
            Bem-vindo ao BuildSmart AI
          </h1>
          {currentProfile && (
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              Olá, <strong style={{ color: 'var(--text-primary)' }}>{currentProfile.apelido || currentProfile.name}</strong>! Antes de começar, três coisas rápidas:
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {STEPS.map(({ icon: Icon, secondIcon: SecondIcon, title, description }, i) => (
            <div
              key={i}
              className="card p-6 text-center animate-enter"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center gap-1 mx-auto mb-4" style={{ background: 'rgba(59,123,248,0.15)' }}>
                <Icon size={22} style={{ color: 'var(--accent)' }} />
                {SecondIcon && <SecondIcon size={22} style={{ color: 'var(--accent)' }} />}
              </div>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleStart}
            className="btn-primary px-8 py-3 text-base"
          >
            Começar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return <OnboardingContent />
}
