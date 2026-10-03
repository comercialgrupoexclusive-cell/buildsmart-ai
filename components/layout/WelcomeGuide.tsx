'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, BotMessageSquare, CalendarDays, CheckSquare,
  FileText, HardHat, Monitor, Moon, Package, Square, Sun,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useProfile } from '@/lib/profile-context'
import { useAssistenteNome } from '@/lib/organizacao/contexto'
import { oAssistente } from '@/lib/organizacao/branding'

const STORAGE_KEY = 'buildsmart-welcome-hidden'

// Falas do assistente: sem nome nem gênero fixos, porque cada organização
// escolhe como chamar o seu assistente.
const FALAS_DO_ASSISTENTE = [
  'Fico no chat aqui embaixo. Pode perguntar simples, do seu jeito, que eu tento organizar a resposta sem enrolar.',
  'Quando bater aquela dúvida de obra, é só me chamar. Eu ajudo a olhar orçamento, compras, cronograma e próximos passos.',
  'Sou sua IA de apoio. Não salvo nada por conta própria ainda, mas ajudo você a pensar, revisar e decidir com mais clareza.',
]

const PASSOS_BASE = [
  {
    icon: AlertTriangle,
    title: 'Sistema beta',
    description: 'Esta é uma versão local de testes. Use para validar fluxo, orçamento, materiais e IA antes de colocar dados reais importantes.',
  },
  {
    icon: Monitor,
    title: 'Melhor no desktop',
    description: 'O menu já funciona em celular e tablet (botão ☰ no topo). Para orçamentos, Gantt e tabelas grandes, o notebook ainda fica mais confortável.',
  },
  {
    icon: Sun,
    secondIcon: Moon,
    title: 'Tema claro ou escuro',
    description: 'Use o botão de sol/lua no topo para alternar o visual. Escolha o modo mais confortável para trabalhar.',
  },
  {
    icon: HardHat,
    title: 'Obras',
    description: 'A obra é o centro do sistema. Dentro dela ficam orçamento, cronograma, materiais, diário, medições e arquivos.',
  },
  {
    icon: FileText,
    title: 'Orçamento e materiais',
    description: 'Monte itens por etapa e subetapa. As composições sugerem materiais para compras automaticamente.',
  },
  {
    icon: CalendarDays,
    title: 'Cronograma',
    description: 'Acompanhe etapas no Gantt e registre avanço no Diário / Medições.',
  },
]

// O último passo apresenta o assistente com o nome que a organização escolheu.
function passosDe(assistente: string) {
  return [
    ...PASSOS_BASE,
    {
      icon: BotMessageSquare,
      title: assistente,
      description: `Oi, eu sou ${oAssistente(assistente)}, seu apoio na obra. Ajudo a tirar dúvidas, organizar ideias e prever próximos passos sem complicar.`,
    },
  ]
}

export function WelcomeGuide() {
  const { currentProfile } = useProfile()
  const assistente = useAssistenteNome()
  const passos = useMemo(() => passosDe(assistente), [assistente])
  const [open, setOpen] = useState(false)
  const [dontShow, setDontShow] = useState(false)
  const [step, setStep] = useState(0)
  const falaDoAssistente = useMemo(
    () => FALAS_DO_ASSISTENTE[Math.floor(Math.random() * FALAS_DO_ASSISTENTE.length)],
    [],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hidden = localStorage.getItem(STORAGE_KEY) === 'true'
    setOpen(!hidden)
  }, [])

  function close() {
    if (dontShow && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    setOpen(false)
    if (step === passos.length - 1 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('buildsmart:open-luizia'))
    }
  }

  const item = passos[step]
  const Icon = item.icon
  const SecondIcon = 'secondIcon' in item ? item.secondIcon : null

  return (
    <Modal open={open} onClose={close} title={`Bem-vindo, ${currentProfile?.name || 'usuário'}`} size="lg">
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center gap-1 flex-shrink-0" style={{ background: 'rgba(59,123,248,0.14)', color: 'var(--accent)' }}>
            <Icon size={SecondIcon ? 20 : 24} />
            {SecondIcon && <SecondIcon size={18} />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wider mb-1" style={{ color: 'var(--accent)' }}>
              PASSO {step + 1} DE {passos.length}
            </p>
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              {item.title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {item.description}
            </p>
          </div>
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${passos.length}, minmax(0, 1fr))` }}>
          {passos.map((s, index) => (
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
            {step === passos.length - 1
              ? falaDoAssistente
              : `Fluxo básico: escolha uma obra, revise orçamento, confira materiais, acompanhe cronograma e use ${oAssistente(assistente)} quando quiser ajuda para decidir o próximo passo.`}
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
            {step < passos.length - 1 ? (
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
