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
import { ImovelCampos, IMOVEL_VAZIO, intOuNull, numOuNull, type DadosImovel } from './ImovelCampos'

// Bloco "+ Dados do imóvel" da Visão Geral. Fica fechado por padrão: um
// Processo que não é de aquisição nunca precisa ver estes campos, e abrir
// tudo de uma vez era justamente o que poluía a tela.

export function ProcessoImovelBloco({ processoId, processoNome, processoEndereco }: {
  processoId: string
  processoNome: string
  // Endereço único do Processo (Dados do processo). O imóvel não tem endereço
  // próprio: ele espelha o do Processo em prospeccoes para o Investidor.
  processoEndereco?: string | null
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
          link_leilao: atual.link_leilao ?? '',
          data_leilao: atual.data_leilao ?? '',
          tipo_aquisicao: atual.tipo_aquisicao ?? 'leilao',
          tipo_imovel: atual.tipo_imovel ?? '',
          dormitorios: atual.dormitorios != null ? String(atual.dormitorios) : '',
          suites: atual.suites != null ? String(atual.suites) : '',
          banheiros: atual.banheiros != null ? String(atual.banheiros) : '',
          vagas_garagem: atual.vagas_garagem != null ? String(atual.vagas_garagem) : '',
          area_util: atual.area_util != null ? String(atual.area_util) : '',
          area_total: atual.area_total != null ? String(atual.area_total) : '',
          andar: atual.andar != null ? String(atual.andar) : '',
          valor_condominio: atual.valor_condominio != null ? String(atual.valor_condominio) : '',
          valor_iptu: atual.valor_iptu != null ? String(atual.valor_iptu) : '',
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
        alvo = await criarOportunidadeDoProcesso(supabase, processoId, processoNome, processoEndereco || null)
        setImovel(alvo)
      }
      const { error } = await supabase
        .from('prospeccoes')
        .update({
          // Endereço espelha o do Processo (fonte única) — não há campo próprio.
          endereco: processoEndereco?.trim() || null,
          link_leilao: form.link_leilao.trim() || null,
          data_leilao: form.data_leilao || null,
          tipo_aquisicao: form.tipo_aquisicao,
          tipo_imovel: form.tipo_imovel || null,
          dormitorios: intOuNull(form.dormitorios),
          suites: intOuNull(form.suites),
          banheiros: intOuNull(form.banheiros),
          vagas_garagem: intOuNull(form.vagas_garagem),
          area_util: numOuNull(form.area_util),
          area_total: numOuNull(form.area_total),
          andar: intOuNull(form.andar),
          valor_condominio: numOuNull(form.valor_condominio),
          valor_iptu: numOuNull(form.valor_iptu),
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
