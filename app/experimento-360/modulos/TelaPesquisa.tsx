'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProcessContext } from '@/lib/processo/context'
import { criarOportunidadeDoProcesso, obterOportunidadeDoProcesso } from '@/lib/investidor-oportunidade'
import { obterProcesso } from '@/lib/processo'
import { registrarDecisao } from '@/lib/investidor'
import { ProspeccaoFicha } from '@/components/investidor/ProspeccaoFicha'
import { ProspeccaoEvidencias } from '@/components/investidor/ProspeccaoEvidencias'
import { ProspeccaoMercado } from '@/components/investidor/ProspeccaoMercado'
import { ProspeccaoCenarios } from '@/components/investidor/ProspeccaoCenarios'
import { resultadoCenarioValido } from '@/lib/investidor-calculadora'
import { formatCurrency } from '@/lib/utils'
import type { Prospeccao, ProspeccaoCenario, ProspeccaoFase } from '@/lib/types'
import { Carregando, SubAbas, Vazio, Voltar } from './comuns'

// Pesquisa = o funil do Investidor reaproveitado inteiro: Imóvel →
// Pesquisa de mercado → Viabilidade → Decidir. Os quatro passos usam os
// mesmos componentes de /investidor/[id] e o mesmo motor de cálculo
// (lib/investidor-calculadora.ts). Nada de regra de negócio é reescrito
// aqui: esta tela só escolhe a prospecção e organiza a navegação dentro da
// camada glass.

const FASE_META: Record<ProspeccaoFase, { label: string; color: string }> = {
  nova: { label: 'Nova', color: '#94a3b8' },
  em_analise: { label: 'Em análise', color: '#58a8ff' },
  aprovada: { label: 'Aprovada', color: '#10b981' },
  em_disputa: { label: 'Em negociação', color: '#f59e0b' },
  adquirida: { label: 'Adquirida', color: '#a78bfa' },
  descartada: { label: 'Descartada', color: '#ef4444' },
  nao_adquirida: { label: 'Não adquirida', color: '#94a3b8' },
}
const FASES: ProspeccaoFase[] = ['nova', 'em_analise', 'aprovada', 'em_disputa', 'adquirida', 'descartada', 'nao_adquirida']

const STATUS_FICHA_LABEL = { pendente: 'Ficha pendente', parcial: 'Ficha parcial', validada: 'Ficha validada' } as const

type PassoPesquisa = 'ficha' | 'mercado' | 'viabilidade' | 'decisao'
type FichaResumo = { status: keyof typeof STATUS_FICHA_LABEL } | null
type MercadoResumo = { faixa_base: number | null } | null

// Tellus R01/C2 — o Processo é o núcleo único. Esta tela roda SEMPRE dentro de
// um Processo (Sistema.tsx envolve todo módulo em <ProcessProvider>). A Pesquisa
// abre DIRETO a oportunidade daquele Processo: find-or-create em silêncio,
// seedada pelo nome/endereço do próprio Processo. NÃO existe mais a tela
// "Este Processo ainda não tem um imóvel. Crie o dele" nem lista de vínculo —
// o usuário nunca precisa criar um segundo objeto principal. O vínculo 1:1
// continua sendo o de lib/investidor-oportunidade.ts (Seção B), sem duplicar.
export function TelaPesquisa() {
  const { processoId } = useProcessContext()
  const supabase = useMemo(() => createClient(), [])
  const [oportunidade, setOportunidade] = useState<Prospeccao | null | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        let atual = await obterOportunidadeDoProcesso(supabase, processoId)
        if (!atual) {
          // Nasce automaticamente com o Processo. O índice único parcial no
          // banco garante 1:1; numa corrida, reaproveitamos a existente.
          const proc = await obterProcesso(supabase, processoId)
          try {
            atual = await criarOportunidadeDoProcesso(
              supabase,
              processoId,
              proc?.nome?.trim() || 'Oportunidade',
              proc?.endereco ?? null,
            )
          } catch {
            atual = await obterOportunidadeDoProcesso(supabase, processoId)
          }
        }
        if (!vivo) return
        if (!atual) { setErro('Não foi possível abrir a oportunidade deste Processo.'); return }
        setOportunidade(atual)
      } catch (e) {
        if (!vivo) return
        setErro(e instanceof Error ? e.message : 'Não consegui abrir a oportunidade deste Processo.')
      }
    })()
    return () => { vivo = false }
  }, [supabase, processoId])

  if (erro && !oportunidade) return <Vazio titulo="Não foi possível abrir a Pesquisa" descricao={erro} />
  if (!oportunidade) return <Carregando texto="Abrindo a oportunidade do Processo…" />
  return <Detalhe prospeccaoId={oportunidade.id} />
}

