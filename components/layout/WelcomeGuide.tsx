'use client'

import { useEffect, useState } from 'react'
import { BotMessageSquare, CalendarDays, CheckSquare, FileText, HardHat, Package, Square } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useProfile } from '@/lib/profile-context'

const STORAGE_KEY = 'buildsmart-welcome-hidden'

const STEPS = [
  {
    icon: HardHat,
    title: 'Obras',
    description: 'A obra é o centro do sistema. Entre nela para ver orçamento, cronograma, materiais, diário e arquivos.',
  },
  {
    icon: FileText,
    title: 'Orçamento',
    description: 'Monte itens por etapa e subetapa. As composições geram materiais sugeridos automaticamente.',
  },
  {
    icon: Package,
    title: 'Materiais',
    description: 'A lista de compras nasce do orçamento e pode ser organizada por etapa, subetapa e fornecedor.',
  },
  {
    icon: CalendarDays,
    title: 'Cronograma',
    description: 'Acompanhe etapas no Gantt e registre avanço no Diário / Medições.',
  },
  {
    icon: BotMessageSquare,
    title: 'Luizia',
    description: 'A IA fica disponível no botão flutuante e na tela BuildAssistente IA para tirar dúvidas e sugerir próximos passos.',
  },
]

export function WelcomeGuide() {
  const { currentProfile } = useProfile()
  const [open, setOpen] = useState(false)
  const [dontShow, setDontShow] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setOpen(localStorage.getItem(STORAGE_KEY) !== 'true')
  }, [])

  function close() {
    if (dontShow && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    setOpen(false)
  }

  const item = STEPS[step]
  const Icon = item.icon

  return (
    <Modal open={open} onClose={close} title={`Bem-vindo, ${currentProfile?.name || 'usuário'}`} size="lg">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,123,248,0.14)', color: 'var(--accent)' }}>
            <Icon size={24} />
          </div>
          <div>
            <p className="text-xs font-bold tracking-wider mb-1" style={{ color: 'var(--accent)' }}>
              PASSO {step + 1} DE {STEPS.length}
            </p>
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              {item.title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {item.description}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {STEPS.map((s, index) => (
            <button
              key={s.title}
              onClick={() => setStep(index)}
              className="h-2 rounded-full transition-colors"
              style={{ background: index === step ? 'var(--accent)' : 'var(--border)' }}
              title={s.title}
            />
          ))}
        </div>

        <div className="rounded-lg p-4" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            Caminho simples: crie ou escolha uma obra, monte o orçamento, confira os materiais, acompanhe o cronograma e peça ajuda para a Luizia quando quiser prever o próximo passo.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setDontShow(v => !v)}
            className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {dontShow ? <CheckSquare size={18} style={{ color: 'var(--accent)' }} /> : <Square size={18} />}
            Não mostrar de novo
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button className="btn-secondary px-4 py-2" onClick={() => setStep(s => s - 1)}>
                Voltar
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button className="btn-primary px-4 py-2" onClick={() => setStep(s => s + 1)}>
                Avançar
              </button>
            ) : (
              <button className="btn-primary px-4 py-2" onClick={close}>
                Começar
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
