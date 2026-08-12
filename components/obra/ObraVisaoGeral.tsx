'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Obra, Etapa, Fornecedor, ObraFornecedor } from '@/lib/types'
import { formatDate, STATUS_OBRA_LABEL } from '@/lib/utils'
import { HardHat, TrendingUp, Truck, Pencil, FileText } from 'lucide-react'
import Link from 'next/link'

const GRUPO_LABEL: Record<ObraFornecedor['grupo'], string> = {
  mao_de_obra: 'Mão de obra',
  demais: 'Demais (materiais, equipamentos e serviços)',
}

type OrcamentoResumo = { id: string; nome: string | null; versao: number; status: string; bdi_percentual: number }

export function ObraVisaoGeral({ obra, onEdit }: { obra: Obra; onEdit: () => void }) {
  const supabase = createClient()
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [vinculos, setVinculos] = useState<ObraFornecedor[]>([])
  const [orcamentos, setOrcamentos] = useState<OrcamentoResumo[]>([])
  const [loadingExtra, setLoadingExtra] = useState(true)
  const [pendente, setPendente] = useState<string | null>(null)
  const [agora, setAgora] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoadingExtra(true)
      const [etapasRes, fornecedoresRes, vinculosRes, orcRes] = await Promise.all([
        supabase.from('etapas').select('*').eq('obra_id', obra.id),
        supabase.from('fornecedores').select('*').or(`obra_id.is.null,obra_id.eq.${obra.id}`).order('nome'),
        supabase.from('obra_fornecedores').select('*, fornecedor:fornecedores(*)').eq('obra_id', obra.id),
        supabase.from('orcamentos').select('id, nome, versao, status, bdi_percentual').eq('obra_id', obra.id).neq('status', 'arquivado').order('versao', { ascending: false }),
      ])
      if (!active) return
      setEtapas((etapasRes.data || []) as Etapa[])
      setFornecedores((fornecedoresRes.data || []) as Fornecedor[])
      setVinculos((vinculosRes.data || []) as ObraFornecedor[])
      setOrcamentos((orcRes.data || []) as OrcamentoResumo[])
      setAgora(Date.now())
      setLoadingExtra(false)
    }
    load()
    return () => { active = false }
  }, [obra.id])

  async function toggleVinculo(fornecedorId: string, grupo: ObraFornecedor['grupo']) {
    const chave = `${fornecedorId}-${grupo}`
    const existente = vinculos.find(v => v.fornecedor_id === fornecedorId && v.grupo === grupo)
    setPendente(chave)
    if (existente) {
      await supabase.from('obra_fornecedores').delete().eq('id', existente.id)
      setVinculos(prev => prev.filter(v => v.id !== existente.id))
    } else {
      const { data } = await supabase
        .from('obra_fornecedores')
        .insert({ obra_id: obra.id, fornecedor_id: fornecedorId, grupo })
        .select('*, fornecedor:fornecedores(*)')
        .single()
      if (data) setVinculos(prev => [...prev, data as ObraFornecedor])
    }
    setPendente(null)
  }

  const totalEtapas = etapas.length
  const concluidas = etapas.filter(e => e.status === 'concluida').length
  const percentualConcluido = totalEtapas > 0 ? Math.round((concluidas / totalEtapas) * 100) : 0

  let tendencia: { texto: string; cor: string } | null = null
  if (agora != null && obra.data_inicio && obra.data_previsao) {
    const inicio = new Date(`${obra.data_inicio}T00:00:00`).getTime()
    const fim = new Date(`${obra.data_previsao}T00:00:00`).getTime()
    const totalMs = fim - inicio
    if (totalMs > 0) {
      const percentualTempo = Math.min(100, Math.max(0, Math.round(((agora - inicio) / totalMs) * 100)))
      const diferenca = percentualConcluido - percentualTempo
      if (diferenca >= 8) {
        tendencia = { texto: 'Adiantada em relação ao prazo previsto', cor: 'var(--success)' }
      } else if (diferenca <= -10) {
        tendencia = { texto: 'Atenção: ritmo abaixo do esperado para o prazo', cor: 'var(--danger)' }
      } else {
        tendencia = { texto: 'Dentro do ritmo esperado para o prazo', cor: 'var(--accent)' }
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Informações da Obra</h2>
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Pencil size={13} /> Editar
            </button>
          </div>
          <dl className="flex flex-col gap-3">
            {[
              { label: 'Nome', value: obra.nome },
              { label: 'Endereço', value: obra.endereco || '—' },
              { label: 'Responsável', value: obra.responsavel || '—' },
              { label: 'Status', value: STATUS_OBRA_LABEL[obra.status] },
              { label: 'Data de início', value: formatDate(obra.data_inicio) },
              { label: 'Previsão de conclusão', value: formatDate(obra.data_previsao) },
              { label: 'Área construída', value: obra.area_m2 ? `${obra.area_m2} m²` : '—' },
              { label: 'UF (preços SINAPI)', value: obra.uf || '—' },
              { label: 'Criado em', value: formatDate(obra.created_at) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <dt style={{ color: 'var(--text-secondary)' }}>{label}</dt>
                <dd className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,123,248,0.15)' }}>
              <HardHat size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Obra em andamento</h2>
          </div>

          {totalEtapas === 0 ? (
            <p className="text-sm flex-1 flex items-center" style={{ color: 'var(--text-secondary)' }}>
              Cadastre etapas no Cronograma para acompanhar o andamento previsto desta obra.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5 text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Etapas concluídas</span>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{concluidas} de {totalEtapas} ({percentualConcluido}%)</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${percentualConcluido}%`, background: 'var(--accent)' }} />
                </div>
              </div>

              {tendencia && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <TrendingUp size={16} className="mt-0.5 flex-shrink-0" style={{ color: tendencia.cor }} />
                  <p className="text-sm" style={{ color: tendencia.cor }}>{tendencia.texto}</p>
                </div>
              )}

              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Use as abas acima para gerenciar orçamento, cronograma, compras e medições.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Orçamento da obra</h2>
          </div>
        </div>

        {orcamentos.length === 0 ? (
          <p className="text-sm py-3" style={{ color: 'var(--text-secondary)' }}>
            Esta obra ainda não possui orçamento operacional. Inicie a obra a partir de um orçamento.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {orcamentos.slice(0, 1).map(orc => (
              <Link
                key={orc.id}
                href={`/orcamentos/${orc.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                style={{ border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-3">
                  <FileText size={16} style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {orc.nome || `Orçamento v${orc.versao}`}
                    </span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-secondary)' }}>
                      BDI {orc.bdi_percentual}%
                    </span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  orc.status === 'ativo' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : orc.status === 'finalizado' ? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }`}>
                  {orc.status === 'ativo' ? 'Ativo' : orc.status === 'finalizado' ? 'Finalizado' : 'Em projeto'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Truck size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Fornecedores vinculados a esta obra</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Selecione, em cada grupo, os fornecedores que atuam nesta obra. O vínculo ajuda a IA a sugerir contatos certos por contexto.
        </p>

        {loadingExtra ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : fornecedores.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            Cadastre fornecedores na aba Fornecedores para poder vinculá-los a esta obra.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['mao_de_obra', 'demais'] as ObraFornecedor['grupo'][]).map(grupo => (
              <div key={grupo} className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
                <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{GRUPO_LABEL[grupo]}</p>
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
                  {fornecedores.map(fornecedor => {
                    const chave = `${fornecedor.id}-${grupo}`
                    const marcado = vinculos.some(v => v.fornecedor_id === fornecedor.id && v.grupo === grupo)
                    return (
                      <label
                        key={fornecedor.id}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm cursor-pointer select-none transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={pendente === chave}
                          onChange={() => toggleVinculo(fornecedor.id, grupo)}
                          className="w-4 h-4 rounded flex-shrink-0"
                        />
                        <span className="truncate">
                          {fornecedor.nome}
                          {fornecedor.apelido && <span style={{ color: 'var(--text-secondary)' }}> · {fornecedor.apelido}</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
