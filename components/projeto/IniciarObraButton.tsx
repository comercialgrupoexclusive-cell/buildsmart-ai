'use client'

import { useState } from 'react'
import { Rocket, Loader2, Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { iniciarObraPorOrcamento } from '@/lib/project-cycle'
import { Modal } from '@/components/ui/Modal'

type OrcamentoOpcao = { id: string; nome: string | null; versao: number; is_principal: boolean }

export function IniciarObraButton({ projetoId, className, style }: { projetoId: string; className?: string; style?: React.CSSProperties }) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [opcoes, setOpcoes] = useState<OrcamentoOpcao[] | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleClick() {
    setLoading(true)
    setErro('')
    try {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('id, nome, versao, is_principal')
        .eq('projeto_id', projetoId)
        .order('is_principal', { ascending: false })
      if (error) throw error
      const lista = (data || []) as OrcamentoOpcao[]
      if (lista.length === 0) {
        alert('Nenhum orçamento encontrado para este projeto.')
        return
      }
      if (lista.length === 1) {
        await confirmarInicio(lista[0].id)
      } else {
        setOpcoes(lista)
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao carregar orçamentos')
    } finally {
      setLoading(false)
    }
  }

  async function confirmarInicio(orcamentoId: string) {
    if (!confirm('Iniciar a obra com este orçamento?\n\nO orçamento e o planejamento atuais viram a linha de base (baseline) da obra — continuam editáveis normalmente depois, mas a baseline fica preservada para comparação futura.')) return
    setIniciando(true)
    setErro('')
    try {
      const resultado = await iniciarObraPorOrcamento(supabase, orcamentoId)
      if (resultado.obra_id) router.push(`/obras/${resultado.obra_id}`)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao iniciar obra')
    } finally {
      setIniciando(false)
    }
  }

  return (
    <>
      <button onClick={handleClick} disabled={loading} className={className} style={style}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
        {loading ? 'Carregando...' : 'Iniciar Obra'}
      </button>

      <Modal open={!!opcoes} onClose={() => !iniciando && setOpcoes(null)} title="Qual orçamento vira a obra?" size="md">
        <div className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Este projeto tem mais de um orçamento. Escolha qual vira o orçamento operacional da obra — ele e seu planejamento viram a baseline (linha de base).
          </p>
          <div className="flex flex-col gap-2">
            {opcoes?.map(o => (
              <button
                key={o.id}
                onClick={() => confirmarInicio(o.id)}
                disabled={iniciando}
                className="flex items-center gap-2 text-left rounded-lg px-4 py-3 border transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
              >
                {o.is_principal && <Star size={14} style={{ color: 'var(--accent)' }} />}
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {o.nome || `Orçamento v${o.versao}`}
                </span>
                {iniciando && <Loader2 size={14} className="animate-spin ml-auto" style={{ color: 'var(--text-secondary)' }} />}
              </button>
            ))}
          </div>
          {erro && <p className="text-xs" style={{ color: 'var(--danger)' }}>{erro}</p>}
        </div>
      </Modal>
    </>
  )
}
