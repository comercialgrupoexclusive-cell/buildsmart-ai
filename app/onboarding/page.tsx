'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HardHat, BarChart3, BotMessageSquare, CheckSquare, Square } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'

const STEPS = [
  {
    icon: HardHat,
    title: 'Gerencie suas obras',
    description: 'Cadastre obras, crie orçamentos com base SINAPI e acompanhe o cronograma em tempo real.',
  },
  {
    icon: BarChart3,
    title: 'Controle preditivo',
    description: 'O sistema alerta sobre materiais pendentes antes que a etapa comece, evitando paralisações.',
  },
  {
    icon: BotMessageSquare,
    title: 'BuildAssist IA',
    description: 'Seu assistente inteligente sugere otimizações, alerta sobre clima e monitora suprimentos.',
  },
]

function OnboardingContent() {
  const router = useRouter()
  const { currentProfile, setCurrentProfile } = useProfile()
  const supabase = createClient()
  const [dontShow, setDontShow] = useState(false)

  async function handleContinue() {
    if (dontShow && currentProfile) {
      await supabase
        .from('profiles')
        .update({ onboarding_done: true })
        .eq('id', currentProfile.id)
      setCurrentProfile({ ...currentProfile, onboarding_done: true })
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-2xl animate-enter">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text-primary)' }}>
            Bem-vindo ao BuildSmart AI
          </h1>
          {currentProfile && (
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              Olá, <strong style={{ color: 'var(--text-primary)' }}>{currentProfile.name}</strong>! Veja como o sistema funciona:
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {STEPS.map(({ icon: Icon, title, description }, i) => (
            <div
              key={i}
              className="card p-6 text-center animate-enter"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(59,123,248,0.15)' }}>
                <Icon size={24} style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => setDontShow(!dontShow)}
            className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {dontShow
              ? <CheckSquare size={18} style={{ color: 'var(--accent)' }} />
              : <Square size={18} />
            }
            Não exibir novamente
          </button>

          <button
            onClick={handleContinue}
            className="btn-primary px-8 py-3 text-base"
          >
            Começar a usar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return <OnboardingContent />
}