function Detalhe({ prospeccaoId, onVoltar, rotuloVoltar = 'Voltar' }: {
  prospeccaoId: string
  // Opcional: a Pesquisa do Processo abre a oportunidade direto, sem "voltar
  // para a lista" (não há lista). Só mostra o botão quando um caller pede.
  onVoltar?: () => void
  rotuloVoltar?: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [passo, setPasso] = useState<PassoPesquisa>('ficha')
  const [prospeccao, setProspeccao] = useState<Prospeccao | null>(null)
  const [cenarios, setCenarios] = useState<ProspeccaoCenario[]>([])
  const [ficha, setFicha] = useState<FichaResumo>(null)
  const [mercado, setMercado] = useState<MercadoResumo>(null)
  const [carregando, setCarregando] = useState(true)

  // Mesma carga de /investidor/[id]: prospecção + cenários + resumo da ficha
  // + última análise de mercado. O veredito da Decisão depende dos três.
  const carregar = useCallback(async () => {
    const [{ data: p }, { data: c }, { data: f }, { data: analises }] = await Promise.all([
      supabase.from('prospeccoes').select('*').eq('id', prospeccaoId).single(),
      supabase.from('prospeccao_cenarios').select('*').eq('prospeccao_id', prospeccaoId).order('created_at'),
      supabase.from('prospeccao_ficha').select('status').eq('prospeccao_id', prospeccaoId).maybeSingle(),
      supabase.from('prospeccao_analises_mercado').select('faixa_base').eq('prospeccao_id', prospeccaoId).order('created_at', { ascending: false }).limit(1),
    ])
    setProspeccao((p as Prospeccao | null) ?? null)
    setCenarios((c ?? []) as ProspeccaoCenario[])
    setFicha((f as FichaResumo) ?? null)
    setMercado((analises?.[0] as MercadoResumo) ?? null)
    setCarregando(false)
  }, [supabase, prospeccaoId])

  useEffect(() => {
    const t = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(t)
  }, [carregar])

  // A Luiza pode alterar a prospecção fora desta tela — mesmo evento que
  // /investidor/[id] escuta.
  useEffect(() => {
    const aoMudar = () => { void carregar() }
    window.addEventListener('buildsmart:investidor-changed', aoMudar)
    return () => window.removeEventListener('buildsmart:investidor-changed', aoMudar)
  }, [carregar])

  if (carregando) return <Carregando texto="Carregando oportunidade…" />
  if (!prospeccao) {
    return <Vazio titulo="Oportunidade não encontrada" descricao="Ela pode ter sido excluída." />
  }

  return (
    <div className="flex flex-col gap-4">
      {onVoltar ? (
        <Voltar
          rotulo={rotuloVoltar}
          onVoltar={onVoltar}
          titulo={prospeccao.nome}
          subtitulo={prospeccao.endereco}
        />
      ) : (
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-cyan-200/50">Oportunidade do Processo</div>
          <div className="truncate text-[17px] font-semibold text-white/92">{prospeccao.nome}</div>
          {prospeccao.endereco && <div className="truncate text-[12.5px] text-white/50">{prospeccao.endereco}</div>}
        </div>
      )}

      <SubAbas
        valor={passo}
        onMudar={setPasso}
        abas={[
          { id: 'ficha', rotulo: 'Imóvel' },
          { id: 'mercado', rotulo: 'Pesquisa de mercado' },
          { id: 'viabilidade', rotulo: 'Viabilidade' },
          { id: 'decisao', rotulo: 'Decisão' },
        ]}
      />

      {passo === 'ficha' && (
        <div className="flex flex-col gap-4">
          <ProspeccaoFicha
            prospeccaoId={prospeccaoId}
            linkLeilao={prospeccao.link_leilao}
            tipoAquisicao={prospeccao.tipo_aquisicao}
          />
          <ProspeccaoEvidencias prospeccaoId={prospeccaoId} />
        </div>
      )}

      {passo === 'mercado' && <ProspeccaoMercado prospeccaoId={prospeccaoId} />}

      {passo === 'viabilidade' && (
        <ProspeccaoCenarios
          prospeccaoId={prospeccaoId}
          cenarios={cenarios}
          tipoAquisicao={prospeccao.tipo_aquisicao}
          onChanged={carregar}
        />
      )}

      {passo === 'decisao' && (
        <Decisao
          prospeccao={prospeccao}
          principal={cenarios.find(c => c.principal)}
          ficha={ficha}
          mercado={mercado}
          onIr={setPasso}
          onSalvo={carregar}
        />
      )}
    </div>
  )
}

// Veredito agregado + registro da decisão (mudar a fase). Mesma semântica do
// "Decidir" de /investidor/[id]: cada coluna só fica OK quando o passo
// anterior do funil está completo, e a decisão só é liberada com os três
// prontos. Conversão em Ativo e exclusão continuam só na tela completa do
// Investidor — as duas navegam para fora e não cabem nesta camada.
function Decisao({ prospeccao, principal, ficha, mercado, onIr, onSalvo }: {
  prospeccao: Prospeccao
  principal?: ProspeccaoCenario
  ficha: FichaResumo
  mercado: MercadoResumo
  onIr: (p: PassoPesquisa) => void
  onSalvo: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const fichaOk = ficha?.status === 'validada'
  const mercadoOk = mercado?.faixa_base != null
  const temResultado = !!(principal && resultadoCenarioValido(principal))
  const pronto = fichaOk && mercadoOk && temResultado

  async function decidir(fase: ProspeccaoFase) {
    setSalvando(true)
    setErro('')
    // Decisão é a escrita "exclusivamente humana" do fluxo (Seção D): parte de
    // um clique humano, roteada pela Action do domínio em vez de update solto.
    try {
      await registrarDecisao(supabase, { prospeccaoId: prospeccao.id, fase })
    } catch {
      setSalvando(false)
      setErro('Não foi possível registrar a decisão agora.')
      return
    }
    setSalvando(false)
    onSalvo()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 backdrop-blur-md">
        <p className="mb-3 text-[10.5px] uppercase tracking-[0.16em] text-cyan-200/50">
          Pesquisar → Encontrar resultados → Analisar → Decidir
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Veredito
            rotulo="Imóvel"
            valor={ficha ? STATUS_FICHA_LABEL[ficha.status] : 'Sem ficha ainda'}
            ok={fichaOk}
            onIr={!fichaOk ? () => onIr('ficha') : undefined}
          />
          <Veredito
            rotulo="Pesquisa de mercado"
            valor={mercado?.faixa_base != null ? formatCurrency(mercado.faixa_base) : 'Ainda não analisado'}
            ok={mercadoOk}
            onIr={!mercadoOk ? () => onIr('mercado') : undefined}
          />
          <Veredito
            rotulo="Viabilidade"
            valor={temResultado
              ? `${principal!.rentabilidade!.toFixed(1)}% · ${formatCurrency(principal!.lucro!)}`
              : 'Cenário incompleto'}
            ok={temResultado}
            positivo={temResultado ? (principal!.lucro ?? 0) >= 0 : undefined}
            onIr={!temResultado ? () => onIr('viabilidade') : undefined}
          />
          <Veredito rotulo="Fase" valor={FASE_META[prospeccao.fase].label} ok={prospeccao.fase === 'adquirida'} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 backdrop-blur-md">
        <h3 className="text-[15px] font-semibold text-white/90">Decisão</h3>
        {!pronto ? (
          <p className="mt-2 text-[13px] leading-relaxed text-white/55">
            Complete Imóvel, Pesquisa de mercado e Viabilidade acima para registrar a decisão.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {FASES.map(f => {
              const on = prospeccao.fase === f
              return (
                <button
                  key={f}
                  type="button"
                  disabled={salvando || on}
                  onClick={() => decidir(f)}
                  className={
                    'rounded-full border px-3 py-1.5 text-[12.5px] outline-none transition disabled:cursor-default ' +
                    (on ? 'text-white' : 'border-white/10 text-white/60 hover:border-cyan-200/30 hover:text-white/90')
                  }
                  style={on
                    ? { borderColor: `${FASE_META[f].color}66`, background: `${FASE_META[f].color}26` }
                    : undefined}
                >
                  {FASE_META[f].label}
                </button>
              )
            })}
          </div>
        )}
        {erro && <p className="mt-3 text-[12.5px] text-red-300/85">{erro}</p>}
        <p className="mt-3 text-[12px] leading-relaxed text-white/38">
          Converter em Ativo e excluir continuam no Investidor completo — as duas
          ações saem desta tela.
        </p>
      </div>
    </div>
  )
}

function Veredito({ rotulo, valor, ok, positivo, onIr }: {
  rotulo: string
  valor: string
  ok: boolean
  positivo?: boolean
  onIr?: () => void
}) {
  const cor = positivo === undefined ? (ok ? '#10b981' : 'rgba(255,255,255,0.55)') : positivo ? '#10b981' : '#ef4444'
  const conteudo = (
    <>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-cyan-200/50">{rotulo}</div>
      <div className="mt-1 text-[13.5px] font-semibold" style={{ color: cor }}>{valor}</div>
      {onIr && <div className="mt-1 text-[11.5px] text-cyan-200/70">Completar →</div>}
    </>
  )
  const classe = 'rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left'
  return onIr
    ? <button type="button" onClick={onIr} className={`${classe} outline-none transition hover:border-cyan-200/30 hover:bg-white/[0.06]`}>{conteudo}</button>
    : <div className={classe}>{conteudo}</div>
}
