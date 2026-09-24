'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, ChevronDown, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  criarOportunidadeDoProcesso,
  obterOportunidadeDoProcesso,
} from '@/lib/investidor-oportunidade'
import type { Prospeccao } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { ImovelCampos, IMOVEL_VAZIO, type DadosImovel } from './ImovelCampos'

// Bloco "+ Dados do imóvel" da Visão Geral. Fica fechado por padrão: um
// Processo que não é de aquisição nunca precisa ver estes campos, e abrir
// tudo de uma vez era justamente o que poluía a tela.

export function ProcessoImovelBloco({ processoId, processoNome }: {
  processoId: string
  processoNome: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [aberto, setAberto] = useState(false)
  const [imovel, setImovel] = useState<Prospeccao | null | undefined>(undefined)
  const [form, setForm] = useState<DadosImovel>(IMOVEL_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const atual = await obterOportunidadeDoProcesso(supabase, processoId)
      setImovel(atual)
      if (atual) {
        setForm({
          endereco: atual.endereco ?? '',
          link_leilao: atual.link_leilao ?? '',
          data_leilao: atual.data_leilao ?? '',
          tipo_aquisicao: atual.tipo_aquisicao ?? 'leilao',
        })
      }
    } catch {
      setImovel(null)
    }
  }, [supabase, processoId])

  useEffect(() => {
    if (!aberto) return
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [aberto, carregar])

  async function salvar() {
    if (salvando) return
    setErro('')
    setSalvo(false)
    setSalvando(true)
    try {
      let alvo = imovel
      if (!alvo) {
        alvo = await criarOportunidadeDoProcesso(supabase, processoId, processoNome, form.endereco || null)
        setImovel(alvo)
      }
      const { error } = await supabase
        .from('prospeccoes')
        .update({
          endereco: form.endereco.trim() || null,
          link_leilao: form.link_leilao.trim() || null,
          data_leilao: form.data_leilao || null,
          tipo_aquisicao: form.tipo_aquisicao,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alvo.id)
      if (error) throw error
      setSalvo(true)
    } catch {
      setErro('Não foi possível salvar os dados do imóvel.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="flex items-center gap-2">
          {aberto ? <Building2 size={16} style={{ color: 'var(--accent)' }} /> : <Plus size={16} style={{ color: 'var(--text-secondary)' }} />}
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Dados do imóvel</span>
        </span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--text-secondary)',
            transform: aberto ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {aberto && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
          {imovel === undefined ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            </div>
          ) : (
            <div className="pt-4 space-y-4">
              <ImovelCampos valor={form} onChange={setForm} desabilitado={salvando} />

              {erro && <p className="text-xs" style={{ color: '#f87171' }}>{erro}</p>}
              {salvo && !erro && <p className="text-xs" style={{ color: '#10b981' }}>Salvo.</p>}

              <div className="flex justify-end">
                <Button size="sm" onClick={() => void salvar()} loading={salvando}>Salvar imóvel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
